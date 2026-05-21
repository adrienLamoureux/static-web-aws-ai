"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAgentMemory } = require("../lib/agent-memory");

const makeStubClient = ({ getItem = null, queryItems = [] } = {}) => {
  const sent = [];
  return {
    sent,
    send: async (cmd) => {
      sent.push(cmd);
      const name = cmd?.constructor?.name || "";
      if (name === "GetCommand") return { Item: getItem };
      if (name === "PutCommand") return {};
      if (name === "DeleteCommand") return {};
      return { Items: queryItems };
    },
  };
};

const makeBedrock = (text) => ({
  send: async () => ({
    body: new TextEncoder().encode(JSON.stringify({ content: [{ type: "text", text }] })),
  }),
});

class FakeCommand {
  constructor(input) {
    this.input = input;
  }
}
class GetCommand extends FakeCommand {}
class PutCommand extends FakeCommand {}
class DeleteCommand extends FakeCommand {}

// Patch lib-dynamodb resolution by injecting our own instances via deps where
// possible. agent-memory uses GetCommand/PutCommand/DeleteCommand from
// @aws-sdk/lib-dynamodb directly, so the cleanest approach is to verify
// behavior at the API boundary (loadMemory/saveMessages return shapes).

test("createAgentMemory returns no-op stubs when DynamoDB unavailable", async () => {
  const mem = createAgentMemory({ dynamoClient: null, mediaTable: "" });
  assert.equal(await mem.loadMemory("u1"), null);
  assert.equal(typeof mem.SUMMARY_THRESHOLD, "number");
  // saveMessages/clearMemory/compactMemory are silent no-ops
  await mem.saveMessages("u1", "default", [{ role: "user", content: "hi" }]);
  await mem.compactMemory("u1");
  await mem.clearMemory("u1");
  assert.deepEqual(await mem.getMemoryStatus("u1"), { hasMemory: false });
});

test("loadMemory returns null when no state record and no messages", async () => {
  const dynamoClient = makeStubClient();
  const queryBySkPrefix = async () => [];
  const mem = createAgentMemory({
    dynamoClient,
    mediaTable: "test",
    queryBySkPrefix,
    bedrockClient: makeBedrock(""),
    InvokeModelCommand: FakeCommand,
    promptHelperModelId: "model",
  });
  const result = await mem.loadMemory("u1", "default");
  assert.equal(result, null);
});

test("loadMemory returns merged shape when state record exists", async () => {
  const dynamoClient = makeStubClient({
    getItem: { summary: "they like cats", turnCount: 5 },
  });
  const queryBySkPrefix = async () => [
    { role: "user", content: "draw a cat", createdAt: 1 },
    { role: "assistant", content: "here's a cat", createdAt: 2 },
  ];
  const mem = createAgentMemory({
    dynamoClient,
    mediaTable: "test",
    queryBySkPrefix,
    bedrockClient: makeBedrock(""),
    InvokeModelCommand: FakeCommand,
    promptHelperModelId: "model",
  });
  const result = await mem.loadMemory("u1", "default");
  assert.equal(result.summary, "they like cats");
  assert.equal(result.turnCount, 5);
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].role, "user");
});

test("getMemoryStatus reports hasMemory=true when state record exists", async () => {
  const dynamoClient = makeStubClient({ getItem: { turnCount: 3, summary: "" } });
  const mem = createAgentMemory({
    dynamoClient,
    mediaTable: "test",
    queryBySkPrefix: async () => [],
    bedrockClient: makeBedrock(""),
    InvokeModelCommand: FakeCommand,
    promptHelperModelId: "model",
  });
  const status = await mem.getMemoryStatus("u1");
  assert.equal(status.hasMemory, true);
  assert.equal(status.turnCount, 3);
});

