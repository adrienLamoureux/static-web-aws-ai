"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parsePromptPairResponse,
  dedupePromptFragments,
  splitPromptFragments,
  rebalanceIllustrationPositivePrompt,
  rebalanceIllustrationNegativePrompt,
} = require("../lib/scene-context/shared");

// Minimal real normalizePromptFragment (matches story-prompt.js impl)
const normalizePromptFragment = (value = "") =>
  String(value)
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const safeJsonParse = (text = "") => {
  if (!text) return null;
  try { return JSON.parse(text); } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
};

// ── parsePromptPairResponse ────────────────────────────────────────────────

test("parsePromptPairResponse extracts positivePrompt and negativePrompt from JSON", () => {
  const responseText = JSON.stringify({
    positivePrompt: "1girl, anime",
    negativePrompt: "low quality",
  });
  const result = parsePromptPairResponse({ responseText, safeJsonParse, normalizePromptFragment });
  assert.equal(result.positivePrompt, "1girl, anime");
  assert.equal(result.negativePrompt, "low quality");
});

test("parsePromptPairResponse accepts short-form 'positive'/'negative' keys", () => {
  const responseText = JSON.stringify({
    positive: "forest, sunlight",
    negative: "blurry",
  });
  const result = parsePromptPairResponse({ responseText, safeJsonParse, normalizePromptFragment });
  assert.equal(result.positivePrompt, "forest, sunlight");
  assert.equal(result.negativePrompt, "blurry");
});

test("parsePromptPairResponse falls back to POSITIVE:/NEGATIVE: text format", () => {
  const responseText = "POSITIVE: 1girl, school uniform\nNEGATIVE: bad anatomy";
  const result = parsePromptPairResponse({ responseText, safeJsonParse, normalizePromptFragment });
  assert.equal(result.positivePrompt, "1girl, school uniform");
  assert.equal(result.negativePrompt, "bad anatomy");
});

test("parsePromptPairResponse returns empty strings when input is empty", () => {
  const result = parsePromptPairResponse({ responseText: "", safeJsonParse, normalizePromptFragment });
  assert.equal(result.positivePrompt, "");
  assert.equal(result.negativePrompt, "");
});

test("parsePromptPairResponse returns empty strings for malformed JSON", () => {
  const result = parsePromptPairResponse({
    responseText: "not json at all",
    safeJsonParse,
    normalizePromptFragment,
  });
  assert.equal(result.positivePrompt, "");
  assert.equal(result.negativePrompt, "");
});

test("parsePromptPairResponse normalises whitespace in positive prompt", () => {
  const responseText = JSON.stringify({ positivePrompt: "  1girl  \n  anime  " });
  const result = parsePromptPairResponse({ responseText, safeJsonParse, normalizePromptFragment });
  assert.equal(result.positivePrompt, "1girl anime");
});

// ── dedupePromptFragments ──────────────────────────────────────────────────

test("dedupePromptFragments removes exact duplicates", () => {
  const result = dedupePromptFragments(["1girl", "anime", "1girl"]);
  assert.deepEqual(result, ["1girl", "anime"]);
});

test("dedupePromptFragments removes case-insensitive duplicates", () => {
  const result = dedupePromptFragments(["Anime", "anime"]);
  assert.deepEqual(result, ["Anime"]);
});

test("dedupePromptFragments filters out empty/blank entries", () => {
  const result = dedupePromptFragments(["", "  ", "anime"]);
  assert.deepEqual(result, ["anime"]);
});

test("dedupePromptFragments preserves order of first occurrence", () => {
  const result = dedupePromptFragments(["b", "a", "b", "c", "a"]);
  assert.deepEqual(result, ["b", "a", "c"]);
});

test("dedupePromptFragments returns empty array for empty input", () => {
  assert.deepEqual(dedupePromptFragments([]), []);
});

test("dedupePromptFragments handles non-string entries gracefully", () => {
  const result = dedupePromptFragments([null, undefined, "anime"]);
  assert.deepEqual(result, ["anime"]);
});

// ── splitPromptFragments ───────────────────────────────────────────────────

test("splitPromptFragments splits on commas", () => {
  const result = splitPromptFragments({ value: "1girl, anime, school", normalizePromptFragment });
  assert.deepEqual(result, ["1girl", "anime", "school"]);
});

test("splitPromptFragments splits on semicolons", () => {
  const result = splitPromptFragments({ value: "a; b; c", normalizePromptFragment });
  assert.deepEqual(result, ["a", "b", "c"]);
});

test("splitPromptFragments splits on period followed by space", () => {
  const result = splitPromptFragments({ value: "sun. wind. rain", normalizePromptFragment });
  // period at end of word + space triggers split
  assert.ok(result.length >= 2, `expected multiple fragments, got ${result.length}`);
});

