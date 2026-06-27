"use strict";

/**
 * Dispatcher tests for v1/v1.2 Agent tools — split from agent-tools.test.js
 * to stay under the 500-line file cap. Covers:
 *   - set_theme, continue_story, illustrate_scene
 *   - recall_favorites, generate_music, browse_gallery
 *
 * The generate_image dispatcher tests stay in agent-tools.test.js.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { dispatchTool } = require("../lib/agent-tools");
const { createMockDeps } = require("./helpers/mock-deps");

// ── v1 tools: set_theme ────────────────────────────────────────────────────

test("set_theme rejects unknown theme ids", async () => {
  const deps = createMockDeps();
  const r = await dispatchTool({
    name: "set_theme",
    args: { theme: "midnight-rainbow" },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /^unsupported_theme/);
});

test("set_theme returns clientAction result and patches agentState", async () => {
  const patches = [];
  const deps = createMockDeps({
    agentState: {
      load: async () => null,
      patch: async (userId, p) => {
        patches.push({ userId, p });
      },
      clear: async () => {},
    },
  });
  const r = await dispatchTool({
    name: "set_theme",
    args: { theme: "moonrise", brightness: "dark" },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, true);
  assert.equal(r.result.clientAction, "set_theme");
  assert.equal(r.result.theme, "moonrise");
  assert.equal(r.result.brightness, "dark");
  // Allow the fire-and-forget patch to settle
  await new Promise((r2) => setTimeout(r2, 5));
  assert.equal(patches.length, 1);
  assert.equal(patches[0].p.theme, "moonrise");
});

// ── v1 tools: continue_story ───────────────────────────────────────────────

test("continue_story requires non-empty content", async () => {
  const deps = createMockDeps();
  const r = await dispatchTool({
    name: "continue_story",
    args: { content: "   " },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, "content_required");
});

test("continue_story rejects content over 400 chars", async () => {
  const deps = createMockDeps();
  const r = await dispatchTool({
    name: "continue_story",
    args: { content: "x".repeat(401) },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, "content_too_long");
});

test("continue_story returns requiresConfirm intent with sessionId+content", async () => {
  const deps = createMockDeps();
  const r = await dispatchTool({
    name: "continue_story",
    args: { sessionId: "sess-1", content: "she opens the door" },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, true);
  assert.equal(r.result.clientAction, "continue_story");
  assert.equal(r.result.requiresConfirm, true);
  assert.equal(r.result.sessionId, "sess-1");
  assert.equal(r.result.content, "she opens the door");
});

test("continue_story falls back to most-recent session when sessionId omitted", async () => {
  const deps = createMockDeps({
    queryBySkPrefix: async () => [
      { sk: "SESSION#a", sessionId: "a", title: "Old", updatedAt: 1 },
      { sk: "SESSION#b", sessionId: "b", title: "Latest", updatedAt: 100 },
      { sk: "SESSION#b#MSG#xyz", role: "user", content: "old turn" },
    ],
  });
  const r = await dispatchTool({
    name: "continue_story",
    args: { content: "next beat" },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, true);
  assert.equal(r.result.sessionId, "b");
  assert.equal(r.result.sessionTitle, "Latest");
});

// ── v1 tools: illustrate_scene ─────────────────────────────────────────────

test("illustrate_scene requires sessionId + sceneId", async () => {
  const deps = createMockDeps();
  const r = await dispatchTool({
    name: "illustrate_scene",
    args: { sessionId: "", sceneId: "" },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /required/);
});

// ── v1.1 tools: recall_favorites ───────────────────────────────────────────

test("recall_favorites requires userId", async () => {
  const deps = createMockDeps();
  const r = await dispatchTool({ name: "recall_favorites", args: {}, deps, userId: null });
  assert.equal(r.ok, false);
  assert.equal(r.error, "unauthorized");
});

test("recall_favorites returns empty items array when user has no IMG history", async () => {
  const deps = createMockDeps({
    queryMediaItems: async () => [],
  });
  const r = await dispatchTool({
    name: "recall_favorites",
    args: {},
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, true);
  assert.equal(r.result.clientAction, "recall_favorites");
  assert.equal(r.result.count, 0);
  assert.deepEqual(r.result.items, []);
});

test("recall_favorites returns top-N items sorted by createdAt desc with signed URLs", async () => {
  process.env.MEDIA_BUCKET = "test-bucket";
  const deps = createMockDeps({
    queryMediaItems: async () => [
      { key: "users/u1/old.png", prompt: "old", createdAt: 1 },
      { key: "users/u1/middle.png", prompt: "middle", createdAt: 50 },
      { key: "users/u1/new.png", prompt: "new", createdAt: 100, model: "anime" },
    ],
    getSignedUrl: async (_c, cmd) => `https://signed.example/${cmd.input.Key}`,
  });
  const r = await dispatchTool({
    name: "recall_favorites",
    args: { limit: 2 },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, true);
  assert.equal(r.result.count, 2);
  assert.equal(r.result.items[0].prompt, "new");
  assert.equal(r.result.items[0].model, "anime");
  assert.equal(r.result.items[0].url, "https://signed.example/users/u1/new.png");
  assert.equal(r.result.items[1].prompt, "middle");
});

test("recall_favorites clamps limit to [1, 12]", async () => {
  const deps = createMockDeps({
    queryMediaItems: async () =>
      Array.from({ length: 20 }, (_, i) => ({
        key: `users/u1/${i}.png`,
        prompt: `p${i}`,
        createdAt: i,
      })),
  });
  const r1 = await dispatchTool({
    name: "recall_favorites",
    args: { limit: 999 },
    deps,
    userId: "u1",
  });
  assert.equal(r1.result.count, 12, "must clamp to max 12");
  const r2 = await dispatchTool({
    name: "recall_favorites",
    args: { limit: -5 },
    deps,
    userId: "u1",
  });
  assert.equal(r2.result.count, 1, "must clamp to min 1");
});

test("recall_favorites returns prompts even when getSignedUrl fails", async () => {
  process.env.MEDIA_BUCKET = "test-bucket";
  const deps = createMockDeps({
    queryMediaItems: async () => [{ key: "users/u1/x.png", prompt: "ok", createdAt: 1 }],
    getSignedUrl: async () => {
      throw new Error("s3 unavailable");
    },
  });
  const r = await dispatchTool({
    name: "recall_favorites",
    args: {},
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, true);
  assert.equal(r.result.items[0].prompt, "ok");
  assert.equal(r.result.items[0].url, undefined, "URL omitted when signing fails");
});

// ── v1.2 tools: generate_music ─────────────────────────────────────────────

test("generate_music requires mood", async () => {
  const deps = createMockDeps();
  const r = await dispatchTool({
    name: "generate_music",
    args: { mood: "" },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, "mood_required");
});

test("generate_music returns no_active_scene when user has no session", async () => {
  const deps = createMockDeps({ queryBySkPrefix: async () => [] });
  const r = await dispatchTool({
    name: "generate_music",
    args: { mood: "epic" },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, "no_active_scene");
});

test("generate_music resolves most-recent session + last scene as fallback", async () => {
  const deps = createMockDeps({
    queryBySkPrefix: async () => [
      { sk: "SESSION#a", sessionId: "a", title: "First", updatedAt: 10 },
      { sk: "SESSION#b", sessionId: "b", title: "Latest", updatedAt: 100 },
      { sk: "SESSION#b#SCENE#s1", sceneId: "s1", createdAt: 200 },
      { sk: "SESSION#b#SCENE#s2", sceneId: "s2", createdAt: 300 },
      { sk: "SESSION#a#SCENE#sx", sceneId: "sx", createdAt: 50 },
    ],
  });
  const r = await dispatchTool({
    name: "generate_music",
    args: { mood: "melancholic", description: "rain at dusk" },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, true);
  assert.equal(r.result.clientAction, "generate_music");
  assert.equal(r.result.requiresConfirm, true);
  assert.equal(r.result.sessionId, "b");
  assert.equal(r.result.sceneId, "s2");
  assert.equal(r.result.sessionTitle, "Latest");
  assert.equal(r.result.mood, "melancholic");
  assert.equal(r.result.description, "rain at dusk");
});

test("generate_music caps description length", async () => {
  const deps = createMockDeps({
    queryBySkPrefix: async () => [
      { sk: "SESSION#a", sessionId: "a", title: "T", updatedAt: 1 },
      { sk: "SESSION#a#SCENE#s1", sceneId: "s1", createdAt: 1 },
    ],
  });
  const r = await dispatchTool({
    name: "generate_music",
    args: { mood: "epic", description: "x".repeat(500) },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, true);
  assert.equal(r.result.description.length, 200);
});

// ── v1.2 tools: browse_gallery ─────────────────────────────────────────────

test("browse_gallery returns empty items array when no shared images exist", async () => {
  process.env.MEDIA_BUCKET = "test-bucket";
  const deps = createMockDeps({
    s3Client: { send: async () => ({ Contents: [] }) },
  });
  const r = await dispatchTool({
    name: "browse_gallery",
    args: {},
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, true);
  assert.equal(r.result.clientAction, "browse_gallery");
  assert.equal(r.result.count, 0);
});

test("browse_gallery returns recent shared images with signed URLs, newest first", async () => {
  process.env.MEDIA_BUCKET = "test-bucket";
  const deps = createMockDeps({
    s3Client: {
      send: async () => ({
        Contents: [
          { Key: "shared/images/old.png", LastModified: new Date(1000) },
          { Key: "shared/images/middle.jpg", LastModified: new Date(5000) },
          { Key: "shared/images/new.webp", LastModified: new Date(9000) },
          { Key: "shared/images/", LastModified: new Date(9999) }, // self-prefix, filtered
          { Key: "shared/images/notes.txt", LastModified: new Date(9999) }, // non-image
        ],
      }),
    },
    getSignedUrl: async (_c, cmd) => `https://signed.example/${cmd.input.Key}`,
  });
  const r = await dispatchTool({
    name: "browse_gallery",
    args: { limit: 2 },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, true);
  assert.equal(r.result.count, 2);
  assert.equal(r.result.items[0].key, "shared/images/new.webp");
  assert.equal(r.result.items[1].key, "shared/images/middle.jpg");
  assert.match(r.result.items[0].url, /signed\.example/);
});

test("browse_gallery returns gallery_fetch_failed when S3 throws", async () => {
  process.env.MEDIA_BUCKET = "test-bucket";
  const deps = createMockDeps({
    s3Client: {
      send: async () => {
        throw new Error("S3 down");
      },
    },
  });
  const r = await dispatchTool({
    name: "browse_gallery",
    args: {},
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, "gallery_fetch_failed");
});

test("browse_gallery clamps limit to [1, 12]", async () => {
  process.env.MEDIA_BUCKET = "test-bucket";
  const lotsOfImages = Array.from({ length: 50 }, (_, i) => ({
    Key: `shared/images/img${i}.png`,
    LastModified: new Date(i * 1000),
  }));
  const deps = createMockDeps({
    s3Client: { send: async () => ({ Contents: lotsOfImages }) },
    getSignedUrl: async (_c, cmd) => `https://signed.example/${cmd.input.Key}`,
  });
  const r = await dispatchTool({
    name: "browse_gallery",
    args: { limit: 999 },
    deps,
    userId: "u1",
  });
  assert.equal(r.result.count, 12);
});

test("illustrate_scene defaults style from agentState.lastStyle when unspecified", async () => {
  const deps = createMockDeps({
    agentState: {
      load: async () => ({ lastStyle: "manga" }),
      patch: async () => {},
      clear: async () => {},
    },
  });
  const r = await dispatchTool({
    name: "illustrate_scene",
    args: { sessionId: "s1", sceneId: "sc1" },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, true);
  assert.equal(r.result.clientAction, "illustrate_scene");
  assert.equal(r.result.requiresConfirm, true);
  assert.equal(r.result.style, "manga");
});
