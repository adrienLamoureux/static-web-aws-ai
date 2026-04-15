"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { getRouterHandler } = require("./helpers/test-utils");
const { createMockDeps } = require("./helpers/mock-deps");

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Mount companion-route on a fresh Express Router and return a helper that
 * invokes a named handler directly (no HTTP server needed).
 */
const buildRouter = (depsOverrides = {}) => {
  const express = require("express");
  const router = express.Router();
  const deps = createMockDeps(depsOverrides);
  require("../routes/companion-route")(router, deps);
  return { router, deps };
};

const createReq = ({
  body = {},
  query = {},
  params = {},
  user = undefined,
  method = "GET",
} = {}) => ({ body, query, params, user, method });

const createRes = () => {
  const out = { statusCode: 200, payload: null };
  const res = {
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

/**
 * Make a Bedrock send stub that returns the given text in the expected shape.
 */
const makeSend = (text) => async () => ({
  body: new TextEncoder().encode(JSON.stringify({ content: [{ type: "text", text }] })),
});

// ── POST /api/companion/chat ───────────────────────────────────────────────

test("POST /api/companion/chat returns text and emotion for a valid request", async () => {
  const { router } = buildRouter({
    bedrockClient: { send: makeSend("Hello there! [EMOTION: happy]") },
  });
  const handler = getRouterHandler(router, "post", "/api/companion/chat");
  assert.ok(handler, "handler should exist");

  const req = createReq({ body: { messages: [{ role: "user", content: "Hi" }] }, method: "POST" });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.out.statusCode, 200);
  assert.ok(res.out.payload, "should have payload");
  assert.ok(typeof res.out.payload.text === "string", "payload.text should be a string");
  assert.equal(res.out.payload.emotion, "happy");
});

test("POST /api/companion/chat strips EMOTION tag from text", async () => {
  const { router } = buildRouter({
    bedrockClient: { send: makeSend("Nice work! [EMOTION: surprised]") },
  });
  const handler = getRouterHandler(router, "post", "/api/companion/chat");
  const req = createReq({
    body: { messages: [{ role: "user", content: "Hello" }] },
    method: "POST",
  });
  const res = createRes();

  await handler(req, res);

  assert.ok(!res.out.payload.text.includes("[EMOTION:"), "text should not contain EMOTION tag");
});

test("POST /api/companion/chat defaults to neutral emotion when tag missing", async () => {
  const { router } = buildRouter({
    bedrockClient: { send: makeSend("Hello, I am here.") },
  });
  const handler = getRouterHandler(router, "post", "/api/companion/chat");
  const req = createReq({ body: { messages: [{ role: "user", content: "Hi" }] }, method: "POST" });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.out.payload.emotion, "neutral");
});

test("POST /api/companion/chat parses GENERATE_IMAGE action tag", async () => {
  const { router } = buildRouter({
    bedrockClient: {
      send: makeSend("Here's an image!\n[GENERATE_IMAGE: anime girl, forest]\n[EMOTION: happy]"),
    },
  });
  const handler = getRouterHandler(router, "post", "/api/companion/chat");
  const req = createReq({
    body: { messages: [{ role: "user", content: "Draw something" }] },
    method: "POST",
  });
  const res = createRes();

  await handler(req, res);

  assert.ok(res.out.payload.generation, "should have generation field");
  assert.equal(res.out.payload.generation.type, "image");
  assert.equal(res.out.payload.generation.prompt, "anime girl, forest");
});

test("POST /api/companion/chat parses NAVIGATE action tag for valid path", async () => {
  const { router } = buildRouter({
    bedrockClient: { send: makeSend("Going there!\n[NAVIGATE: /gallery]\n[EMOTION: happy]") },
  });
  const handler = getRouterHandler(router, "post", "/api/companion/chat");
  const req = createReq({
    body: { messages: [{ role: "user", content: "Take me to gallery" }] },
    method: "POST",
  });
  const res = createRes();

  await handler(req, res);

  assert.ok(res.out.payload.navigation, "should have navigation field");
  assert.equal(res.out.payload.navigation.path, "/gallery");
});

