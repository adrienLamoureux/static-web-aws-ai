"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  safeJsonParse,
  extractJsonStringField,
  normalizePromptFragment,
  splitPromptFragments,
  dedupeFragments,
  buildSceneFragmentsFromStoryState,
  compactScenePayload,
  clipText,
  MAX_REPLICATE_PROMPT_TOKENS,
  clampPromptTokens,
} = require("../lib/story-prompt");

// ── safeJsonParse ──────────────────────────────────────────────────────────

test("safeJsonParse parses valid JSON object", () => {
  const result = safeJsonParse('{"key":"value"}');
  assert.deepEqual(result, { key: "value" });
});

test("safeJsonParse extracts embedded JSON object from surrounding text", () => {
  const result = safeJsonParse('prefix {"key":"value"} suffix');
  assert.deepEqual(result, { key: "value" });
});

test("safeJsonParse returns null for completely invalid input", () => {
  assert.equal(safeJsonParse("not json at all"), null);
});

test("safeJsonParse returns null for empty string", () => {
  assert.equal(safeJsonParse(""), null);
});

test("safeJsonParse parses arrays", () => {
  const result = safeJsonParse("[1,2,3]");
  assert.deepEqual(result, [1, 2, 3]);
});

// ── extractJsonStringField ─────────────────────────────────────────────────

test("extractJsonStringField extracts a simple string field", () => {
  const json = '{"positivePrompt":"1girl, anime"}';
  assert.equal(extractJsonStringField(json, "positivePrompt"), "1girl, anime");
});

test("extractJsonStringField returns empty string when field not found", () => {
  assert.equal(extractJsonStringField('{"other":"value"}', "missing"), "");
});

test("extractJsonStringField returns empty string for empty input", () => {
  assert.equal(extractJsonStringField("", "field"), "");
  assert.equal(extractJsonStringField('{"a":"b"}', ""), "");
});

test("extractJsonStringField handles escaped characters in string value", () => {
  const json = '{"prompt":"line1\\nline2"}';
  const result = extractJsonStringField(json, "prompt");
  assert.equal(result, "line1\nline2");
});

// ── normalizePromptFragment ────────────────────────────────────────────────

test("normalizePromptFragment trims leading/trailing whitespace", () => {
  assert.equal(normalizePromptFragment("  anime  "), "anime");
});

test("normalizePromptFragment replaces newlines with spaces", () => {
  assert.equal(normalizePromptFragment("line1\nline2"), "line1 line2");
});

test("normalizePromptFragment collapses multiple spaces to one", () => {
  assert.equal(normalizePromptFragment("a   b"), "a b");
});

test("normalizePromptFragment handles carriage returns", () => {
  assert.equal(normalizePromptFragment("a\r\nb"), "a b");
});

test("normalizePromptFragment returns empty string for empty input", () => {
  assert.equal(normalizePromptFragment(""), "");
  assert.equal(normalizePromptFragment(), "");
});

// ── splitPromptFragments ───────────────────────────────────────────────────

test("splitPromptFragments splits on comma", () => {
  const result = splitPromptFragments("a, b, c");
  assert.deepEqual(result, ["a", "b", "c"]);
});

test("splitPromptFragments splits on semicolon", () => {
  const result = splitPromptFragments("a; b; c");
  assert.deepEqual(result, ["a", "b", "c"]);
});

test("splitPromptFragments normalizes each part", () => {
  const result = splitPromptFragments("  anime  ,  art  ");
  assert.deepEqual(result, ["anime", "art"]);
});

test("splitPromptFragments replaces newlines with commas before splitting", () => {
  const result = splitPromptFragments("sky\nocean\nmountain");
  assert.deepEqual(result, ["sky", "ocean", "mountain"]);
});

test("splitPromptFragments filters out empty parts", () => {
  const result = splitPromptFragments(",, anime,,");
  assert.deepEqual(result, ["anime"]);
});

test("splitPromptFragments returns empty array for empty string", () => {
  assert.deepEqual(splitPromptFragments(""), []);
  assert.deepEqual(splitPromptFragments(), []);
});

// ── dedupeFragments ────────────────────────────────────────────────────────

test("dedupeFragments removes exact duplicates", () => {
  assert.deepEqual(dedupeFragments(["a", "b", "a"]), ["a", "b"]);
});

test("dedupeFragments performs case-insensitive dedup", () => {
  assert.deepEqual(dedupeFragments(["Anime", "anime"]), ["Anime"]);
});

test("dedupeFragments filters out falsy/blank entries", () => {
  assert.deepEqual(dedupeFragments(["", null, undefined, "anime"]), ["anime"]);
});

test("dedupeFragments preserves insertion order", () => {
  assert.deepEqual(dedupeFragments(["c", "a", "b", "a"]), ["c", "a", "b"]);
});

// ── buildSceneFragmentsFromStoryState ──────────────────────────────────────

