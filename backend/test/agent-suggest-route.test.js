"use strict";

/**
 * v1.3 route-level tests for /api/agent/suggest and the rate-limit guards on
 * /api/agent/turn. Split from agent-route.test.js to stay under the 500-line
 * file cap.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { getRouterHandler } = require("./helpers/test-utils");
const { createMockDeps } = require("./helpers/mock-deps");
const { invalidateFlagsCache } = require("../lib/feature-flags");

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
  require("../routes/agent-suggest-route")(router, deps);
  return { router, deps };
};

const createReq = ({ body = {}, query = {}, user = { sub: "user-1" } } = {}) => ({
  body,
  query,
  user,
  method: "POST",
});

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

const makeConverseResponse = ({ text = "", toolUse = null, stopReason = "end_turn" } = {}) => {
  const content = [];
  if (text) content.push({ text });
  if (toolUse) content.push({ toolUse });
  return { output: { message: { content } }, stopReason };
};

// ── v1.3: rate limit ──────────────────────────────────────────────────────

test("POST /api/agent/turn 429s when agentRateLimit denies", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter({
    agentRateLimit: {
      check: async () => ({ allowed: false, remaining: 0, retryAfterMs: 1500 }),
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/turn");
  const headers = {};
  const req = createReq({ body: { messages: [{ role: "user", content: "hi" }] } });
  const res = {
    statusCode: 200,
    payload: null,
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(p) {
      this.payload = p;
      return this;
    },
    get out() {
      return { statusCode: this.statusCode, payload: this.payload };
    },
  };
  await handler(req, res);
  assert.equal(res.out.statusCode, 429);
  assert.equal(res.out.payload.error, "rate_limited");
  assert.ok(headers["Retry-After"], "Retry-After header must be set");
  invalidateFlagsCache();
});

test("POST /api/agent/turn sets X-RateLimit-Remaining header on success", async () => {
  invalidateFlagsCache();
  const headers = {};
  const { router } = buildRouter({
    bedrockClient: {
      send: async () => makeConverseResponse({ text: "Hi! [EMOTION: neutral]" }),
    },
    agentRateLimit: {
      check: async () => ({ allowed: true, remaining: 27, retryAfterMs: 0 }),
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/turn");
  const req = createReq({ body: { messages: [{ role: "user", content: "hi" }] } });
  const res = {
    statusCode: 200,
    payload: null,
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(p) {
      this.payload = p;
      return this;
    },
    get out() {
      return { statusCode: this.statusCode, payload: this.payload };
    },
  };
  await handler(req, res);
  assert.equal(res.out.statusCode, 200);
  assert.equal(headers["X-RateLimit-Remaining"], "27");
  invalidateFlagsCache();
});

// ── v1.3: suggest endpoint ────────────────────────────────────────────────

test("POST /api/agent/suggest 400s on invalid field", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter();
  const handler = getRouterHandler(router, "post", "/api/agent/suggest");
  assert.ok(handler);
  const req = createReq({ body: { field: "model" } });
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 400);
  assert.equal(res.out.payload.error, "invalid_field");
  invalidateFlagsCache();
});

test("POST /api/agent/suggest returns a sanitised style value", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter({
    bedrockClient: {
      send: async () => ({
        body: new TextEncoder().encode(
          JSON.stringify({ content: [{ type: "text", text: "  ANIME  " }] })
        ),
      }),
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/suggest");
  const req = createReq({ body: { field: "style" } });
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.payload.field, "style");
  assert.equal(res.out.payload.value, "anime");
  invalidateFlagsCache();
});

test("POST /api/agent/suggest falls back to safe defaults when Bedrock returns garbage", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter({
    bedrockClient: {
      send: async () => ({
        body: new TextEncoder().encode(
          JSON.stringify({ content: [{ type: "text", text: "purple haze 🌸 ???" }] })
        ),
      }),
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/suggest");
  const styleRes = createRes();
  await handler(createReq({ body: { field: "style" } }), styleRes);
  assert.equal(styleRes.out.payload.value, "anime", "garbage style → anime fallback");

  const aspectRes = createRes();
  await handler(createReq({ body: { field: "aspect" } }), aspectRes);
  assert.equal(aspectRes.out.payload.value, "3:4", "garbage aspect → 3:4 fallback");
  invalidateFlagsCache();
});

test("POST /api/agent/suggest strips quotes + EMOTION tags from prompt", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter({
    bedrockClient: {
      send: async () => ({
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ type: "text", text: '"fox spirit at moonlit shrine"\n[EMOTION: happy]' }],
          })
        ),
      }),
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/suggest");
  const req = createReq({ body: { field: "prompt", context: { currentPrompt: "fox" } } });
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.payload.value, "fox spirit at moonlit shrine");
  invalidateFlagsCache();
});

test("POST /api/agent/suggest sanitises negativePrompt the same way as prompt", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter({
    bedrockClient: {
      send: async () => ({
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [
              { type: "text", text: '"low quality, blurry, watermark"\n[EMOTION: neutral]' },
            ],
          })
        ),
      }),
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/suggest");
  const req = createReq({ body: { field: "negativePrompt", context: { currentPrompt: "x" } } });
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.payload.field, "negativePrompt");
  assert.equal(res.out.payload.value, "low quality, blurry, watermark");
  invalidateFlagsCache();
});

test("POST /api/agent/suggest records cost telemetry from InvokeModel usage", async () => {
  invalidateFlagsCache();
  const recordings = [];
  const { router } = buildRouter({
    bedrockClient: {
      send: async () => ({
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ type: "text", text: "anime" }],
            usage: { input_tokens: 42, output_tokens: 7 },
          })
        ),
      }),
    },
    agentCost: {
      record: async (userId, usage) => {
        recordings.push({ userId, usage });
      },
      load: async () => null,
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/suggest");
  const req = createReq({ body: { field: "style" } });
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 200);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(recordings.length, 1);
  assert.equal(recordings[0].userId, "user-1");
  assert.equal(recordings[0].usage.inputTokens, 42);
  assert.equal(recordings[0].usage.outputTokens, 7);
  invalidateFlagsCache();
});

test("POST /api/agent/suggest 404s when agentMode flag is off", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter({
    dynamoClient: {
      send: async (cmd) => {
        const pk = cmd?.input?.Key?.pk;
        if (pk === "APP#GLOBAL") return { Item: { flags: { agentMode: false } } };
        return { Item: null };
      },
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/suggest");
  const req = createReq({ body: { field: "style" } });
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 404);
  invalidateFlagsCache();
});

