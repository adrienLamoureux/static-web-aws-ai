"use strict";

/**
 * Tests for A5 (moderation routes), A6 (feature flags routes),
 * and usage-helpers unit tests.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { getRouterHandler, createMockRes, withEnv } = require("./helpers/test-utils");
const { createMockDeps } = require("./helpers/mock-deps");
const { invalidateFlagsCache } = require("../lib/feature-flags");

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
// A5 — Moderation routes
// ═══════════════════════════════════════════════════════════════════════════

test("GET /shared/images returns image list with presigned URLs", async () => {
  const mockContents = [
    { Key: "shared/images/cat.jpg", Size: 12000, LastModified: new Date() },
    { Key: "shared/images/dog.png", Size: 8000, LastModified: new Date() },
  ];
  const deps = buildAdminDeps({
    s3Client: { send: async () => ({ Contents: mockContents, NextContinuationToken: null }) },
    getSignedUrl: async () => "https://mock-url.example.com/image.jpg",
  });

  await withEnv({ MEDIA_BUCKET: "test-bucket" }, async () => {
    const router = require("../routes/ops/moderation-routes")(deps);
    const handler = getRouterHandler(router, "get", "/shared/images");
    assert.ok(handler, "handler should exist");

    const req = createReq({ query: { limit: "50" }, method: "GET" });
    const res = createMockRes();
    await handler(req, res);

    assert.equal(res.output.statusCode, 200);
    assert.ok(Array.isArray(res.output.payload.images));
    assert.equal(res.output.payload.images.length, 2);
    assert.ok(res.output.payload.images[0].url);
    assert.ok(typeof res.output.payload.images[0].size === "number");
  });
});

test("POST /shared/images/delete rejects key not starting with shared/images/", async () => {
  const deps = buildAdminDeps();
  await withEnv({ MEDIA_BUCKET: "test-bucket" }, async () => {
    const router = require("../routes/ops/moderation-routes")(deps);
    const handler = getRouterHandler(router, "post", "/shared/images/delete");

    const req = createReq({ body: { key: "users/admin-1/images/secret.jpg" }, method: "POST" });
    const res = createMockRes();
    await handler(req, res);

    assert.equal(res.output.statusCode, 400);
  });
});

test("POST /shared/images/delete deletes valid shared image key", async () => {
  let deletedKey = null;
  const deps = buildAdminDeps({
    s3Client: {
      send: async (cmd) => {
        if (cmd.input && cmd.input.Key) deletedKey = cmd.input.Key;
        return {};
      },
    },
    dynamoClient: { send: async () => ({ Items: [] }) },
  });

  await withEnv({ MEDIA_BUCKET: "test-bucket" }, async () => {
    const router = require("../routes/ops/moderation-routes")(deps);
    const handler = getRouterHandler(router, "post", "/shared/images/delete");

    const req = createReq({ body: { key: "shared/images/cat.jpg" }, method: "POST" });
    const res = createMockRes();
    await handler(req, res);

    assert.equal(res.output.statusCode, 200);
    assert.equal(res.output.payload.deleted, true);
    assert.equal(deletedKey, "shared/images/cat.jpg");
  });
});

test("POST /shared/videos/delete rejects key not starting with shared/videos/", async () => {
  const deps = buildAdminDeps();
  await withEnv({ MEDIA_BUCKET: "test-bucket" }, async () => {
    const router = require("../routes/ops/moderation-routes")(deps);
    const handler = getRouterHandler(router, "post", "/shared/videos/delete");

    const req = createReq({ body: { key: "shared/images/cat.jpg" }, method: "POST" });
    const res = createMockRes();
    await handler(req, res);

    assert.equal(res.output.statusCode, 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A6 — Feature flags routes
// ═══════════════════════════════════════════════════════════════════════════

test("GET /director/features returns all flags (public endpoint)", async () => {
  invalidateFlagsCache();
  const deps = buildAdminDeps({
    dynamoClient: { send: async () => ({ Item: null }) },
  });

  const router = require("../routes/ops/feature-flags-routes")(deps);
  const handler = getRouterHandler(router, "get", "/director/features");
  assert.ok(handler, "handler should exist");

  const req = createReq({ user: undefined, method: "GET" });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.output.statusCode, 200);
  assert.ok(res.output.payload.flags, "should have flags");
  assert.ok(typeof res.output.payload.flags.enableStoryAnimations === "boolean");
  assert.ok(typeof res.output.payload.flags.enableCivitaiSync === "boolean");
});

test("GET /director/features defaults all flags to true when no DB item", async () => {
  invalidateFlagsCache();
  const deps = buildAdminDeps({
    dynamoClient: { send: async () => ({ Item: null }) },
  });
  const router = require("../routes/ops/feature-flags-routes")(deps);
  const handler = getRouterHandler(router, "get", "/director/features");

  const req = createReq({ user: undefined, method: "GET" });
  const res = createMockRes();
  await handler(req, res);

  const flags = res.output.payload.flags;
  assert.equal(flags.enableStoryAnimations, true);
  assert.equal(flags.enableCivitaiSync, true);
  assert.equal(flags.enableNovaReelVideos, true);
  assert.equal(flags.enableCompanionInitiative, true);
});

test("PUT /director/features updates a flag and returns merged flags", async () => {
  invalidateFlagsCache();
  let savedItem = null;
  const deps = buildAdminDeps({
    dynamoClient: {
      send: async (cmd) => {
        if (cmd.input && cmd.input.Item) {
          savedItem = cmd.input.Item;
          return {};
        }
        return { Item: null };
      },
    },
  });

  const router = require("../routes/ops/feature-flags-routes")(deps);
  const handler = getRouterHandler(router, "put", "/director/features");
  assert.ok(handler, "handler should exist");

  const req = createReq({
    body: { flags: { enableCivitaiSync: false } },
    method: "PUT",
  });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.output.statusCode, 200);
  assert.ok(res.output.payload.flags, "should return flags");
  assert.equal(res.output.payload.flags.enableCivitaiSync, false);
  assert.equal(res.output.payload.flags.enableStoryAnimations, true);
  assert.ok(savedItem, "DynamoDB put should have been called");
});

test("PUT /director/features rejects unknown flag names", async () => {
  invalidateFlagsCache();
  const deps = buildAdminDeps();
  const router = require("../routes/ops/feature-flags-routes")(deps);
  const handler = getRouterHandler(router, "put", "/director/features");

  const req = createReq({
    body: { flags: { unknownFlag: true } },
    method: "PUT",
  });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.output.statusCode, 400);
  assert.ok(Array.isArray(res.output.payload.unknownKeys));
  assert.ok(res.output.payload.unknownKeys.includes("unknownFlag"));
});

// ═══════════════════════════════════════════════════════════════════════════
// usage-helpers unit tests
// ═══════════════════════════════════════════════════════════════════════════

test("usage-helpers: estimateJobCost returns model cost for known model", () => {
  const { estimateJobCost } = require("../routes/ops/usage-helpers");
  const cost = estimateJobCost({ model: "animagine", provider: "replicate" });
  assert.equal(cost, 0.003);
});

test("usage-helpers: estimateJobCost falls back to provider cost for unknown model", () => {
  const { estimateJobCost } = require("../routes/ops/usage-helpers");
  const cost = estimateJobCost({ model: "mystery-model", provider: "replicate" });
  assert.equal(cost, 0.004);
});

test("usage-helpers: estimateJobCost returns 0 for unknown model and provider", () => {
  const { estimateJobCost } = require("../routes/ops/usage-helpers");
  const cost = estimateJobCost({ model: "unknown", provider: "unknown" });
  assert.equal(cost, 0);
});

test("usage-helpers: parseUsageWindow handles all window values", () => {
  const { parseUsageWindow } = require("../routes/ops/usage-helpers");
  const now = Date.now();

  const since24h = new Date(parseUsageWindow("24h")).getTime();
  assert.ok(now - since24h > 23 * 60 * 60 * 1000, "24h window should be > 23h ago");
  assert.ok(now - since24h < 25 * 60 * 60 * 1000, "24h window should be < 25h ago");

  const since7d = new Date(parseUsageWindow("7d")).getTime();
  assert.ok(now - since7d > 6 * 24 * 60 * 60 * 1000, "7d window should be > 6 days ago");

  const since30d = new Date(parseUsageWindow("30d")).getTime();
  assert.ok(now - since30d > 29 * 24 * 60 * 60 * 1000, "30d window should be > 29 days ago");
});

test("usage-helpers: aggregateUsage computes totals correctly", () => {
  const { aggregateUsage } = require("../routes/ops/usage-helpers");
  const items = [
    { provider: "replicate", model: "animagine", status: "completed" },
    { provider: "replicate", model: "animagine", status: "failed" },
    { provider: "civitai", model: "civitai", status: "completed" },
  ];
  const result = aggregateUsage(items);

  assert.equal(result.jobCount, 3);
  assert.equal(result.failedCount, 1);
  assert.ok(result.totalUsd > 0, "total cost should be positive");
  assert.ok(Array.isArray(result.byProvider));
  assert.ok(Array.isArray(result.byModel));
});
