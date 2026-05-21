"use strict";
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
  return { router, deps };
};

const createReq = ({
  body = {},
  query = {},
  user = { sub: "user-1" },
  method = "POST",
} = {}) => ({ body, query, user, method });

const createRes = () => {
  const out = { statusCode: 200, payload: null, headers: {} };
  const res = {
    setHeader(name, value) {
      out.headers[name] = value;
    },
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

/** Fake Bedrock Converse response with optional tool_use block. */
const makeConverseResponse = ({ text = "", toolUse = null, stopReason = "end_turn" } = {}) => {
  const content = [];
  if (text) content.push({ text });
  if (toolUse) content.push({ toolUse });
  return { output: { message: { content } }, stopReason };
};

// ── Feature-flag gate ──────────────────────────────────────────────────────

test("POST /api/agent/turn 404s when agentMode flag is false", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter({
    bedrockClient: { send: async () => makeConverseResponse({ text: "" }) },
    dynamoClient: {
      send: async (cmd) => {
        // Match GetCommand for feature flags PK
        const pk = cmd?.input?.Key?.pk;
        if (pk === "APP#GLOBAL") {
          return { Item: { flags: { agentMode: false } } };
        }
        return { Item: null };
      },
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/turn");
  assert.ok(handler);

  const req = createReq({ body: { messages: [{ role: "user", content: "hi" }] } });
  const res = createRes();
  await handler(req, res);

  assert.equal(res.out.statusCode, 404);
  assert.equal(res.out.payload?.error, "agent_mode_disabled");
  invalidateFlagsCache();
});

test("POST /api/agent/turn 404s for non-admin when agentMode cohort='admin'", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter({
    bedrockClient: { send: async () => makeConverseResponse({ text: "" }) },
    dynamoClient: {
      send: async (cmd) => {
        const pk = cmd?.input?.Key?.pk;
        if (pk === "APP#GLOBAL") return { Item: { flags: { agentMode: "admin" } } };
        return { Item: null };
      },
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/turn");
  const req = createReq({
    body: { messages: [{ role: "user", content: "hi" }] },
    user: { sub: "u1", isAdmin: false },
  });
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 404);
  invalidateFlagsCache();
});

test("POST /api/agent/turn allows admin when agentMode cohort='admin'", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter({
    bedrockClient: {
      send: async () => makeConverseResponse({ text: "Hi!\n[EMOTION: neutral]" }),
    },
    dynamoClient: {
      send: async (cmd) => {
        const pk = cmd?.input?.Key?.pk;
        if (pk === "APP#GLOBAL") return { Item: { flags: { agentMode: "admin" } } };
        return { Item: null };
      },
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/turn");
  const req = createReq({
    body: { messages: [{ role: "user", content: "hi" }] },
    user: { sub: "admin1", isAdmin: true },
  });
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 200);
  invalidateFlagsCache();
});

test("POST /api/agent/turn records cost telemetry from initial Converse usage", async () => {
  invalidateFlagsCache();
  const recordings = [];
  const { router } = buildRouter({
    bedrockClient: {
      send: async () => ({
        output: { message: { content: [{ text: "Hi!\n[EMOTION: neutral]" }] } },
        stopReason: "end_turn",
        usage: { inputTokens: 220, outputTokens: 18 },
      }),
    },
    agentCost: {
      record: async (userId, usage) => {
        recordings.push({ userId, usage });
      },
      load: async () => null,
      checkDailyCap: async () => ({ allowed: true, remaining: null, retryAfterMs: 0 }),
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/turn");
  const req = createReq({ body: { messages: [{ role: "user", content: "hi" }] } });
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 200);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(recordings.length, 1);
  assert.equal(recordings[0].usage.inputTokens, 220);
  assert.equal(recordings[0].usage.outputTokens, 18);
  invalidateFlagsCache();
});

test("POST /api/agent/turn 429s when daily token cap is reached", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter({
    agentCost: {
      record: async () => {},
      load: async () => null,
      scanAll: async () => ({ items: [], scannedCount: 0, truncated: false }),
      checkDailyCap: async () => ({
        allowed: false,
        capacity: 200_000,
        tokensToday: 205_000,
        retryAfterMs: 60_000,
      }),
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/turn");
  const req = createReq({ body: { messages: [{ role: "user", content: "hi" }] } });
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 429);
  assert.equal(res.out.payload.error, "daily_cap_reached");
  assert.equal(res.out.payload.tokensToday, 205_000);
  assert.ok(res.out.headers["Retry-After"], "Retry-After header must be set");
  invalidateFlagsCache();
});

test("POST /api/agent/turn 401s when not authenticated", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter({
    bedrockClient: { send: async () => makeConverseResponse({ text: "" }) },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/turn");
  const req = createReq({
    body: { messages: [{ role: "user", content: "hi" }] },
    user: null,
  });
  const res = createRes();
  await handler(req, res);

  assert.equal(res.out.statusCode, 401);
  invalidateFlagsCache();
});

test("POST /api/agent/turn 400s when messages array is empty", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter();
  const handler = getRouterHandler(router, "post", "/api/agent/turn");
  const req = createReq({ body: { messages: [] } });
  const res = createRes();
  await handler(req, res);

  assert.equal(res.out.statusCode, 400);
  assert.equal(res.out.payload?.error, "messages_required");
  invalidateFlagsCache();
});

// ── Happy path: text-only response ─────────────────────────────────────────

test("POST /api/agent/turn returns text + emotion for text-only response", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter({
    bedrockClient: {
      send: async () =>
        makeConverseResponse({
          text: "Hi there!\n[EMOTION: happy]",
          stopReason: "end_turn",
        }),
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/turn");
  const req = createReq({ body: { messages: [{ role: "user", content: "hi" }] } });
  const res = createRes();
  await handler(req, res);

  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.payload.emotion, "happy");
  assert.match(res.out.payload.text, /Hi there/);
  assert.ok(!res.out.payload.text.includes("[EMOTION:"));
  assert.equal(res.out.payload.toolCalls, undefined);
  invalidateFlagsCache();
});

// ── Tool-use path ──────────────────────────────────────────────────────────

test("POST /api/agent/turn dispatches generate_image tool calls and returns toolCalls array", async () => {
  invalidateFlagsCache();
  process.env.REPLICATE_API_TOKEN = "test-token";

  const { router } = buildRouter({
    bedrockClient: {
      send: async () =>
        makeConverseResponse({
          text: "Picking anime at 3:4 — ikuyo!",
          toolUse: {
            toolUseId: "tu1",
            name: "generate_image",
            input: { prompt: "fox spirit at moonlit shrine", style: "anime", aspect: "3:4" },
          },
          stopReason: "tool_use",
        }),
    },
    replicateModelConfig: {
      "wai-nsfw-illustrious-v11": {
        modelId: "test/model:abc",
        sizes: [{ width: 768, height: 1024 }],
        schedulers: ["Euler a"],
        buildInput: ({ prompt, width, height, seed }) => ({ prompt, width, height, seed }),
      },
    },
    replicateClient: {
      run: async () => [],
      predictions: {
        create: async () => ({ id: "pred-xyz", status: "starting" }),
      },
    },
    buildReplicatePredictionRequest: ({ modelId, input }) => ({ model: modelId, input }),
    buildImageBatchId: () => "batch-xyz",
  });

  const handler = getRouterHandler(router, "post", "/api/agent/turn");
  const req = createReq({ body: { messages: [{ role: "user", content: "fox spirit" }] } });
  const res = createRes();
  await handler(req, res);

  assert.equal(res.out.statusCode, 200);
  assert.ok(Array.isArray(res.out.payload.toolCalls));
  assert.equal(res.out.payload.toolCalls.length, 1);
  const tc = res.out.payload.toolCalls[0];
  assert.equal(tc.name, "generate_image");
  assert.equal(tc.error, null);
  assert.equal(tc.result.predictionId, "pred-xyz");
  assert.equal(tc.result.batchId, "batch-xyz");
  assert.equal(tc.result.aspect, "3:4");
  assert.equal(tc.result.style, "anime");
  invalidateFlagsCache();
});

test("POST /api/agent/turn surfaces tool errors as toolCalls[].error", async () => {
  invalidateFlagsCache();
  delete process.env.REPLICATE_API_TOKEN; // force replicate_token_missing

  const { router } = buildRouter({
    bedrockClient: {
      send: async () =>
        makeConverseResponse({
          text: "On it!",
          toolUse: {
            toolUseId: "tu1",
            name: "generate_image",
            input: { prompt: "x" },
          },
          stopReason: "tool_use",
        }),
    },
  });

  const handler = getRouterHandler(router, "post", "/api/agent/turn");
  const req = createReq({ body: { messages: [{ role: "user", content: "x" }] } });
  const res = createRes();
  await handler(req, res);

  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.payload.toolCalls.length, 1);
  assert.equal(res.out.payload.toolCalls[0].error, "replicate_token_missing");
  assert.equal(res.out.payload.toolCalls[0].result, null);
  invalidateFlagsCache();
});

// ── Bedrock failure ────────────────────────────────────────────────────────

test("POST /api/agent/turn 500s when Bedrock send throws", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter({
    bedrockClient: {
      send: async () => {
        throw new Error("bedrock down");
      },
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/turn");
  const req = createReq({ body: { messages: [{ role: "user", content: "hi" }] } });
  const res = createRes();
  await handler(req, res);

  assert.equal(res.out.statusCode, 500);
  assert.equal(res.out.payload.error, "agent_unavailable");
  invalidateFlagsCache();
});

// ── v1: second model turn (closing sentence after tool result) ────────────

test("POST /api/agent/turn runs a closing turn after generate_image success", async () => {
  invalidateFlagsCache();
  process.env.REPLICATE_API_TOKEN = "test-token";

  let callCount = 0;
  const { router } = buildRouter({
    bedrockClient: {
      send: async () => {
        callCount += 1;
        if (callCount === 1) {
          return makeConverseResponse({
            text: "Picking anime — ikuyo!",
            toolUse: {
              toolUseId: "tu1",
              name: "generate_image",
              input: { prompt: "fox", style: "anime", aspect: "3:4" },
            },
            stopReason: "tool_use",
          });
        }
        // Second turn — closing sentence
        return makeConverseResponse({
          text: "Turned out softer than I expected — want a touch more contrast?",
          stopReason: "end_turn",
        });
      },
    },
    replicateModelConfig: {
      "wai-nsfw-illustrious-v11": {
        modelId: "test/model:abc",
        sizes: [{ width: 768, height: 1024 }],
        schedulers: ["Euler a"],
        buildInput: ({ prompt, width, height, seed }) => ({ prompt, width, height, seed }),
      },
    },
    replicateClient: {
      run: async () => [],
      predictions: { create: async () => ({ id: "pred-z", status: "starting" }) },
    },
    buildReplicatePredictionRequest: ({ modelId, input }) => ({ model: modelId, input }),
  });
  const handler = getRouterHandler(router, "post", "/api/agent/turn");
  const req = createReq({ body: { messages: [{ role: "user", content: "fox" }] } });
  const res = createRes();
  await handler(req, res);

  assert.equal(res.out.statusCode, 200);
  assert.equal(callCount, 2, "should make two Bedrock calls (initial + closing)");
  assert.match(res.out.payload.text, /Picking anime/);
  assert.match(res.out.payload.text, /softer than I expected/);
  invalidateFlagsCache();
});

test("POST /api/agent/turn skips closing turn for intent-only tools (continue_story)", async () => {
  invalidateFlagsCache();
  let callCount = 0;
  const { router } = buildRouter({
    bedrockClient: {
      send: async () => {
        callCount += 1;
        return makeConverseResponse({
          text: "Let's push the story on!",
          toolUse: {
            toolUseId: "tu1",
            name: "continue_story",
            input: { sessionId: "sX", content: "she runs" },
          },
          stopReason: "tool_use",
        });
      },
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/turn");
  const req = createReq({ body: { messages: [{ role: "user", content: "go" }] } });
  const res = createRes();
  await handler(req, res);

  assert.equal(callCount, 1, "intent tools (requiresConfirm) should NOT trigger a closing turn");
  assert.equal(res.out.payload.toolCalls[0].name, "continue_story");
  assert.equal(res.out.payload.toolCalls[0].result.requiresConfirm, true);
  invalidateFlagsCache();
});

test("POST /api/agent/turn injects <prefs> into system prompt when agentState loads prefs", async () => {
  invalidateFlagsCache();
  let capturedSystem = null;
  const { router } = buildRouter({
    bedrockClient: {
      send: async (cmd) => {
        if (!capturedSystem) capturedSystem = cmd?.input?.system?.[0]?.text;
        return makeConverseResponse({ text: "Hi!\n[EMOTION: neutral]", stopReason: "end_turn" });
      },
    },
    agentState: {
      load: async () => ({ lastStyle: "manga", lastAspect: "16:9", theme: "moonrise" }),
      patch: async () => {},
      clear: async () => {},
    },
  });
  const handler = getRouterHandler(router, "post", "/api/agent/turn");
  const req = createReq({ body: { messages: [{ role: "user", content: "hi" }] } });
  const res = createRes();
  await handler(req, res);

  assert.equal(res.out.statusCode, 200);
  assert.ok(capturedSystem);
  assert.match(capturedSystem, /<prefs>.*lastStyle=manga.*<\/prefs>/);
  invalidateFlagsCache();
});

// ── Memory endpoints ───────────────────────────────────────────────────────

test("GET /api/agent/memory/status returns hasMemory=false when unauthenticated", async () => {
  const { router } = buildRouter();
  const handler = getRouterHandler(router, "get", "/api/agent/memory/status");
  assert.ok(handler);
  const req = { query: {}, user: undefined };
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.payload.hasMemory, false);
});
test("DELETE /api/agent/memory clears memory for authenticated user", async () => {
  let cleared = false;
  const { router } = buildRouter({
    agentMemory: {
      SUMMARY_THRESHOLD: 30,
      loadMemory: async () => null,
      saveMessages: async () => {},
      updateSummary: async () => {},
      compactMemory: async () => {},
      clearMemory: async () => {
        cleared = true;
      },
      getMemoryStatus: async () => ({ hasMemory: false }),
    },
  });
  const handler = getRouterHandler(router, "delete", "/api/agent/memory");
  const req = { query: {}, user: { sub: "u1" } };
  const res = createRes();
  await handler(req, res);
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.payload.ok, true);
  assert.equal(cleared, true);
});