test("buildSceneFragmentsFromStoryState extracts scene fields", () => {
  const state = {
    scene: {
      locationName: "forest",
      description: "dense trees",
      weather: "misty",
      timeOfDay: "morning",
    },
  };
  const result = buildSceneFragmentsFromStoryState(state);
  assert.ok(result.environment.includes("forest"), "should include locationName");
  assert.ok(result.environment.includes("misty"), "should include weather");
  assert.ok(result.prompt.includes("forest"), "prompt should include locationName");
});

test("buildSceneFragmentsFromStoryState includes worldPrompt in environment", () => {
  const state = { scene: { locationName: "castle" } };
  const result = buildSceneFragmentsFromStoryState(state, "epic fantasy");
  assert.ok(result.environment.includes("epic fantasy"), "should include worldPrompt");
});

test("buildSceneFragmentsFromStoryState handles empty state", () => {
  const result = buildSceneFragmentsFromStoryState({});
  assert.deepEqual(result.environment, []);
  assert.deepEqual(result.action, []);
  assert.equal(result.prompt, "");
});

test("buildSceneFragmentsFromStoryState deduplicates environment fragments", () => {
  const state = {
    scene: {
      locationName: "forest",
      description: "forest clearing",
    },
  };
  const result = buildSceneFragmentsFromStoryState(state);
  const forestCount = result.environment.filter((f) => f === "forest").length;
  assert.equal(forestCount, 1, "should not duplicate 'forest'");
});

// ── compactScenePayload ────────────────────────────────────────────────────

test("compactScenePayload returns scenePrompt, sceneEnvironment, sceneAction", () => {
  const result = compactScenePayload({
    scenePrompt: "forest, lake, mist",
    sceneEnvironment: "trees",
    sceneAction: "",
  });
  assert.ok("scenePrompt" in result);
  assert.ok("sceneEnvironment" in result);
  assert.ok("sceneAction" in result);
});

test("compactScenePayload merges environment from prompt and sceneEnvironment", () => {
  const result = compactScenePayload({
    scenePrompt: "castle",
    sceneEnvironment: "night, snow",
    sceneAction: "",
  });
  assert.ok(result.sceneEnvironment.includes("castle") || result.scenePrompt.includes("castle"));
});

test("compactScenePayload deduplicates across sources", () => {
  const result = compactScenePayload({
    scenePrompt: "forest",
    sceneEnvironment: "forest, trees",
    sceneAction: "",
  });
  const forestCount = result.scenePrompt.split(", ").filter((f) => f === "forest").length;
  assert.equal(forestCount, 1, "should deduplicate 'forest'");
});

test("compactScenePayload handles all-empty input", () => {
  const result = compactScenePayload({});
  assert.equal(result.scenePrompt, "");
  assert.equal(result.sceneEnvironment, "");
  assert.equal(result.sceneAction, "");
});

// ── clipText ───────────────────────────────────────────────────────────────

test("clipText returns unchanged text when under max", () => {
  assert.equal(clipText("hello", 100), "hello");
});

test("clipText truncates and appends ellipsis when over max", () => {
  const result = clipText("abcdefghij", 5);
  assert.ok(result.endsWith("..."), "should end with ...");
  assert.ok(result.length <= 8, "truncated text + ... should be short");
});

test("clipText normalizes whitespace before clipping", () => {
  const result = clipText("  hello  world  ", 100);
  assert.equal(result, "hello world");
});

test("clipText returns empty string for empty input", () => {
  assert.equal(clipText(""), "");
  assert.equal(clipText(), "");
});

// ── MAX_REPLICATE_PROMPT_TOKENS ────────────────────────────────────────────

test("MAX_REPLICATE_PROMPT_TOKENS is 75", () => {
  assert.equal(MAX_REPLICATE_PROMPT_TOKENS, 75);
});

// ── clampPromptTokens ──────────────────────────────────────────────────────

test("clampPromptTokens returns empty string for empty input", () => {
  assert.equal(clampPromptTokens(""), "");
  assert.equal(clampPromptTokens(), "");
});

test("clampPromptTokens returns unchanged prompt when under token limit", () => {
  const short = "1girl, anime, art";
  const result = clampPromptTokens(short, 75);
  assert.equal(result, short);
});

test("clampPromptTokens truncates comma-separated parts when over token limit", () => {
  // Build a prompt that exceeds 5 tokens when split on spaces
  const words = Array.from({ length: 10 }, (_, i) => `word${i}`);
  const prompt = words.join(", ");
  const result = clampPromptTokens(prompt, 5);
  const tokenCount = result.split(/\s+/).filter(Boolean).length;
  assert.ok(tokenCount <= 5, `expected ≤5 tokens, got ${tokenCount}: "${result}"`);
});

test("clampPromptTokens preserves at least the first segment", () => {
  // Even if the first segment alone exceeds the limit, it is still returned
  // (fallback logic: slice first segment's tokens up to maxTokens)
  const result = clampPromptTokens("a b c d e f g h i j", 3);
  assert.ok(result.length > 0, "should return at least something");
});
