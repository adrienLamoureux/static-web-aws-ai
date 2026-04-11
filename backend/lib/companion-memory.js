/**
 * companion-memory — per-user, per-model memory for the AI companion.
 *
 * DynamoDB schema:
 *   pk = USER#{userId}
 *   sk = COMPANION#{modelId}                    → memory record
 *   sk = COMPANION#{modelId}#MSG#{timestamp13}  → individual message turn
 *
 * Memory record shape:
 *   { pk, sk, summary?: string, turnCount: number, updatedAt: number }
 *
 * Message item shape:
 *   { pk, sk, role: "user"|"assistant", content: string, createdAt: number }
 *
 * Rolling summary:
 *   When turnCount > SUMMARY_THRESHOLD, the oldest messages are condensed
 *   into a short summary and deleted. This keeps storage bounded.
 */

const {
  buildMediaPk,
  buildCompanionMemorySk,
  buildCompanionMsgSk,
  companionMsgPrefix,
} = require("./keys");

const SUMMARY_THRESHOLD = 30; // compact when turnCount exceeds this
const MAX_HISTORY_LOAD  = 20; // how many messages to load for context
const COMPACT_WINDOW    = 20; // how many old messages to summarise + delete

/**
 * Factory — returns the companion memory API bound to DynamoDB and Bedrock.
 *
 * @param {object} opts
 * @param {object} opts.dynamoClient       — DynamoDBDocumentClient
 * @param {string} opts.mediaTable         — DynamoDB table name
 * @param {function} opts.queryBySkPrefix  — mediaStore.queryBySkPrefix
 * @param {object} opts.bedrockClient      — BedrockRuntimeClient
 * @param {function} opts.InvokeModelCommand
 * @param {string} opts.promptHelperModelId
 */
