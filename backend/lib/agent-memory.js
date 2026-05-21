/**
 * agent-memory — per-user, per-agent-model memory for Agent mode.
 *
 * Mirrors companion-memory but on a separate AGENT# SK namespace so agent
 * task context (short-lived, tool-call heavy) doesn't pollute the long-lived
 * companion identity memory.
 *
 * DynamoDB schema:
 *   pk = USER#{userId}
 *   sk = AGENT#{modelId}                    → agent state record
 *   sk = AGENT#{modelId}#MSG#{timestamp13}  → individual agent turn message
 *
 * State record shape:
 *   { pk, sk, summary?: string, turnCount: number, updatedAt: number }
 *
 * Message item shape:
 *   { pk, sk, role: "user"|"assistant", content: string,
 *     toolCalls?: Array<{name, args, result}>, createdAt: number }
 *
 * Rolling summary: when turnCount > SUMMARY_THRESHOLD, the oldest messages are
 * condensed into a short summary and deleted.
 */

const {
  buildMediaPk,
  buildAgentStateSk,
  buildAgentMsgSk,
  agentMsgPrefix,
} = require("./keys");

const SUMMARY_THRESHOLD = 30;
const MAX_HISTORY_LOAD = 16;
const COMPACT_WINDOW = 20;

/**
 * Factory — returns the agent memory API bound to DynamoDB and Bedrock.
 *
 * @param {object} opts
 * @param {object} opts.dynamoClient
 * @param {string} opts.mediaTable
 * @param {function} opts.queryBySkPrefix
 * @param {object} opts.bedrockClient
 * @param {function} opts.InvokeModelCommand
 * @param {string} opts.promptHelperModelId
 */
