"use strict";

/**
 * Tests for the generate_image dispatcher's image daily cap gate.
 *
 * The cap is the single bound on Replicate spend per user (the dominant cost
 * driver — ~90% of total per the v1.7 cost model). Without this, a token-cap-
 * exhausted user could still burn unlimited Replicate budget.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { dispatchGenerateImage } = require("../lib/agent-tools/generate-image");

// Minimal deps needed for the dispatcher to reach the cap gate without
// firing real Replicate calls. The cap is checked BEFORE Replicate is
// invoked, so we don't need to stub Replicate for the deny case.
const baseDeps = () => ({
  replicateClient: { predictions: { create: async () => ({ id: "p-1", status: "starting" }) } },
  replicateModelConfig: {
    "wai-nsfw-illustrious-v11": {
      modelId: "test-model:v1",
      buildInput: () => ({}),
      sizes: [{ width: 768, height: 1024 }],
      schedulers: ["x"],
    },
  },
  buildReplicatePredictionRequest: () => ({}),
  buildImageBatchId: () => "batch-1",
  buildImageKey: () => "users/u1/images/1.png",
  putMediaItem: async () => {},
  clampPromptTokens: (p) => p,
  getReplicateOutputUrls: () => [],
  DEFAULT_NEGATIVE_PROMPT: "low",
  fetchImageBuffer: async () => ({ buffer: Buffer.alloc(0), contentType: "image/png" }),
  s3Client: { send: async () => ({}) },
  PutObjectCommand: function () {},
  GetObjectCommand: function () {},
  getSignedUrl: async () => "https://example.com/signed",
  agentState: { patch: async () => {}, load: async () => null },
});

test("dispatchGenerateImage refuses when daily image cap is reached", async () => {
  process.env.REPLICATE_API_TOKEN = "fake-token";
  let replicateCalled = false;
  const deps = {
    ...baseDeps(),
    replicateClient: {
      predictions: {
        create: async () => {
          replicateCalled = true;
          return { id: "p-1", status: "starting" };
        },
      },
    },
    agentCost: {
      checkDailyImageCap: async () => ({
        allowed: false,
        capacity: 50,
        imagesToday: 50,
        retryAfterMs: 60_000,
      }),
      recordImage: async () => {},
    },
  };
  const out = await dispatchGenerateImage({
    args: { prompt: "test", style: "anime", aspect: "3:4" },
    deps,
    userId: "u1",
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "image_daily_cap_reached");
  assert.equal(out.imagesToday, 50);
  assert.equal(out.capacity, 50);
  assert.equal(replicateCalled, false, "must not call Replicate when capped");
});

test("dispatchGenerateImage proceeds when under cap and records the image", async () => {
  process.env.REPLICATE_API_TOKEN = "fake-token";
  let recorded = 0;
  const deps = {
    ...baseDeps(),
    agentCost: {
      checkDailyImageCap: async () => ({ allowed: true, remaining: 49 }),
      recordImage: async () => {
        recorded += 1;
      },
    },
  };
  const out = await dispatchGenerateImage({
    args: { prompt: "test", style: "anime", aspect: "3:4" },
    deps,
    userId: "u1",
  });
  assert.equal(out.ok, true);
  // Microtask flush — recordImage is fire-and-forget so let any pending
  // promise resolve before asserting.
  await new Promise((r) => setImmediate(r));
  assert.equal(recorded, 1, "must increment the daily counter on Replicate success");
});

test("dispatchGenerateImage tolerates a missing agentCost dep (fail open)", async () => {
  process.env.REPLICATE_API_TOKEN = "fake-token";
  const deps = { ...baseDeps() }; // no agentCost wired
  const out = await dispatchGenerateImage({
    args: { prompt: "test", style: "anime", aspect: "3:4" },
    deps,
    userId: "u1",
  });
  assert.equal(out.ok, true);
});