function createCompanionMemory({
  dynamoClient,
  mediaTable,
  queryBySkPrefix,
  bedrockClient,
  InvokeModelCommand,
  promptHelperModelId,
}) {
  if (!dynamoClient || !mediaTable) {
    // Return no-op stubs when DynamoDB is unavailable (local dev, tests)
    return {
      loadMemory:    async () => null,
      saveMessages:  async () => {},
      updateSummary: async () => {},
      compactMemory: async () => {},
      clearMemory:   async () => {},
      getMemoryStatus: async () => ({ hasMemory: false }),
    };
  }

  const { PutCommand, DeleteCommand } = (() => {
    // Pull DynamoDB commands lazily to avoid circular dep issues
    const lib = require("@aws-sdk/lib-dynamodb");
    return { PutCommand: lib.PutCommand, DeleteCommand: lib.DeleteCommand };
  })();

  /**
   * Load the memory record + last MAX_HISTORY_LOAD messages.
   * Returns null if no memory exists yet.
   */
  async function loadMemory(userId, modelId = "hiyori_free") {
    const pk = buildMediaPk(userId);
    const memSk = buildCompanionMemorySk(modelId);
    const msgPrefix = companionMsgPrefix(modelId);

    const [memRecord, messages] = await Promise.all([
      dynamoClient
        .send(
          new (require("@aws-sdk/lib-dynamodb").GetCommand)({
            TableName: mediaTable,
            Key: { pk, sk: memSk },
          })
        )
        .catch(() => ({ Item: null })),
      queryBySkPrefix(pk, msgPrefix, MAX_HISTORY_LOAD),
    ]);

    if (!memRecord.Item && (!messages || messages.length === 0)) {
      return null;
    }

    return {
      summary:    memRecord.Item?.summary || null,
      turnCount:  memRecord.Item?.turnCount || 0,
      messages:   (messages || []).map((m) => ({
        role:      m.role,
        content:   m.content,
        createdAt: m.createdAt,
      })),
    };
  }

  /**
   * Write new message turns to DynamoDB and update the memory record's
   * turnCount + updatedAt. Fire-and-forget friendly — errors are swallowed.
   *
   * @param {string} userId
   * @param {string} modelId
   * @param {Array<{role, content}>} newMessages
   */
  async function saveMessages(userId, modelId = "hiyori_free", newMessages) {
    if (!newMessages || newMessages.length === 0) return;

    const pk = buildMediaPk(userId);
    const now = Date.now();

    const writes = newMessages.map((msg, i) => ({
      pk,
      sk: buildCompanionMsgSk(modelId, now + i),
      role: msg.role,
      content: msg.content,
      createdAt: now + i,
    }));

    try {
      await Promise.all(
        writes.map((item) =>
          dynamoClient.send(
            new PutCommand({ TableName: mediaTable, Item: item })
          )
        )
      );

      // Fetch current turnCount to increment
      const memSk = buildCompanionMemorySk(modelId);
      const existing = await dynamoClient
        .send(
          new (require("@aws-sdk/lib-dynamodb").GetCommand)({
            TableName: mediaTable,
            Key: { pk, sk: memSk },
          })
        )
        .catch(() => ({ Item: null }));

      const currentCount = existing.Item?.turnCount || 0;
      const summary = existing.Item?.summary || null;

      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: {
            pk,
            sk: memSk,
            summary,
            turnCount: currentCount + newMessages.length,
            updatedAt: now,
          },
        })
      );
    } catch {
      // Silent — memory is best-effort
    }
  }

  /**
   * Overwrite the summary field on the memory record.
   */
  async function updateSummary(userId, modelId = "hiyori_free", summary) {
    const pk  = buildMediaPk(userId);
    const sk  = buildCompanionMemorySk(modelId);
    const now = Date.now();

    try {
      const existing = await dynamoClient
        .send(
          new (require("@aws-sdk/lib-dynamodb").GetCommand)({
            TableName: mediaTable,
            Key: { pk, sk },
          })
        )
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
   * When turnCount > SUMMARY_THRESHOLD: fetch the oldest COMPACT_WINDOW
   * messages, ask Haiku to summarise them, delete those messages from
   * DynamoDB, and persist the new summary.
   *
   * This should be called fire-and-forget (don't await in the request path).
   */
  async function compactMemory(userId, modelId = "hiyori_free") {
    const pk        = buildMediaPk(userId);
    const msgPrefix = companionMsgPrefix(modelId);

    try {
      const oldMessages = await queryBySkPrefix(pk, msgPrefix, COMPACT_WINDOW);
      if (!oldMessages || oldMessages.length < COMPACT_WINDOW / 2) return;

      // Build a condensation prompt
      const transcript = oldMessages
        .map((m) => `${m.role === "user" ? "User" : "Hiyori"}: ${m.content}`)
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
            "You are a memory summariser. Write 2-3 sentences summarising the key personal details, preferences, and topics from this conversation between Hiyori (AI companion) and the user.",
          messages: [
            { role: "user", content: [{ type: "text", text: transcript }] },
          ],
        }),
      });

      const resp = await bedrockClient.send(command);
      const body = JSON.parse(new TextDecoder().decode(resp.body));
      const summary = (body?.content || [])
        .map((c) => c?.text)
        .filter(Boolean)
        .join("")
        .trim();

      if (summary) {
        await updateSummary(userId, modelId, summary);
      }

      // Delete the compacted messages
      await Promise.all(
        oldMessages.map((item) =>
          dynamoClient
            .send(new DeleteCommand({ TableName: mediaTable, Key: { pk, sk: item.sk } }))
            .catch(() => {})
        )
      );
    } catch {
      // Silent — compaction is best-effort
    }
  }

  /**
   * Delete all messages + the memory record for a user/model pair.
   */
  async function clearMemory(userId, modelId = "hiyori_free") {
    const pk        = buildMediaPk(userId);
    const memSk     = buildCompanionMemorySk(modelId);
    const msgPrefix = companionMsgPrefix(modelId);

    try {
      const allMessages = await queryBySkPrefix(pk, msgPrefix, 200);
      await Promise.all([
        ...( allMessages || []).map((item) =>
          dynamoClient
            .send(new DeleteCommand({ TableName: mediaTable, Key: { pk, sk: item.sk } }))
            .catch(() => {})
        ),
        dynamoClient
          .send(new DeleteCommand({ TableName: mediaTable, Key: { pk, sk: memSk } }))
          .catch(() => {}),
      ]);
    } catch {
      // Silent
    }
  }

  /**
   * Return lightweight memory status without loading messages.
   */
  async function getMemoryStatus(userId, modelId = "hiyori_free") {
    const pk    = buildMediaPk(userId);
    const memSk = buildCompanionMemorySk(modelId);

    try {
      const result = await dynamoClient.send(
        new (require("@aws-sdk/lib-dynamodb").GetCommand)({
          TableName: mediaTable,
          Key: { pk, sk: memSk },
        })
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

module.exports = { createCompanionMemory };