test("POST /api/companion/chat ignores NAVIGATE tag for invalid path", async () => {
  const { router } = buildRouter({
    bedrockClient: { send: makeSend("Going there!\n[NAVIGATE: /invalid]\n[EMOTION: happy]") },
  });
  const handler = getRouterHandler(router, "post", "/api/companion/chat");
  const req = createReq({
    body: { messages: [{ role: "user", content: "Take me somewhere" }] },
    method: "POST",
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.out.payload.navigation, undefined, "invalid path should produce no navigation");
});

test("POST /api/companion/chat parses START_STORY action tag", async () => {
  const { router } = buildRouter({
    bedrockClient: {
      send: makeSend("Let's begin!\n[START_STORY: Dragon Quest | fantasy]\n[EMOTION: happy]"),
    },
  });
  const handler = getRouterHandler(router, "post", "/api/companion/chat");
  const req = createReq({
    body: { messages: [{ role: "user", content: "Start a story" }] },
    method: "POST",
  });
  const res = createRes();

  await handler(req, res);

  assert.ok(res.out.payload.storyAction, "should have storyAction field");
  assert.equal(res.out.payload.storyAction.type, "start_story");
  assert.equal(res.out.payload.storyAction.title, "Dragon Quest");
  assert.equal(res.out.payload.storyAction.genre, "fantasy");
});

test("POST /api/companion/chat parses GENERATE_MUSIC action tag", async () => {
  const { router } = buildRouter({
    bedrockClient: {
      send: makeSend("Music time!\n[GENERATE_MUSIC: melancholic | gentle piano]\n[EMOTION: sad]"),
    },
  });
  const handler = getRouterHandler(router, "post", "/api/companion/chat");
  const req = createReq({
    body: { messages: [{ role: "user", content: "Play some music" }] },
    method: "POST",
  });
  const res = createRes();

  await handler(req, res);

  assert.ok(res.out.payload.musicAction, "should have musicAction field");
  assert.equal(res.out.payload.musicAction.type, "generate_music");
  assert.equal(res.out.payload.musicAction.mood, "melancholic");
  assert.equal(res.out.payload.musicAction.description, "gentle piano");
});

test("POST /api/companion/chat returns 500 on Bedrock error", async () => {
  const { router } = buildRouter({
    bedrockClient: {
      send: async () => {
        throw new Error("bedrock unavailable");
      },
    },
  });
  const handler = getRouterHandler(router, "post", "/api/companion/chat");
  const req = createReq({ body: { messages: [{ role: "user", content: "Hi" }] }, method: "POST" });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.out.statusCode, 500);
  assert.equal(res.out.payload.error, "companion_unavailable");
});

test("POST /api/companion/chat loads memory for authenticated user", async () => {
  let loadMemoryCalled = false;
  const { router } = buildRouter({
    bedrockClient: { send: makeSend("Hi! [EMOTION: happy]") },
    companionMemory: {
      SUMMARY_THRESHOLD: 30,
      loadMemory: async () => {
        loadMemoryCalled = true;
        return { summary: "test", messages: [], turnCount: 0 };
      },
      saveMessages: async () => {},
      compactMemory: async () => {},
    },
  });

  const handler = getRouterHandler(router, "post", "/api/companion/chat");
  const req = createReq({
    body: { messages: [{ role: "user", content: "Hi" }] },
    user: { sub: "user-123" },
    method: "POST",
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(loadMemoryCalled, true, "loadMemory should be called for authenticated user");
  assert.equal(res.out.payload.hasMemory, true, "response should indicate memory is present");
});

test("POST /api/companion/chat does not load memory for anonymous user", async () => {
  let loadMemoryCalled = false;
  const { router } = buildRouter({
    bedrockClient: { send: makeSend("Hi! [EMOTION: happy]") },
    companionMemory: {
      SUMMARY_THRESHOLD: 30,
      loadMemory: async () => {
        loadMemoryCalled = true;
        return null;
      },
      saveMessages: async () => {},
      compactMemory: async () => {},
    },
  });

  const handler = getRouterHandler(router, "post", "/api/companion/chat");
  const req = createReq({ body: { messages: [{ role: "user", content: "Hi" }] }, method: "POST" });
  const res = createRes();

  await handler(req, res);

  assert.equal(loadMemoryCalled, false, "loadMemory should NOT be called for anonymous user");
});

test("POST /api/companion/chat uses fallback message when messages array is empty", async () => {
  const { router } = buildRouter({
    bedrockClient: { send: makeSend("Hello! [EMOTION: happy]") },
  });
  const handler = getRouterHandler(router, "post", "/api/companion/chat");
  // No messages array — handler should use fallback
  const req = createReq({ body: {}, method: "POST" });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.out.statusCode, 200);
  assert.ok(res.out.payload.text, "should still return text");
});

// ── POST /api/companion/proactive ─────────────────────────────────────────

test("POST /api/companion/proactive returns text and emotion", async () => {
  const { router } = buildRouter({
    bedrockClient: { send: makeSend("Looking good! [EMOTION: happy]") },
  });
  const handler = getRouterHandler(router, "post", "/api/companion/proactive");
  assert.ok(handler, "handler should exist");

  const req = createReq({
    body: { trigger: "generation_done", context: { page: "/atelier" } },
    method: "POST",
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.out.statusCode, 200);
  assert.ok(res.out.payload.text, "should return text");
  assert.equal(res.out.payload.emotion, "happy");
});

test("POST /api/companion/proactive defaults trigger to idle when not provided", async () => {
  const { router } = buildRouter({
    bedrockClient: { send: makeSend("Still here! [EMOTION: neutral]") },
  });
  const handler = getRouterHandler(router, "post", "/api/companion/proactive");
  // No trigger field
  const req = createReq({ body: { context: {} }, method: "POST" });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.out.statusCode, 200);
});

test("POST /api/companion/proactive returns 500 on Bedrock error", async () => {
  const { router } = buildRouter({
    bedrockClient: {
      send: async () => {
        throw new Error("fail");
      },
    },
  });
  const handler = getRouterHandler(router, "post", "/api/companion/proactive");
  const req = createReq({ body: { trigger: "idle", context: {} }, method: "POST" });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.out.statusCode, 500);
  assert.equal(res.out.payload.error, "companion_unavailable");
});

