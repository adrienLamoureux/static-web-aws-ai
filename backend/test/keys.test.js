"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildUserPrefix,
  ensureUserKey,
  buildMediaPk,
  buildMediaSk,
  buildStoryPresetPk,
  buildStoryPresetSk,
  buildStoryCharacterPk,
  buildStoryCharacterSk,
  buildPromptHelperPk,
  buildPromptHelperSk,
  buildStorySessionSk,
  buildStoryMessageSk,
  buildStorySceneSk,
  storyMessagePrefix,
  storyScenePrefix,
  buildCompanionMemorySk,
  buildCompanionMsgSk,
  companionMsgPrefix,
} = require("../lib/keys");

// ── buildUserPrefix ────────────────────────────────────────────────────────

test("buildUserPrefix returns correct prefix for a userId", () => {
  assert.equal(buildUserPrefix("abc123"), "users/abc123/");
});

test("buildUserPrefix with empty string returns users//", () => {
  assert.equal(buildUserPrefix(""), "users//");
});

test("buildUserPrefix with no argument returns users//", () => {
  assert.equal(buildUserPrefix(), "users//");
});

// ── ensureUserKey ──────────────────────────────────────────────────────────

test("ensureUserKey does not throw for a key that belongs to the user", () => {
  assert.doesNotThrow(() => ensureUserKey("users/user1/img.jpg", "user1"));
});

test("ensureUserKey throws for a key that does not belong to the user", () => {
  assert.throws(
    () => ensureUserKey("users/other/img.jpg", "user1"),
    /key must belong to the current user/
  );
});

test("ensureUserKey throws for an empty key", () => {
  assert.throws(() => ensureUserKey("", "user1"), /key must belong to the current user/);
});

// ── buildMediaPk ───────────────────────────────────────────────────────────

test("buildMediaPk returns USER# prefixed key", () => {
  assert.equal(buildMediaPk("user-42"), "USER#user-42");
});

test("buildMediaPk with empty string returns USER#", () => {
  assert.equal(buildMediaPk(""), "USER#");
});

test("buildMediaPk with no argument returns USER#", () => {
  assert.equal(buildMediaPk(), "USER#");
});

// ── buildMediaSk ───────────────────────────────────────────────────────────

test("buildMediaSk returns type#key format", () => {
  assert.equal(buildMediaSk("IMG", "folder/image.jpg"), "IMG#folder/image.jpg");
});

test("buildMediaSk defaults type to IMG", () => {
  assert.equal(buildMediaSk(undefined, "key.jpg"), "IMG#key.jpg");
});

// ── buildStoryPresetPk / Sk ────────────────────────────────────────────────

test("buildStoryPresetPk returns PRESET#STORY", () => {
  assert.equal(buildStoryPresetPk(), "PRESET#STORY");
});

test("buildStoryPresetSk returns PRESET# prefixed id", () => {
  assert.equal(buildStoryPresetSk("fantasy"), "PRESET#fantasy");
});

test("buildStoryPresetSk with empty string returns PRESET#", () => {
  assert.equal(buildStoryPresetSk(""), "PRESET#");
});

// ── buildStoryCharacterPk / Sk ─────────────────────────────────────────────

test("buildStoryCharacterPk returns PRESET#CHARACTER", () => {
  assert.equal(buildStoryCharacterPk(), "PRESET#CHARACTER");
});

test("buildStoryCharacterSk returns CHARACTER# prefixed id", () => {
  assert.equal(buildStoryCharacterSk("hiyori"), "CHARACTER#hiyori");
});

// ── buildPromptHelperPk / Sk ───────────────────────────────────────────────

test("buildPromptHelperPk returns PRESET#PROMPT_HELPER", () => {
  assert.equal(buildPromptHelperPk(), "PRESET#PROMPT_HELPER");
});

test("buildPromptHelperSk uppercases the key", () => {
  assert.equal(buildPromptHelperSk("style"), "OPTIONS#STYLE");
});

test("buildPromptHelperSk with empty string returns OPTIONS#", () => {
  assert.equal(buildPromptHelperSk(""), "OPTIONS#");
});

// ── buildStorySessionSk ────────────────────────────────────────────────────

test("buildStorySessionSk returns SESSION# prefixed id", () => {
  assert.equal(buildStorySessionSk("session-1"), "SESSION#session-1");
});

test("buildStorySessionSk with empty string returns SESSION#", () => {
  assert.equal(buildStorySessionSk(""), "SESSION#");
});

// ── buildStoryMessageSk ────────────────────────────────────────────────────

test("buildStoryMessageSk includes session id and padded timestamp", () => {
  const sk = buildStoryMessageSk("sess-1", 12345);
  assert.equal(sk, "SESSION#sess-1#MSG#0000000012345");
});

test("buildStoryMessageSk pads timestamp to 13 digits", () => {
  const sk = buildStoryMessageSk("s", 1);
  assert.ok(sk.endsWith("#0000000000001"), `unexpected sk: ${sk}`);
});

test("buildStoryMessageSk uses Date.now() for default timestamp", () => {
  const before = Date.now();
  const sk = buildStoryMessageSk("sess");
  const after = Date.now();
  // Extract timestamp from sk
  const ts = parseInt(sk.split("#MSG#")[1], 10);
  assert.ok(ts >= before && ts <= after, `timestamp ${ts} out of range`);
});

// ── buildStorySceneSk ──────────────────────────────────────────────────────

test("buildStorySceneSk returns correct composite sk", () => {
  assert.equal(buildStorySceneSk("sess-1", "scene-2"), "SESSION#sess-1#SCENE#scene-2");
});

test("buildStorySceneSk with empty ids", () => {
  assert.equal(buildStorySceneSk("", ""), "SESSION##SCENE#");
});

// ── storyMessagePrefix / storyScenePrefix ─────────────────────────────────

test("storyMessagePrefix returns SESSION#<id>#MSG# prefix", () => {
  assert.equal(storyMessagePrefix("sess-1"), "SESSION#sess-1#MSG#");
});

test("storyScenePrefix returns SESSION#<id>#SCENE# prefix", () => {
  assert.equal(storyScenePrefix("sess-1"), "SESSION#sess-1#SCENE#");
});

// ── buildCompanionMemorySk ─────────────────────────────────────────────────

test("buildCompanionMemorySk returns COMPANION# prefixed modelId", () => {
  assert.equal(buildCompanionMemorySk("hiyori_free"), "COMPANION#hiyori_free");
});

test("buildCompanionMemorySk defaults to hiyori_free", () => {
  assert.equal(buildCompanionMemorySk(), "COMPANION#hiyori_free");
});

// ── buildCompanionMsgSk ────────────────────────────────────────────────────

test("buildCompanionMsgSk includes model and padded timestamp", () => {
  const sk = buildCompanionMsgSk("hiyori_free", 99999);
  assert.equal(sk, "COMPANION#hiyori_free#MSG#0000000099999");
});

test("buildCompanionMsgSk pads to 13 digits", () => {
  const sk = buildCompanionMsgSk("model", 1);
  assert.ok(sk.endsWith("#0000000000001"), `unexpected sk: ${sk}`);
});

// ── companionMsgPrefix ─────────────────────────────────────────────────────

test("companionMsgPrefix returns COMPANION#<model>#MSG# prefix", () => {
  assert.equal(companionMsgPrefix("hiyori_free"), "COMPANION#hiyori_free#MSG#");
});

test("companionMsgPrefix defaults to hiyori_free model", () => {
  assert.equal(companionMsgPrefix(), "COMPANION#hiyori_free#MSG#");
});
