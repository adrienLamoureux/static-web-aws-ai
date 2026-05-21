"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAgentCost } = require("../lib/agent-cost");

const makeStubClient = ({ getItem = null } = {}) => {
  const sent = [];
  return {
    sent,
    send: async (cmd) => {
      sent.push(cmd);
      const name = cmd?.constructor?.name || "";
      if (name === "GetCommand") return { Item: getItem };
      return {};
    },
  };
};

test("createAgentCost returns no-op stubs when DynamoDB unavailable", async () => {
  const c = createAgentCost({ dynamoClient: null, mediaTable: "" });
  assert.equal(await c.load("u1"), null);
  await c.record("u1", { inputTokens: 100, outputTokens: 200 });
});

test("record skips when userId missing", async () => {
  const client = makeStubClient();
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  await c.record("", { inputTokens: 50, outputTokens: 30 });
  assert.equal(client.sent.length, 0);
});

test("record skips when both token counts are 0", async () => {
  const client = makeStubClient();
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  await c.record("u1", { inputTokens: 0, outputTokens: 0 });
  assert.equal(client.sent.length, 0);
});

test("record issues an UpdateCommand with atomic ADD increments", async () => {
  const client = makeStubClient();
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  await c.record("u1", { inputTokens: 150, outputTokens: 75 });
  const update = client.sent.find((cmd) => cmd?.constructor?.name === "UpdateCommand");
  assert.ok(update, "must issue an UpdateCommand");
  assert.match(update.input.UpdateExpression, /ADD inputTokens :i/);
  assert.match(update.input.UpdateExpression, /outputTokens :o/);
  assert.match(update.input.UpdateExpression, /turnCount :one/);
  assert.equal(update.input.ExpressionAttributeValues[":i"], 150);
  assert.equal(update.input.ExpressionAttributeValues[":o"], 75);
  assert.equal(update.input.ExpressionAttributeValues[":one"], 1);
});

test("record coerces non-integer / negative inputs safely", async () => {
  const client = makeStubClient();
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  await c.record("u1", { inputTokens: -5, outputTokens: 42.7 });
  const update = client.sent.find((cmd) => cmd?.constructor?.name === "UpdateCommand");
  // -5 floored to 0 → both halves nonzero? input=0, output=42 → still records (output > 0)
  assert.equal(update.input.ExpressionAttributeValues[":i"], 0);
  assert.equal(update.input.ExpressionAttributeValues[":o"], 42);
});

test("load returns null when no record exists", async () => {
  const client = makeStubClient({ getItem: null });
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  assert.equal(await c.load("u1"), null);
});

test("load returns inputTokens + outputTokens + turnCount summary", async () => {
  const client = makeStubClient({
    getItem: { inputTokens: 1200, outputTokens: 600, turnCount: 8, lastUpdatedAt: 999 },
  });
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  const summary = await c.load("u1");
  assert.deepEqual(summary, {
    inputTokens: 1200,
    outputTokens: 600,
    turnCount: 8,
    lastUpdatedAt: 999,
  });
});

test("scanAll returns empty when DynamoDB has no AGENT#COST records", async () => {
  const client = makeStubClient();
  client.send = async (cmd) => {
    if (cmd?.constructor?.name === "ScanCommand") return { Items: [], ScannedCount: 0 };
    return {};
  };
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  const result = await c.scanAll();
  assert.deepEqual(result.items, []);
  assert.equal(result.scannedCount, 0);
  assert.equal(result.truncated, false);
});

test("scanAll strips USER# prefix from pk and returns normalised items", async () => {
  const client = {
    send: async (cmd) => {
      if (cmd?.constructor?.name === "ScanCommand") {
        return {
          Items: [
            { pk: "USER#alice", sk: "AGENT#COST", inputTokens: 100, outputTokens: 50, turnCount: 3 },
            {
              pk: "USER#bob",
              sk: "AGENT#COST",
              inputTokens: 200,
              outputTokens: 75,
              turnCount: 5,
              lastUpdatedAt: 999,
            },
          ],
          ScannedCount: 2,
        };
      }
      return {};
    },
  };
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  const result = await c.scanAll();
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].userId, "alice");
  assert.equal(result.items[1].userId, "bob");
  assert.equal(result.items[1].lastUpdatedAt, 999);
});

test("scanAll respects maxItems cap and reports truncation", async () => {
  const client = {
    send: async () => ({
      Items: Array.from({ length: 5 }, (_, i) => ({
        pk: `USER#u${i}`,
        sk: "AGENT#COST",
        inputTokens: i * 10,
        outputTokens: i * 5,
        turnCount: i,
      })),
      ScannedCount: 5,
      LastEvaluatedKey: { pk: "USER#u4", sk: "AGENT#COST" }, // signal more pages
    }),
  };
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  const result = await c.scanAll({ maxItems: 3 });
  assert.equal(result.items.length, 3);
  assert.equal(result.truncated, true, "must flag truncation when items hit max and more pages exist");
});

test("scanAll fails silently on DynamoDB errors, returning collected items", async () => {
  const client = {
    send: async () => {
      throw new Error("connection refused");
    },
  };
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  const result = await c.scanAll();
  assert.deepEqual(result.items, []);
});

// ── v1.6: checkDailyCap ───────────────────────────────────────────────────

test("checkDailyCap allows when DynamoDB unavailable (fail open)", async () => {
  const c = createAgentCost({ dynamoClient: null, mediaTable: "" });
  const v = await c.checkDailyCap("u1");
  assert.equal(v.allowed, true);
});

test("checkDailyCap allows when no prior usage exists", async () => {
  const client = makeStubClient({ getItem: null });
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  const v = await c.checkDailyCap("u1", { dailyCap: 100_000 });
  assert.equal(v.allowed, true);
  assert.equal(v.remaining, 100_000);
});