test("saveMessages uses atomic UpdateCommand (ADD turnCount) — no read-modify-write race", async () => {
  const sent = [];
  const dynamoClient = {
    send: async (cmd) => {
      sent.push(cmd);
      const name = cmd?.constructor?.name || "";
      if (name === "GetCommand") return { Item: null };
      return {};
    },
  };
  const mem = createAgentMemory({
    dynamoClient,
    mediaTable: "test",
    queryBySkPrefix: async () => [],
    bedrockClient: makeBedrock(""),
    InvokeModelCommand: FakeCommand,
    promptHelperModelId: "model",
  });
  await mem.saveMessages("u1", "default", [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
  ]);
  const update = sent.find((c) => c?.constructor?.name === "UpdateCommand");
  assert.ok(update, "must use UpdateCommand instead of read+put");
  assert.match(update.input.UpdateExpression, /ADD turnCount/);
  assert.equal(update.input.ExpressionAttributeValues[":n"], 2);
  // Must not issue a Get for turnCount (that would be the racy old path)
  const getsForState = sent.filter(
    (c) => c?.constructor?.name === "GetCommand" && c.input?.Key?.sk?.startsWith("AGENT#")
  );
  assert.equal(getsForState.length, 0, "must not GET the state record before increment");
});

test("saveMessages early-returns on empty array (no DynamoDB writes)", async () => {
  const dynamoClient = makeStubClient();
  const mem = createAgentMemory({
    dynamoClient,
    mediaTable: "test",
    queryBySkPrefix: async () => [],
    bedrockClient: makeBedrock(""),
    InvokeModelCommand: FakeCommand,
    promptHelperModelId: "model",
  });
  await mem.saveMessages("u1", "default", []);
  assert.equal(dynamoClient.sent.length, 0);
});

test("SUMMARY_THRESHOLD is exposed and is a positive integer", () => {
  const mem = createAgentMemory({ dynamoClient: null, mediaTable: "" });
  assert.ok(Number.isInteger(mem.SUMMARY_THRESHOLD));
  assert.ok(mem.SUMMARY_THRESHOLD > 0);
});

test("compactMemory bills summariser tokens to agentCost when wired", async () => {
  // The summariser runs every ~30 turns. Without billing its tokens against
  // the daily cap, a user racks up untracked spend at every compaction.
  const messages = Array.from({ length: 16 }, (_, i) => ({
    sk: `AGENT#default#MSG#${String(Date.now() + i).padStart(13, "0")}`,
    role: i % 2 === 0 ? "user" : "assistant",
    content: `turn ${i}`,
  }));
  const bedrockClient = {
    send: async () => ({
      body: new TextEncoder().encode(
        JSON.stringify({
          content: [{ type: "text", text: "summary text" }],
          usage: { input_tokens: 1200, output_tokens: 180 },
        })
      ),
    }),
  };
  const recorded = [];
  const agentCost = {
    record: async (userId, payload) => {
      recorded.push({ userId, ...payload });
    },
  };
  const mem = createAgentMemory({
    dynamoClient: makeStubClient({ queryItems: messages }),
    mediaTable: "test",
    queryBySkPrefix: async () => messages,
    bedrockClient,
    InvokeModelCommand: FakeCommand,
    promptHelperModelId: "model",
    agentCost,
  });
  await mem.compactMemory("u1", "default");
  // Microtask flush — agentCost.record is fire-and-forget
  await new Promise((r) => setImmediate(r));
  assert.equal(recorded.length, 1, "must record summariser tokens against the daily cap");
  assert.equal(recorded[0].userId, "u1");
  assert.equal(recorded[0].inputTokens, 1200);
  assert.equal(recorded[0].outputTokens, 180);
});

test("compactMemory skips token billing when agentCost is not wired", async () => {
  const messages = Array.from({ length: 16 }, (_, i) => ({
    sk: `AGENT#default#MSG#${String(Date.now() + i).padStart(13, "0")}`,
    role: i % 2 === 0 ? "user" : "assistant",
    content: `turn ${i}`,
  }));
  const bedrockClient = {
    send: async () => ({
      body: new TextEncoder().encode(
        JSON.stringify({ content: [{ text: "ok" }], usage: { input_tokens: 1 } })
      ),
    }),
  };
  const mem = createAgentMemory({
    dynamoClient: makeStubClient({ queryItems: messages }),
    mediaTable: "test",
    queryBySkPrefix: async () => messages,
    bedrockClient,
    InvokeModelCommand: FakeCommand,
    promptHelperModelId: "model",
    // agentCost intentionally omitted — compaction must still succeed
  });
  await mem.compactMemory("u1", "default"); // must not throw
});

// Suppress unused-class warnings — they exist to make instanceof checks possible
// if upstream agent-memory ever switches to constructor-name-based dispatch.
void PutCommand;
void DeleteCommand;
void GetCommand;
