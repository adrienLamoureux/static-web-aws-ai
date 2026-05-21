"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getAgentModelId,
  setAgentModelId,
  invalidateAgentConfigCache,
} = require("../lib/agent-config");

const makeStubClient = ({ getItem = null, onPut } = {}) => {
  const sent = [];
  return {
    sent,
    send: async (cmd) => {
      sent.push(cmd);
      const name = cmd?.constructor?.name || "";
      if (name === "GetCommand") return { Item: getItem };
      if (name === "PutCommand") {
        if (typeof onPut === "function") onPut(cmd);
        return {};
      }
      return {};
    },
  };
};

test.beforeEach(() => invalidateAgentConfigCache());

test("getAgentModelId returns env-backed default when no override exists", async () => {
  const deps = {
    dynamoClient: makeStubClient({ getItem: null }),
    mediaTable: "t",
    promptHelperModelId: "us.anthropic.claude-haiku-4-5-v1:0",
  };
  const value = await getAgentModelId(deps);
  assert.equal(value, "us.anthropic.claude-haiku-4-5-v1:0");
});

test("getAgentModelId returns stored override when present", async () => {
  const deps = {
    dynamoClient: makeStubClient({ getItem: { modelId: "us.anthropic.claude-opus-4-7" } }),
    mediaTable: "t",
    promptHelperModelId: "haiku-default",
  };
  const value = await getAgentModelId(deps);
  assert.equal(value, "us.anthropic.claude-opus-4-7");
});

test("getAgentModelId falls back when DynamoDB throws", async () => {
  const deps = {
    dynamoClient: {
      send: async () => {
        throw new Error("DynamoDB down");
      },
    },
    mediaTable: "t",
    promptHelperModelId: "haiku-default",
  };
  const value = await getAgentModelId(deps);
  assert.equal(value, "haiku-default", "must fail open to env default");
});

test("getAgentModelId returns the absolute fallback when deps is empty", async () => {
  const value = await getAgentModelId(null);
  assert.match(value, /claude/, "absolute fallback must be a real Claude profile");
});

test("getAgentModelId caches reads (second call doesn't hit DynamoDB)", async () => {
  const client = makeStubClient({ getItem: { modelId: "cached-model" } });
  const deps = { dynamoClient: client, mediaTable: "t", promptHelperModelId: "x" };
  await getAgentModelId(deps);
  await getAgentModelId(deps);
  await getAgentModelId(deps);
  const gets = client.sent.filter((c) => c?.constructor?.name === "GetCommand");
  assert.equal(gets.length, 1, "must cache subsequent calls within TTL");
});

test("setAgentModelId persists + invalidates cache", async () => {
  let putItem = null;
  const client = makeStubClient({
    getItem: { modelId: "old-model" },
    onPut: (cmd) => {
      putItem = cmd.input.Item;
    },
  });
  const deps = { dynamoClient: client, mediaTable: "t", promptHelperModelId: "x" };

  // Prime cache with the old value
  await getAgentModelId(deps);

  // Save a new value
  const saved = await setAgentModelId(deps, "  new-model  ");
  assert.equal(saved, "new-model", "must trim whitespace");
  assert.equal(putItem.modelId, "new-model");
  assert.ok(putItem.updatedAt, "must stamp updatedAt");

  // Cache should now miss; next get re-reads — make the stub return the new value
  client.send = async (cmd) => {
    if (cmd?.constructor?.name === "GetCommand") return { Item: { modelId: "new-model" } };
    return {};
  };
  const after = await getAgentModelId(deps);
  assert.equal(after, "new-model");
});

test("setAgentModelId rejects empty/non-string input", async () => {
  const client = makeStubClient();
  const deps = { dynamoClient: client, mediaTable: "t", promptHelperModelId: "x" };
  await assert.rejects(() => setAgentModelId(deps, ""), /modelId required/);
  await assert.rejects(() => setAgentModelId(deps, "   "), /modelId required/);
  await assert.rejects(() => setAgentModelId(deps, null), /modelId required/);
});

test("setAgentModelId throws when DynamoDB unavailable", async () => {
  await assert.rejects(
    () => setAgentModelId({ dynamoClient: null }, "any-model"),
    /DynamoDB unavailable/
  );
});
