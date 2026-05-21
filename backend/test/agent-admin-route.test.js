"use strict";

/**
 * v1.5 route-level tests for the admin endpoints in agent-route. Split from
 * agent-route.test.js to stay under the 500-line file cap.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { getRouterHandler } = require("./helpers/test-utils");
const { createMockDeps } = require("./helpers/mock-deps");

const buildRouter = (depsOverrides = {}) => {
  const express = require("express");
  const router = express.Router();
  const deps = createMockDeps({
    ConverseCommand: function FakeConverse(input) {
      this.input = input;
    },
    ...depsOverrides,
  });
  require("../routes/agent-route")(router, deps);
  require("../routes/agent-admin-route")(router, deps);
  return { router, deps };
};

// agent-config maintains a module-level cache; flush it between tests so
// stubbed dynamoClient responses are observed.
const { invalidateAgentConfigCache } = require("../lib/agent-config");
test.beforeEach(() => invalidateAgentConfigCache());

const createRes = () => {
  const out = { statusCode: 200, payload: null };
  const res = {
    setHeader: () => {},
    status(code) {
      out.statusCode = code;
      return res;
    },
    json(payload) {
      out.payload = payload;
      return res;
    },
    out,
  };
  return res;
};

test("GET /api/admin/agent/cost returns 503 when agentCost is missing", async () => {
  const { router } = buildRouter({ agentCost: null });
  const handler = getRouterHandler(router, "get", "/api/admin/agent/cost");
  assert.ok(handler);
  const req = { query: {}, user: { sub: "admin", isAdmin: true } };
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 503);
});

test("GET /api/admin/agent/cost returns items sorted by total tokens desc", async () => {
  const { router } = buildRouter({
    agentCost: {
      record: async () => {},
      load: async () => null,
      scanAll: async () => ({
        items: [
          { userId: "alice", inputTokens: 50, outputTokens: 25, turnCount: 2 },
          { userId: "bob", inputTokens: 1000, outputTokens: 500, turnCount: 12 },
          { userId: "carol", inputTokens: 200, outputTokens: 100, turnCount: 4 },
        ],
        scannedCount: 3,
        truncated: false,
      }),
    },
  });
  const handler = getRouterHandler(router, "get", "/api/admin/agent/cost");
  const req = { query: { limit: 10 }, user: { sub: "admin", isAdmin: true } };
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.payload.items.length, 3);
  assert.equal(res.out.payload.items[0].userId, "bob");
  assert.equal(res.out.payload.items[0].totalTokens, 1500);
  assert.equal(res.out.payload.items[1].userId, "carol");
  assert.equal(res.out.payload.items[2].userId, "alice");
  assert.equal(res.out.payload.scannedCount, 3);
  assert.equal(res.out.payload.truncated, false);
});

test("GET /api/admin/agent/cost clamps limit to [1, 200]", async () => {
  let receivedOpts = null;
  const { router } = buildRouter({
    agentCost: {
      record: async () => {},
      load: async () => null,
      scanAll: async (opts) => {
        receivedOpts = opts;
        return { items: [], scannedCount: 0, truncated: false };
      },
    },
  });
  const handler = getRouterHandler(router, "get", "/api/admin/agent/cost");
  const req = { query: { limit: 9999 }, user: { sub: "admin", isAdmin: true } };
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 200);
  // scanAll receives maxItems = limit * 2 (so backend can over-fetch + sort then trim)
  assert.ok(receivedOpts.maxItems <= 400, "must clamp limit to 200 (×2 = 400 max)");
});

// ── v1.6: GET/PUT /api/admin/agent/model ──────────────────────────────────

test("GET /api/admin/agent/model returns env default when no override exists", async () => {
  const { router } = buildRouter({
    promptHelperModelId: "claude-haiku-4-5-default",
    dynamoClient: { send: async () => ({ Item: null }) },
  });
  const handler = getRouterHandler(router, "get", "/api/admin/agent/model");
  assert.ok(handler);
  const req = { query: {}, user: { sub: "admin", isAdmin: true } };
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.payload.modelId, "claude-haiku-4-5-default");
  assert.equal(res.out.payload.default, "claude-haiku-4-5-default");
});

test("GET /api/admin/agent/model returns stored override when set", async () => {
  const { router } = buildRouter({
    promptHelperModelId: "haiku-default",
    dynamoClient: {
      send: async (cmd) => {
        if (cmd?.constructor?.name === "GetCommand") {
          return { Item: { modelId: "us.anthropic.claude-opus-4-7" } };
        }
        return {};
      },
    },
  });
  const handler = getRouterHandler(router, "get", "/api/admin/agent/model");
  const req = { query: {}, user: { sub: "admin", isAdmin: true } };
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.payload.modelId, "us.anthropic.claude-opus-4-7");
  assert.equal(res.out.payload.default, "haiku-default");
});

test("PUT /api/admin/agent/model persists the new modelId", async () => {
  let putItem = null;
  const { router } = buildRouter({
    promptHelperModelId: "haiku-default",
    dynamoClient: {
      send: async (cmd) => {
        if (cmd?.constructor?.name === "PutCommand") {
          putItem = cmd.input.Item;
          return {};
        }
        return { Item: null };
      },
    },
  });
  const handler = getRouterHandler(router, "put", "/api/admin/agent/model");
  const req = { body: { modelId: "us.anthropic.claude-sonnet-4-6" }, user: { sub: "admin", isAdmin: true } };
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.payload.modelId, "us.anthropic.claude-sonnet-4-6");
  assert.equal(res.out.payload.reset, false);
  assert.equal(putItem.modelId, "us.anthropic.claude-sonnet-4-6");
});

test("PUT /api/admin/agent/model with empty body resets to env default", async () => {
  let putItem = null;
  const { router } = buildRouter({
    promptHelperModelId: "haiku-default",
    dynamoClient: {
      send: async (cmd) => {
        if (cmd?.constructor?.name === "PutCommand") {
          putItem = cmd.input.Item;
          return {};
        }
        return { Item: null };
      },
    },
  });
  const handler = getRouterHandler(router, "put", "/api/admin/agent/model");
  const req = { body: { modelId: "   " }, user: { sub: "admin", isAdmin: true } };
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.payload.reset, true);
  assert.equal(res.out.payload.modelId, "haiku-default");
  assert.equal(putItem.modelId, "haiku-default");
});

test("PUT /api/admin/agent/model 500s when DynamoDB fails", async () => {
  const { router } = buildRouter({
    promptHelperModelId: "haiku-default",
    dynamoClient: {
      send: async (cmd) => {
        if (cmd?.constructor?.name === "PutCommand") throw new Error("DynamoDB down");
        return { Item: null };
      },
    },
  });
  const handler = getRouterHandler(router, "put", "/api/admin/agent/model");
  const req = { body: { modelId: "x" }, user: { sub: "admin", isAdmin: true } };
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 500);
  assert.equal(res.out.payload.error, "model_save_failed");
});

