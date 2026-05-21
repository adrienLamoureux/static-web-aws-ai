"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAgentRateLimit } = require("../lib/agent-rate-limit");

const makeStubClient = ({ getItem = null, onUpdate } = {}) => {
  const sent = [];
  return {
    sent,
    send: async (cmd) => {
      sent.push(cmd);
      const name = cmd?.constructor?.name || "";
      if (name === "GetCommand") return { Item: getItem };
      if (name === "UpdateCommand") {
        if (typeof onUpdate === "function") onUpdate(cmd);
        return {};
      }
      return {};
    },
  };
};

test("rate limit returns allowed=true when DynamoDB unavailable (fail open)", async () => {
  const rl = createAgentRateLimit({ dynamoClient: null, mediaTable: "" });
  const v = await rl.check("u1");
  assert.equal(v.allowed, true);
});

test("first call from a new user fills the bucket and grants 1 token", async () => {
  const updates = [];
  const dynamoClient = makeStubClient({
    getItem: null,
    onUpdate: (cmd) => updates.push(cmd.input),
  });
  const rl = createAgentRateLimit({ dynamoClient, mediaTable: "t" });
  const v = await rl.check("u1", { capacity: 10 });
  assert.equal(v.allowed, true);
  assert.equal(v.remaining, 9);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].ExpressionAttributeValues[":t"], 9);
});

test("consumes tokens down to 0 and then denies with retryAfterMs", async () => {
  const dynamoClient = makeStubClient({
    getItem: { tokens: 1, refilledAt: Date.now() - 100, updatedAt: Date.now() - 100 },
  });
  const rl = createAgentRateLimit({ dynamoClient, mediaTable: "t" });

  const first = await rl.check("u1", { capacity: 10, refillIntervalMs: 2000 });
  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 0);

  // Second call: bucket reads back 0 tokens, no refill yet → denied
  const dynamoClient2 = makeStubClient({
    getItem: { tokens: 0, refilledAt: Date.now() - 500, updatedAt: Date.now() - 500 },
  });
  const rl2 = createAgentRateLimit({ dynamoClient: dynamoClient2, mediaTable: "t" });
  const second = await rl2.check("u1", { capacity: 10, refillIntervalMs: 2000 });
  assert.equal(second.allowed, false);
  assert.equal(second.remaining, 0);
  assert.ok(second.retryAfterMs > 0, "must surface retryAfterMs");
  assert.ok(second.retryAfterMs <= 2000, "retryAfterMs must be within one interval");
});

test("refills tokens over time", async () => {
  // Bucket was empty 6s ago — with 2s refill, 3 tokens should be back.
  const dynamoClient = makeStubClient({
    getItem: { tokens: 0, refilledAt: Date.now() - 6000, updatedAt: Date.now() - 6000 },
  });
  const rl = createAgentRateLimit({ dynamoClient, mediaTable: "t" });
  const v = await rl.check("u1", { capacity: 10, refillIntervalMs: 2000, refillPerInterval: 1 });
  assert.equal(v.allowed, true);
  assert.equal(v.remaining, 2, "after refill we had 3 tokens, spent 1 → 2 remain");
});

test("refill caps at bucket capacity", async () => {
  const dynamoClient = makeStubClient({
    getItem: { tokens: 5, refilledAt: Date.now() - 100_000, updatedAt: Date.now() - 100_000 },
  });
  const rl = createAgentRateLimit({ dynamoClient, mediaTable: "t" });
  const v = await rl.check("u1", { capacity: 10, refillIntervalMs: 2000 });
  assert.equal(v.allowed, true);
  assert.equal(v.remaining, 9, "must cap at capacity=10 then spend 1");
});

test("missing userId fails open (no rate-limit applied)", async () => {
  const dynamoClient = makeStubClient();
  const rl = createAgentRateLimit({ dynamoClient, mediaTable: "t" });
  const v = await rl.check("");
  assert.equal(v.allowed, true);
  assert.equal(dynamoClient.sent.length, 0, "no DB calls when userId missing");
});

test("DynamoDB Get failures fail open", async () => {
  const dynamoClient = {
    send: async () => {
      throw new Error("connection refused");
    },
  };
  const rl = createAgentRateLimit({ dynamoClient, mediaTable: "t" });
  const v = await rl.check("u1");
  assert.equal(v.allowed, true);
});