test("checkDailyCap allows when under cap", async () => {
  const today = Date.now() - (Date.now() % (24 * 60 * 60 * 1000));
  const client = makeStubClient({
    getItem: { dayStartedAt: today, tokensToday: 30_000 },
  });
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  const v = await c.checkDailyCap("u1", { dailyCap: 100_000 });
  assert.equal(v.allowed, true);
  assert.equal(v.remaining, 70_000);
});

test("checkDailyCap denies when tokensToday >= dailyCap", async () => {
  const today = Date.now() - (Date.now() % (24 * 60 * 60 * 1000));
  const client = makeStubClient({
    getItem: { dayStartedAt: today, tokensToday: 105_000 },
  });
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  const v = await c.checkDailyCap("u1", { dailyCap: 100_000 });
  assert.equal(v.allowed, false);
  assert.equal(v.tokensToday, 105_000);
  assert.equal(v.capacity, 100_000);
  assert.ok(v.retryAfterMs > 0);
  assert.ok(v.retryAfterMs <= 24 * 60 * 60 * 1000);
});

test("checkDailyCap ignores stale dayStartedAt (rolls over at UTC midnight)", async () => {
  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const client = makeStubClient({
    getItem: { dayStartedAt: twoDaysAgo, tokensToday: 999_999 },
  });
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  const v = await c.checkDailyCap("u1", { dailyCap: 100_000 });
  assert.equal(v.allowed, true, "stale day data must not count toward today's cap");
  assert.equal(v.remaining, 100_000);
});

test("checkDailyCap fails open when DynamoDB throws", async () => {
  const client = {
    send: async () => {
      throw new Error("connection refused");
    },
  };
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  const v = await c.checkDailyCap("u1");
  assert.equal(v.allowed, true);
});

test("checkDailyCap fails open on missing userId", async () => {
  const c = createAgentCost({ dynamoClient: makeStubClient(), mediaTable: "t" });
  const v = await c.checkDailyCap("");
  assert.equal(v.allowed, true);
});

test("DynamoDB errors fail silently — record never throws", async () => {
  const client = {
    send: async () => {
      throw new Error("connection refused");
    },
  };
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  await c.record("u1", { inputTokens: 100, outputTokens: 50 }); // must not throw
  assert.equal(await c.load("u1"), null); // load gracefully returns null
});

// ── Image daily cap (caps Replicate spend, the dominant cost driver) ──────

test("checkDailyImageCap allows when DynamoDB unavailable (fail open)", async () => {
  const c = createAgentCost({ dynamoClient: null, mediaTable: "" });
  const v = await c.checkDailyImageCap("u1");
  assert.equal(v.allowed, true);
});

test("checkDailyImageCap allows when no prior images today", async () => {
  const c = createAgentCost({ dynamoClient: makeStubClient({ getItem: null }), mediaTable: "t" });
  const v = await c.checkDailyImageCap("u1", { dailyImageCap: 50 });
  assert.equal(v.allowed, true);
  assert.equal(v.remaining, 50);
});

test("checkDailyImageCap denies when imagesToday >= cap", async () => {
  const today = Date.now() - (Date.now() % (24 * 60 * 60 * 1000));
  const client = makeStubClient({ getItem: { dayStartedAt: today, imagesToday: 50 } });
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  const v = await c.checkDailyImageCap("u1", { dailyImageCap: 50 });
  assert.equal(v.allowed, false);
  assert.equal(v.imagesToday, 50);
  assert.equal(v.capacity, 50);
  assert.ok(v.retryAfterMs > 0);
});

test("checkDailyImageCap rolls over at UTC midnight (stale day ignored)", async () => {
  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const client = makeStubClient({
    getItem: { dayStartedAt: twoDaysAgo, imagesToday: 9999 },
  });
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  const v = await c.checkDailyImageCap("u1", { dailyImageCap: 50 });
  assert.equal(v.allowed, true);
  assert.equal(v.remaining, 50);
});

test("recordImage writes an atomic ADD on totalImages + sets imagesToday", async () => {
  const client = makeStubClient();
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  await c.recordImage("u1", 1);
  const update = client.sent.find((cmd) => cmd?.constructor?.name === "UpdateCommand");
  assert.ok(update);
  assert.match(update.input.UpdateExpression, /ADD totalImages :n/);
  assert.match(update.input.UpdateExpression, /imagesToday = :it/);
  assert.equal(update.input.ExpressionAttributeValues[":n"], 1);
});

test("recordImage accumulates same-day counts without resetting", async () => {
  const today = Date.now() - (Date.now() % (24 * 60 * 60 * 1000));
  const client = makeStubClient({ getItem: { dayStartedAt: today, imagesToday: 12 } });
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  await c.recordImage("u1", 1);
  const update = client.sent.find((cmd) => cmd?.constructor?.name === "UpdateCommand");
  assert.equal(update.input.ExpressionAttributeValues[":it"], 13);
});

test("recordImage resets imagesToday after UTC midnight rollover", async () => {
  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const client = makeStubClient({ getItem: { dayStartedAt: twoDaysAgo, imagesToday: 47 } });
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  await c.recordImage("u1", 1);
  const update = client.sent.find((cmd) => cmd?.constructor?.name === "UpdateCommand");
  assert.equal(update.input.ExpressionAttributeValues[":it"], 1, "must reset to today's count");
});

test("recordImage is a silent no-op when DynamoDB errors", async () => {
  const client = {
    send: async () => {
      throw new Error("connection refused");
    },
  };
  const c = createAgentCost({ dynamoClient: client, mediaTable: "t" });
  await c.recordImage("u1", 1); // must not throw
});
