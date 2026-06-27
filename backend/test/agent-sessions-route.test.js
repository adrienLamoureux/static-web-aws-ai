"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { getRouterHandler } = require("./helpers/test-utils");
const { createMockDeps } = require("./helpers/mock-deps");
const { invalidateFlagsCache } = require("../lib/feature-flags");

const buildRouter = (overrides = {}) => {
  const express = require("express");
  const router = express.Router();
  const deps = createMockDeps(overrides);
  require("../routes/agent-sessions-route")(router, deps);
  return { router, deps };
};

const createRes = () => {
  const out = { statusCode: 200, payload: null };
  const res = {
    status(code) {
      out.statusCode = code;
      return res;
    },
    json(p) {
      out.payload = p;
      return res;
    },
    out,
  };
  return res;
};

// In-memory agent-sessions stub (the mock-deps default returns empty arrays)
const makeSessionsStub = () => {
  const records = new Map();
  return {
    records,
    list: async () => Array.from(records.values()),
    create: async (_uid, { sessionId, name }) => {
      if (records.has(sessionId)) return records.get(sessionId);
      const s = { sessionId, name, createdAt: Date.now(), lastUsedAt: Date.now() };
      records.set(sessionId, s);
      return s;
    },
    rename: async (_uid, sessionId, name) => {
      if (!records.has(sessionId)) return null;
      const existing = records.get(sessionId);
      const updated = { ...existing, name };
      records.set(sessionId, updated);
      return { sessionId, name };
    },
    touch: async () => {},
    remove: async (_uid, sessionId) => {
      if (!records.has(sessionId)) return false;
      records.delete(sessionId);
      return true;
    },
  };
};

test("GET /api/agent/sessions 404s when agentMode flag is false", async () => {
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
  const handler = getRouterHandler(router, "get", "/api/agent/sessions");
  assert.ok(handler);
  const res = createRes();
  await handler({ user: { sub: "u1" }, query: {} }, res);
  assert.equal(res.out.statusCode, 404);
  invalidateFlagsCache();
});

test("GET /api/agent/sessions returns the user's sessions", async () => {
  invalidateFlagsCache();
  const sessions = makeSessionsStub();
  await sessions.create("u1", { sessionId: "alpha", name: "Alpha" });
  await sessions.create("u1", { sessionId: "beta", name: "Beta" });
  const { router } = buildRouter({ agentSessions: sessions });
  const handler = getRouterHandler(router, "get", "/api/agent/sessions");
  const res = createRes();
  await handler({ user: { sub: "u1" }, query: {} }, res);
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.payload.items.length, 2);
  invalidateFlagsCache();
});

test("POST /api/agent/sessions creates a session", async () => {
  invalidateFlagsCache();
  const sessions = makeSessionsStub();
  const { router } = buildRouter({ agentSessions: sessions });
  const handler = getRouterHandler(router, "post", "/api/agent/sessions");
  const res = createRes();
  await handler({ user: { sub: "u1" }, body: { sessionId: "myproj", name: "My Project" } }, res);
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.payload.session.sessionId, "myproj");
  assert.equal(res.out.payload.session.name, "My Project");
  assert.equal(sessions.records.size, 1);
  invalidateFlagsCache();
});

test("POST /api/agent/sessions 400s on missing sessionId", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter({ agentSessions: makeSessionsStub() });
  const handler = getRouterHandler(router, "post", "/api/agent/sessions");
  const res = createRes();
  await handler({ user: { sub: "u1" }, body: {} }, res);
  assert.equal(res.out.statusCode, 400);
  invalidateFlagsCache();
});

test("PATCH /api/agent/sessions/:id renames an existing session", async () => {
  invalidateFlagsCache();
  const sessions = makeSessionsStub();
  await sessions.create("u1", { sessionId: "alpha", name: "Alpha" });
  const { router } = buildRouter({ agentSessions: sessions });
  const handler = getRouterHandler(router, "patch", "/api/agent/sessions/:id");
  const res = createRes();
  await handler({ user: { sub: "u1" }, params: { id: "alpha" }, body: { name: "Renamed" } }, res);
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.payload.session.name, "Renamed");
  invalidateFlagsCache();
});

test("PATCH /api/agent/sessions/:id 404s for unknown session", async () => {
  invalidateFlagsCache();
  const { router } = buildRouter({ agentSessions: makeSessionsStub() });
  const handler = getRouterHandler(router, "patch", "/api/agent/sessions/:id");
  const res = createRes();
  await handler({ user: { sub: "u1" }, params: { id: "ghost" }, body: { name: "Whatever" } }, res);
  assert.equal(res.out.statusCode, 404);
  invalidateFlagsCache();
});

test("DELETE /api/agent/sessions/:id removes metadata + wipes memory", async () => {
  invalidateFlagsCache();
  const sessions = makeSessionsStub();
  await sessions.create("u1", { sessionId: "alpha", name: "Alpha" });
  let clearedFor = null;
  const { router } = buildRouter({
    agentSessions: sessions,
    agentMemory: {
      SUMMARY_THRESHOLD: 30,
      loadMemory: async () => null,
      saveMessages: async () => {},
      updateSummary: async () => {},
      compactMemory: async () => {},
      clearMemory: async (_uid, sid) => {
        clearedFor = sid;
      },
      getMemoryStatus: async () => ({ hasMemory: false }),
    },
  });
  const handler = getRouterHandler(router, "delete", "/api/agent/sessions/:id");
  const res = createRes();
  await handler({ user: { sub: "u1" }, params: { id: "alpha" } }, res);
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.payload.ok, true);
  assert.equal(sessions.records.size, 0);
  assert.equal(clearedFor, "alpha", "must clear memory for the deleted session");
  invalidateFlagsCache();
});
