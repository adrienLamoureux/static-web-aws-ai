"use strict";

/**
 * Tests for the new companion-mode dispatchers introduced in Companion v0.
 *
 *   - view_my_creations  (server-dispatch)
 *   - what_can_you_do    (static, no LLM)
 *
 * Mirrors the shape of `agent-tools-dispatchers.test.js` — stubs the
 * media store + S3 signer, asserts the tool result envelope.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  dispatchViewMyCreations,
  dispatchWhatCanYouDo,
} = require("../lib/agent-tools/companion-tools");

const makeDeps = ({ items = [] } = {}) => ({
  queryMediaItems: async () => items,
  s3Client: { send: async () => ({}) },
  getSignedUrl: async () => "https://example.com/signed",
  GetObjectCommand: function FakeGet(input) {
    this.input = input;
  },
});

// ─── view_my_creations ────────────────────────────────────────────────────

test("view_my_creations refuses without userId", async () => {
  const out = await dispatchViewMyCreations({ args: {}, deps: makeDeps(), userId: null });
  assert.equal(out.ok, false);
  assert.equal(out.error, "unauthorized");
});

test("view_my_creations returns the user's recent IMG items, sorted desc by createdAt", async () => {
  process.env.MEDIA_BUCKET = "test-bucket";
  const items = [
    { key: "a.png", prompt: "alpha", createdAt: 1 },
    { key: "b.png", prompt: "beta", createdAt: 3 },
    { key: "c.png", prompt: "gamma", createdAt: 2 },
  ];
  const out = await dispatchViewMyCreations({
    args: {},
    deps: makeDeps({ items }),
    userId: "u1",
  });
  assert.equal(out.ok, true);
  assert.equal(out.result.clientAction, "view_my_creations");
  assert.equal(out.result.count, 3);
  assert.deepEqual(
    out.result.items.map((i) => i.prompt),
    ["beta", "gamma", "alpha"]
  );
});

test("view_my_creations clamps limit to [1, 12]", async () => {
  const items = Array.from({ length: 20 }, (_, i) => ({
    key: `k${i}.png`,
    prompt: `p${i}`,
    createdAt: i,
  }));
  const out = await dispatchViewMyCreations({
    args: { limit: 99 },
    deps: makeDeps({ items }),
    userId: "u1",
  });
  assert.equal(out.result.count, 12, "limit must be clamped to 12 max");

  const out2 = await dispatchViewMyCreations({
    args: { limit: 0 },
    deps: makeDeps({ items }),
    userId: "u1",
  });
  assert.equal(out2.result.count, 8, "non-positive limit must fall back to default 8");
});

test("view_my_creations skips items with no key (defensive)", async () => {
  const items = [
    { key: "ok.png", prompt: "ok", createdAt: 2 },
    { prompt: "missing-key", createdAt: 1 },
    null,
  ];
  const out = await dispatchViewMyCreations({
    args: {},
    deps: makeDeps({ items }),
    userId: "u1",
  });
  assert.equal(out.result.count, 1);
  assert.equal(out.result.items[0].key, "ok.png");
});

test("view_my_creations returns error when queryMediaItems is unavailable", async () => {
  const out = await dispatchViewMyCreations({
    args: {},
    deps: { ...makeDeps(), queryMediaItems: null },
    userId: "u1",
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "media_store_unavailable");
});

test("view_my_creations tolerates store throws", async () => {
  const deps = {
    ...makeDeps(),
    queryMediaItems: async () => {
      throw new Error("dynamo down");
    },
  };
  const out = await dispatchViewMyCreations({ args: {}, deps, userId: "u1" });
  assert.equal(out.ok, false);
  assert.equal(out.error, "creations_fetch_failed");
});

// ─── what_can_you_do ──────────────────────────────────────────────────────

test("what_can_you_do returns a static capability list with no LLM call", async () => {
  const out = await dispatchWhatCanYouDo({ args: {}, deps: {}, userId: "u1" });
  assert.equal(out.ok, true);
  assert.equal(out.result.clientAction, "what_can_you_do");
  assert.ok(typeof out.result.title === "string" && out.result.title.length > 0);
  assert.ok(Array.isArray(out.result.items) && out.result.items.length >= 5);
  for (const item of out.result.items) {
    assert.ok(typeof item.label === "string" && item.label.length > 0);
    assert.ok(typeof item.hint === "string");
  }
});

test("what_can_you_do works with no deps + no userId (pure static)", async () => {
  const out = await dispatchWhatCanYouDo({});
  assert.equal(out.ok, true);
  assert.ok(out.result.items.length > 0);
});