function createAgentMemory({
  dynamoClient,
  mediaTable,
  queryBySkPrefix,
  bedrockClient,
  InvokeModelCommand,
  promptHelperModelId,
  // Optional — when wired, compaction summariser tokens roll into the user's
  // daily token cap. Without it the summariser is "free" relative to the cap,
  // letting a user racks up untracked spend at the 30/60/90/… turn markers.
  agentCost = null,
}) {
  if (!dynamoClient || !mediaTable) {
    return {
      loadMemory: async () => null,
      saveMessages: async () => {},
      updateSummary: async () => {},
      compactMemory: async () => {},
      clearMemory: async () => {},
      getMemoryStatus: async () => ({ hasMemory: false }),
      SUMMARY_THRESHOLD,
    };
  }

  const {
    PutCommand,
    DeleteCommand,
    GetCommand,
    UpdateCommand,
  } = require("@aws-sdk/lib-dynamodb");

  /**
   * Load the state record + last MAX_HISTORY_LOAD messages.
   */
  async function loadMemory(userId, modelId = "default") {
    const pk = buildMediaPk(userId);
    const stateSk = buildAgentStateSk(modelId);
    const prefix = agentMsgPrefix(modelId);

    const [stateRecord, messages] = await Promise.all([
      dynamoClient
        .send(new GetCommand({ TableName: mediaTable, Key: { pk, sk: stateSk } }))
        .catch(() => ({ Item: null })),
      queryBySkPrefix(pk, prefix, MAX_HISTORY_LOAD),
    ]);

    if (!stateRecord.Item && (!messages || messages.length === 0)) {
      return null;
    }

    return {
      summary: stateRecord.Item?.summary || null,
      turnCount: stateRecord.Item?.turnCount || 0,
      messages: (messages || []).map((m) => ({
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
        createdAt: m.createdAt,
      })),
    };
  }

  /**
   * Persist new turn(s). Each message can carry an optional toolCalls array.
   *
   * @param {string} userId
   * @param {string} modelId
   * @param {Array<{role, content, toolCalls?}>} newMessages
   */
  async function saveMessages(userId, modelId = "default", newMessages) {
    if (!newMessages || newMessages.length === 0) return;

    const pk = buildMediaPk(userId);
    const now = Date.now();

    const writes = newMessages.map((msg, i) => ({
      pk,
      sk: buildAgentMsgSk(modelId, now + i),
      role: msg.role,
      content: msg.content,
      ...(msg.toolCalls ? { toolCalls: msg.toolCalls } : {}),
      createdAt: now + i,
    }));

    try {
      await Promise.all(
        writes.map((item) =>
          dynamoClient.send(new PutCommand({ TableName: mediaTable, Item: item }))
        )
      );

      // Atomic increment — eliminates the read-modify-write race between
      // concurrent saveMessages calls. ADD on a missing attribute initialises
      // it to 0 first.
      await dynamoClient.send(
        new UpdateCommand({
          TableName: mediaTable,
          Key: { pk, sk: buildAgentStateSk(modelId) },
          UpdateExpression: "ADD turnCount :n SET updatedAt = :now",
          ExpressionAttributeValues: {
            ":n": newMessages.length,
            ":now": now,
          },
        })
      );
    } catch {
      // Silent — memory is best-effort
    }
  }

  /**
   * Overwrite the summary on the state record.
   */
  async function updateSummary(userId, modelId = "default", summary) {
    const pk = buildMediaPk(userId);
    const sk = buildAgentStateSk(modelId);
    const now = Date.now();

    try {
      const existing = await dynamoClient
        .send(new GetCommand({ TableName: mediaTable, Key: { pk, sk } }))
        .catch(() => ({ Item: null }));

      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: {
            pk,
            sk,
            summary,
            turnCount: existing.Item?.turnCount || 0,
            updatedAt: now,
          },
        })
      );
    } catch {
      // Silent
    }
  }

  /**
   * Compact the oldest COMPACT_WINDOW messages into a summary and delete them.
   *
   * Bills the summariser's input/output tokens to `agentCost` when wired so
   * the daily cap reflects real spend (compaction runs every ~30 turns and
   * was previously untracked).
   */
  async function compactMemory(userId, modelId = "default") {
    const pk = buildMediaPk(userId);
    const prefix = agentMsgPrefix(modelId);

    try {
      const oldMessages = await queryBySkPrefix(pk, prefix, COMPACT_WINDOW);
      if (!oldMessages || oldMessages.length < COMPACT_WINDOW / 2) return;

      const transcript = oldMessages
        .map((m) => `${m.role === "user" ? "User" : "Agent"}: ${m.content}`)
        .join("\n");

      const command = new InvokeModelCommand({
        modelId: promptHelperModelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 200,
          temperature: 0.3,
          system:
            "You are a memory summariser for an AI agent that creates images and stories on a user's behalf. Write 2-3 sentences capturing the user's preferences, recurring themes, and any pending intents from this transcript.",
          messages: [{ role: "user", content: [{ type: "text", text: transcript }] }],
        }),
      });

      const resp = await bedrockClient.send(command);
      const body = JSON.parse(new TextDecoder().decode(resp.body));
      const summary = (body?.content || [])
        .map((c) => c?.text)
        .filter(Boolean)
        .join("")
        .trim();

      // Record the summariser's token usage against the user's daily cap.
      // InvokeModel returns snake_case usage; tolerate either shape.
      if (agentCost?.record && userId) {
        const usage = body?.usage || {};
        const inputTokens = Number(usage.input_tokens ?? usage.inputTokens ?? 0);
        const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? 0);
        if (inputTokens || outputTokens) {
          agentCost.record(userId, { inputTokens, outputTokens }).catch(() => {});
        }
      }

      if (summary) {
        await updateSummary(userId, modelId, summary);
      }

      await Promise.all(
        oldMessages.map((item) =>
          dynamoClient
            .send(new DeleteCommand({ TableName: mediaTable, Key: { pk, sk: item.sk } }))
            .catch(() => {})
        )
      );
    } catch {
      // Silent
    }
  }

  /**
   * Delete all agent messages + the state record for a user/model pair.
   */
  async function clearMemory(userId, modelId = "default") {
    const pk = buildMediaPk(userId);
    const stateSk = buildAgentStateSk(modelId);
    const prefix = agentMsgPrefix(modelId);

    try {
      const allMessages = await queryBySkPrefix(pk, prefix, 200);
      await Promise.all([
        ...(allMessages || []).map((item) =>
          dynamoClient
            .send(new DeleteCommand({ TableName: mediaTable, Key: { pk, sk: item.sk } }))
            .catch(() => {})
        ),
        dynamoClient
          .send(new DeleteCommand({ TableName: mediaTable, Key: { pk, sk: stateSk } }))
          .catch(() => {}),
      ]);
    } catch {
      // Silent
    }
  }

  /**
   * Return lightweight memory status without loading messages.
   */
  async function getMemoryStatus(userId, modelId = "default") {
    const pk = buildMediaPk(userId);
    const stateSk = buildAgentStateSk(modelId);

    try {
      const result = await dynamoClient.send(
        new GetCommand({ TableName: mediaTable, Key: { pk, sk: stateSk } })
      );
      if (!result.Item) return { hasMemory: false };
      return { hasMemory: true, turnCount: result.Item.turnCount || 0 };
    } catch {
      return { hasMemory: false };
    }
  }

  return {
    loadMemory,
    saveMessages,
    updateSummary,
    compactMemory,
    clearMemory,
    getMemoryStatus,
    SUMMARY_THRESHOLD,
  };
}

module.exports = { createAgentMemory };