test("POST /api/companion/proactive strips EMOTION tag from returned text", async () => {
  const { router } = buildRouter({
    bedrockClient: { send: makeSend("Welcome back! [EMOTION: happy]") },
  });
  const handler = getRouterHandler(router, "post", "/api/companion/proactive");
  const req = createReq({ body: { trigger: "return", context: { page: "/" } }, method: "POST" });
  const res = createRes();

  await handler(req, res);

  assert.ok(!res.out.payload.text.includes("[EMOTION:"), "EMOTION tag must be stripped");
});

// ── GET /api/companion/memory/status ──────────────────────────────────────

test("GET /api/companion/memory/status returns hasMemory: false for anonymous user", async () => {
  const { router } = buildRouter();
  const handler = getRouterHandler(router, "get", "/api/companion/memory/status");
  assert.ok(handler, "handler should exist");

  const req = createReq({ query: {}, method: "GET" });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.payload.hasMemory, false);
});

test("GET /api/companion/memory/status calls getMemoryStatus for authenticated user", async () => {
  let getStatusCalled = false;
  const { router } = buildRouter({
    companionMemory: {
      getMemoryStatus: async () => {
        getStatusCalled = true;
        return { hasMemory: true, turnCount: 5 };
      },
    },
  });
  const handler = getRouterHandler(router, "get", "/api/companion/memory/status");
  const req = createReq({
    query: { modelId: "hiyori_free" },
    user: { sub: "user-1" },
    method: "GET",
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(getStatusCalled, true, "getMemoryStatus should be called for auth user");
  assert.equal(res.out.payload.hasMemory, true);
  assert.equal(res.out.payload.turnCount, 5);
});

test("GET /api/companion/memory/status returns hasMemory: false on error", async () => {
  const { router } = buildRouter({
    companionMemory: {
      getMemoryStatus: async () => {
        throw new Error("dynamo error");
      },
    },
  });
  const handler = getRouterHandler(router, "get", "/api/companion/memory/status");
  const req = createReq({ query: {}, user: { sub: "user-1" }, method: "GET" });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.out.payload.hasMemory, false, "should return false on error");
});

// ── DELETE /api/companion/memory ──────────────────────────────────────────

test("DELETE /api/companion/memory clears memory and returns ok: true", async () => {
  let clearCalled = false;
  const { router } = buildRouter({
    requireUserMiddleware: (req, res, next) => {
      req.user = { sub: "user-1" };
      next();
    },
    companionMemory: {
      clearMemory: async () => {
        clearCalled = true;
      },
    },
  });
  const handler = getRouterHandler(router, "delete", "/api/companion/memory");
  assert.ok(handler, "handler should exist");

  const req = createReq({
    query: { modelId: "hiyori_free" },
    user: { sub: "user-1" },
    method: "DELETE",
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.payload.ok, true);
  assert.equal(clearCalled, true, "clearMemory should have been called");
});

test("DELETE /api/companion/memory uses default modelId when not provided", async () => {
  let capturedModelId;
  const { router } = buildRouter({
    requireUserMiddleware: (req, res, next) => {
      req.user = { sub: "user-1" };
      next();
    },
    companionMemory: {
      clearMemory: async (userId, modelId) => {
        capturedModelId = modelId;
      },
    },
  });
  const handler = getRouterHandler(router, "delete", "/api/companion/memory");
  const req = createReq({ query: {}, user: { sub: "user-1" }, method: "DELETE" });
  const res = createRes();

  await handler(req, res);

  assert.equal(capturedModelId, "hiyori_free", "should default to hiyori_free");
});

test("DELETE /api/companion/memory returns 503 when companionMemory not available", async () => {
  const express = require("express");
  const router = express.Router();
  // Null out companionMemory via deps
  const deps = createMockDeps({
    companionMemory: null,
    requireUserMiddleware: (req, res, next) => {
      req.user = { sub: "user-1" };
      next();
    },
  });
  require("../routes/companion-route")(router, deps);

  const handler = getRouterHandler(router, "delete", "/api/companion/memory");
  const req = createReq({ query: {}, user: { sub: "user-1" }, method: "DELETE" });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.out.statusCode, 503);
  assert.equal(res.out.payload.error, "storage_unavailable");
});
