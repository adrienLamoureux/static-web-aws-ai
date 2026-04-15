"use strict";

/**
 * Tests for A1 (job retry/cancel), A2 (cross-user sessions),
 * A3 (companion memory admin), A4 (usage endpoint).
 * A5/A6/helpers are in sanctum-admin-flags.test.js.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { getRouterHandler, createMockRes } = require("./helpers/test-utils");
const { createMockDeps } = require("./helpers/mock-deps");

// ── Shared helpers ─────────────────────────────────────────────────────────

const createReq = ({
  body = {},
  query = {},
  params = {},
  user = { sub: "admin-1", groups: ["admin"] },
  method = "GET",
} = {}) => ({ body, query, params, user, method });

const buildAdminDeps = (overrides = {}) =>
  createMockDeps({
    requireUserMiddleware: (req, res, next) => {
      if (!req.user?.sub) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      next();
    },
    requireAdminMiddleware: (req, res, next) => {
      if (!req.user?.groups?.includes("admin")) {
        res.status(403).json({ message: "Admin access required" });
        return;
      }
      next();
    },
    ...overrides,
  });

// ═══════════════════════════════════════════════════════════════════════════
// A1 — Job retry / cancel
// ═══════════════════════════════════════════════════════════════════════════

test("POST /director/jobs/retry resets a failed job to queued", async () => {
  const failedItem = {
    pk: "USER#admin-1",
    sk: "JOB#job-1",
    type: "JOB",
    key: "job-1",
    status: "failed",
    errorMessage: "something went wrong",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  let savedItem = null;
  const deps = buildAdminDeps({
    getItem: async () => failedItem,
    putMediaItem: async ({ extra }) => {
      savedItem = extra;
    },
  });
  const router = require("../routes/ops/dashboard-routes")(deps);
  const handler = getRouterHandler(router, "post", "/director/jobs/retry");
  assert.ok(handler, "handler should exist");

  const req = createReq({ body: { jobKey: "job-1" }, method: "POST" });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.output.statusCode, 200);
  assert.ok(savedItem, "putMediaItem should have been called");
  assert.equal(savedItem.status, "queued");
  assert.ok(!savedItem.errorMessage, "errorMessage should be cleared");
});

test("POST /director/jobs/retry returns 409 when job is not failed", async () => {
  const deps = buildAdminDeps({
    getItem: async () => ({ pk: "USER#admin-1", sk: "JOB#job-1", status: "queued", createdAt: "" }),
    putMediaItem: async () => {},
  });
  const router = require("../routes/ops/dashboard-routes")(deps);
  const handler = getRouterHandler(router, "post", "/director/jobs/retry");

  const req = createReq({ body: { jobKey: "job-1" }, method: "POST" });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.output.statusCode, 409);
});

test("POST /director/jobs/cancel sets a queued job to cancelled", async () => {
  const queuedItem = {
    pk: "USER#admin-1",
    sk: "JOB#job-2",
    type: "JOB",
    key: "job-2",
    status: "queued",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  let savedItem = null;
  const deps = buildAdminDeps({
    getItem: async () => queuedItem,
    putMediaItem: async ({ extra }) => {
      savedItem = extra;
    },
  });
  const router = require("../routes/ops/dashboard-routes")(deps);
  const handler = getRouterHandler(router, "post", "/director/jobs/cancel");
  assert.ok(handler, "handler should exist");

  const req = createReq({ body: { jobKey: "job-2" }, method: "POST" });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.output.statusCode, 200);
  assert.equal(savedItem.status, "cancelled");
});

test("POST /director/jobs/cancel returns 409 when job is already completed", async () => {
  const deps = buildAdminDeps({
    getItem: async () => ({ pk: "USER#admin-1", sk: "JOB#j", status: "completed", createdAt: "" }),
    putMediaItem: async () => {},
  });
  const router = require("../routes/ops/dashboard-routes")(deps);
  const handler = getRouterHandler(router, "post", "/director/jobs/cancel");

  const req = createReq({ body: { jobKey: "j" }, method: "POST" });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.output.statusCode, 409);
});

test("POST /director/jobs/retry returns 400 when jobKey is missing", async () => {
  const deps = buildAdminDeps({ getItem: async () => null });
  const router = require("../routes/ops/dashboard-routes")(deps);
  const handler = getRouterHandler(router, "post", "/director/jobs/retry");

  const req = createReq({ body: {}, method: "POST" });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.output.statusCode, 400);
});

// ═══════════════════════════════════════════════════════════════════════════
// A2 — Cross-user story sessions
// ═══════════════════════════════════════════════════════════════════════════

test("GET /director/story/sessions/all returns sessions from scan", async () => {
  const mockItems = [
    {
      pk: "USER#user-1",
      sk: "SESSION#sess-1",
      title: "My Story",
      turnCount: 5,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      pk: "USER#user-2",
      sk: "SESSION#sess-2",
      title: "Another",
      turnCount: 2,
      createdAt: "2026-01-02T00:00:00.000Z",
    },
    // MSG item should be filtered out
    { pk: "USER#user-1", sk: "SESSION#sess-1#MSG#001", role: "user", content: "hi" },
  ];
  const deps = buildAdminDeps({
    dynamoClient: {
      send: async () => ({ Items: mockItems }),
    },
  });

  const router = require("../routes/ops/director-admin-routes")(deps);
  const handler = getRouterHandler(router, "get", "/director/story/sessions/all");
  assert.ok(handler, "handler should exist");

  const req = createReq({ query: { limit: "10" }, method: "GET" });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.output.statusCode, 200);
  assert.ok(Array.isArray(res.output.payload.sessions), "sessions should be an array");
  // MSG# item should be filtered out
  assert.equal(res.output.payload.sessions.length, 2);
  // Sorted newest first — user-2 has newer createdAt
  assert.equal(res.output.payload.sessions[0].userId, "user-2");
});

test("GET /director/story/sessions/all respects limit", async () => {
  const manyItems = Array.from({ length: 50 }, (_, i) => ({
    pk: `USER#user-${i}`,
    sk: `SESSION#sess-${i}`,
    title: `Story ${i}`,
    createdAt: `2026-01-01T0${String(i).padStart(1, "0")}:00:00.000Z`,
  }));
  const deps = buildAdminDeps({
    dynamoClient: {
      send: async () => ({ Items: manyItems }),
    },
  });
  const router = require("../routes/ops/director-admin-routes")(deps);
  const handler = getRouterHandler(router, "get", "/director/story/sessions/all");

  const req = createReq({ query: { limit: "5" }, method: "GET" });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.output.statusCode, 200);
  assert.equal(res.output.payload.sessions.length, 5, "should respect limit");
});

// ═══════════════════════════════════════════════════════════════════════════
// A3 — Companion memory admin
// ═══════════════════════════════════════════════════════════════════════════

test("GET /director/companion/memory returns memory for userId+modelId", async () => {
  const memRecord = {
    pk: "USER#target-user",
    sk: "COMPANION#hiyori_free",
    summary: "User loves dragons",
    turnCount: 10,
    updatedAt: 1704067200000,
  };
  const deps = buildAdminDeps({
    dynamoClient: {
      send: async () => ({ Item: memRecord, Items: [] }),
    },
    queryBySkPrefix: async () => [
      { role: "user", content: "Hello", createdAt: 1000 },
      { role: "assistant", content: "Hi!", createdAt: 1001 },
    ],
  });

  const router = require("../routes/ops/director-admin-routes")(deps);
  const handler = getRouterHandler(router, "get", "/director/companion/memory");
  assert.ok(handler, "handler should exist");

  const req = createReq({
    query: { userId: "target-user", modelId: "hiyori_free" },
    method: "GET",
  });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.output.statusCode, 200);
  assert.equal(res.output.payload.summary, "User loves dragons");
  assert.equal(res.output.payload.turnCount, 10);
  assert.ok(Array.isArray(res.output.payload.recentMessages));
});

test("GET /director/companion/memory returns 400 when userId is missing", async () => {
  const deps = buildAdminDeps();
  const router = require("../routes/ops/director-admin-routes")(deps);
  const handler = getRouterHandler(router, "get", "/director/companion/memory");

  const req = createReq({ query: {}, method: "GET" });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.output.statusCode, 400);
});

test("DELETE /director/companion/memory calls clearMemory and returns cleared: true", async () => {
  let clearCalled = false;
  const deps = buildAdminDeps({
    companionMemory: {
      clearMemory: async (userId, modelId) => {
        clearCalled = true;
        assert.equal(userId, "target-user");
        assert.equal(modelId, "hiyori_free");
      },
    },
  });

  const router = require("../routes/ops/director-admin-routes")(deps);
  const handler = getRouterHandler(router, "delete", "/director/companion/memory");
  assert.ok(handler, "handler should exist");

  const req = createReq({
    query: { userId: "target-user", modelId: "hiyori_free" },
    method: "DELETE",
  });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.output.statusCode, 200);
  assert.equal(res.output.payload.cleared, true);
  assert.equal(clearCalled, true, "clearMemory should have been called");
});

// ═══════════════════════════════════════════════════════════════════════════
// A4 — Usage endpoint
// ═══════════════════════════════════════════════════════════════════════════

test("GET /director/usage returns aggregated usage data", async () => {
  const mockJobs = [
    {
      pk: "USER#u1",
      sk: "JOB#1",
      provider: "replicate",
      model: "animagine",
      status: "completed",
      createdAt: new Date().toISOString(),
    },
    {
      pk: "USER#u1",
      sk: "JOB#2",
      provider: "replicate",
      model: "animagine",
      status: "failed",
      createdAt: new Date().toISOString(),
    },
    {
      pk: "USER#u2",
      sk: "JOB#3",
      provider: "civitai",
      model: "civitai",
      status: "completed",
      createdAt: new Date().toISOString(),
    },
  ];
  const deps = buildAdminDeps({
    dynamoClient: {
      send: async () => ({ Items: mockJobs }),
    },
  });

  const router = require("../routes/ops/dashboard-routes")(deps);
  const handler = getRouterHandler(router, "get", "/director/usage");
  assert.ok(handler, "handler should exist");

  const req = createReq({ query: { window: "24h" }, method: "GET" });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.output.statusCode, 200);
  assert.equal(res.output.payload.window, "24h");
  assert.equal(res.output.payload.jobCount, 3);
  assert.equal(res.output.payload.failedCount, 1);
  assert.ok(Array.isArray(res.output.payload.byProvider));
  assert.ok(Array.isArray(res.output.payload.byModel));
});

test("GET /director/usage returns 500 when MEDIA_TABLE is not set", async () => {
  const deps = buildAdminDeps({ mediaTable: null });
  const router = require("../routes/ops/dashboard-routes")(deps);
  const handler = getRouterHandler(router, "get", "/director/usage");

  const req = createReq({ query: { window: "24h" }, method: "GET" });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.output.statusCode, 500);
});