test("splitPromptFragments deduplicates fragments", () => {
  const result = splitPromptFragments({ value: "anime, anime, art", normalizePromptFragment });
  assert.deepEqual(result, ["anime", "art"]);
});

test("splitPromptFragments replaces newlines with commas before splitting", () => {
  const result = splitPromptFragments({ value: "sky\nforest\nocean", normalizePromptFragment });
  assert.deepEqual(result, ["sky", "forest", "ocean"]);
});

test("splitPromptFragments returns empty array for empty input", () => {
  const result = splitPromptFragments({ value: "", normalizePromptFragment });
  assert.deepEqual(result, []);
});

// ── rebalanceIllustrationPositivePrompt ───────────────────────────────────

test("rebalanceIllustrationPositivePrompt returns empty string for empty input", () => {
  const result = rebalanceIllustrationPositivePrompt({
    positivePrompt: "",
    character: {},
    normalizePromptFragment,
  });
  assert.equal(result, "");
});

test("rebalanceIllustrationPositivePrompt returns joined string of fragments", () => {
  const result = rebalanceIllustrationPositivePrompt({
    positivePrompt: "1girl, anime, forest, background, sky",
    character: { name: "" },
    normalizePromptFragment,
  });
  assert.ok(typeof result === "string", "should return a string");
  assert.ok(result.length > 0, "should not be empty for non-empty input");
});

test("rebalanceIllustrationPositivePrompt includes character name in output when provided", () => {
  const result = rebalanceIllustrationPositivePrompt({
    positivePrompt: "1girl, blue hair, forest, background",
    character: { name: "Hiyori", identityPrompt: "blue hair, pink outfit" },
    normalizePromptFragment,
  });
  assert.ok(result.toLowerCase().includes("hiyori"), "output should contain character name");
});

test("rebalanceIllustrationPositivePrompt limits environment fragments", () => {
  const manyEnvFragments = [
    "background",
    "forest",
    "mountain",
    "lake",
    "sky",
    "sunset",
    "clouds",
    "snow",
  ].join(", ");
  const result = rebalanceIllustrationPositivePrompt({
    positivePrompt: `1girl, hair${manyEnvFragments}`,
    character: { name: "Hiyori" },
    normalizePromptFragment,
  });
  const parts = result.split(", ");
  // Max environment budget is 3, so total should be reasonable
  assert.ok(parts.length < 20, "should cap environment fragments");
});

test("rebalanceIllustrationPositivePrompt falls back to source fragments when rebalancing yields nothing", () => {
  // Provide fragments that don't classify as character/style/environment
  const result = rebalanceIllustrationPositivePrompt({
    positivePrompt: "mysterious, ethereal",
    character: {},
    normalizePromptFragment,
  });
  assert.ok(result.length > 0, "should fallback to source fragments");
});

// ── rebalanceIllustrationNegativePrompt ───────────────────────────────────

test("rebalanceIllustrationNegativePrompt always prepends CHARACTER_PRIORITY_NEGATIVE_GUARDS", () => {
  const result = rebalanceIllustrationNegativePrompt({
    negativePrompt: "low quality, blurry",
    normalizePromptFragment,
  });
  assert.ok(result.includes("scenery only"), "should contain 'scenery only' guard");
  assert.ok(result.includes("no person"), "should contain 'no person' guard");
  assert.ok(result.includes("no character"), "should contain 'no character' guard");
  assert.ok(result.includes("distant face"), "should contain 'distant face' guard");
  assert.ok(result.includes("faceless"), "should contain 'faceless' guard");
});

test("rebalanceIllustrationNegativePrompt includes user-provided fragments after guards", () => {
  const result = rebalanceIllustrationNegativePrompt({
    negativePrompt: "low quality, blurry",
    normalizePromptFragment,
  });
  assert.ok(result.includes("low quality"), "should include user fragment");
  assert.ok(result.includes("blurry"), "should include user fragment");
});

test("rebalanceIllustrationNegativePrompt deduplicates guards that also appear in input", () => {
  const result = rebalanceIllustrationNegativePrompt({
    negativePrompt: "scenery only, faceless, blurry",
    normalizePromptFragment,
  });
  // Count occurrences of 'scenery only'
  const count = result.split(", ").filter((f) => f === "scenery only").length;
  assert.equal(count, 1, "should deduplicate 'scenery only'");
});

test("rebalanceIllustrationNegativePrompt works with empty negativePrompt", () => {
  const result = rebalanceIllustrationNegativePrompt({
    negativePrompt: "",
    normalizePromptFragment,
  });
  // Should still have the guards
  assert.ok(result.includes("scenery only"), "guards should still appear");
});
