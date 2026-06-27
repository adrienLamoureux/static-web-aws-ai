"use strict";

/**
 * agent-state — cross-session preferences for Agent mode.
 *
 * Persistence:
 *   pk = USER#{userId}
 *   sk = AGENT#STATE
 *   { lastStyle, lastAspect, lastLora, theme, updatedAt }
 *
 * The agent reads this on every turn to bias its tool-arg defaults toward
 * what the user has actually chosen in the past — implicit "remember I
 * always want anime + 3:4" without an explicit setting. Tool dispatchers
 * patch it on success.
 */

const { buildMediaPk, buildAgentPrefsSk } = require("./keys");

const ALLOWED_KEYS = ["lastStyle", "lastAspect", "lastLora", "theme"];

// Enum guards for prefs values. These MUST match the tool input schemas in
// agent-tools.js — a value that arrives from a tool-arg (or worse, a
// jailbroken model response) flows back into the system prompt on the next
// turn, so an unvalidated theme="; ignore previous;" string becomes a
// self-targeted prompt-injection vector.
//
// `lastLora` is intentionally unconstrained — LoRA ids are user-configurable
// strings without a fixed set; we sanitise length/shape instead.
const VALID_STYLES = new Set(["anime", "manga", "photoreal", "chibi"]);
const VALID_ASPECTS = new Set(["1:1", "3:4", "16:9"]);
const VALID_THEMES = new Set([
  "sakura",
  "moonrise",
  "bamboo",
  "ember",
  "void",
  "glacier",
  "dusk",
  "aurora",
  "crimson",
  "storm",
]);

const isLoraIdShape = (v) => typeof v === "string" && /^[a-zA-Z0-9_\-:./]{1,120}$/.test(v.trim());

/**
 * Return the validated/coerced value for a prefs key, or `null` to reject.
 * Centralised so every storage path (dispatchers, future routes, tests)
 * cannot accidentally bypass it.
 */
const validatePrefValue = (key, value) => {
  if (value == null || value === "") return null;
  const v = typeof value === "string" ? value.trim() : value;
  if (key === "lastStyle") return VALID_STYLES.has(v) ? v : null;
  if (key === "lastAspect") return VALID_ASPECTS.has(v) ? v : null;
  if (key === "theme") return VALID_THEMES.has(v) ? v : null;
  if (key === "lastLora") return isLoraIdShape(v) ? v : null;
  return null;
};

function createAgentState({ dynamoClient, mediaTable }) {
  if (!dynamoClient || !mediaTable) {
    return {
      load: async () => null,
      patch: async () => {},
      clear: async () => {},
    };
  }

  const { GetCommand, UpdateCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

  async function load(userId) {
    if (!userId) return null;
    try {
      const result = await dynamoClient.send(
        new GetCommand({
          TableName: mediaTable,
          Key: { pk: buildMediaPk(userId), sk: buildAgentPrefsSk() },
        })
      );
      if (!result?.Item) return null;
      // Strip storage keys; return only user-visible prefs. Re-validate on
      // read too — guards against stale records written before the validator
      // landed (the field flows into the system prompt; safer to silently
      // drop an invalid value than to round-trip it).
      const out = {};
      for (const k of ALLOWED_KEYS) {
        const validated = validatePrefValue(k, result.Item[k]);
        if (validated !== null) out[k] = validated;
      }
      if (result.Item.updatedAt) out.updatedAt = result.Item.updatedAt;
      return out;
    } catch {
      return null;
    }
  }

  /**
   * Patch only the keys present in `prefs` (sparse update). Unknown keys are
   * ignored; known keys are enum-checked via `validatePrefValue` to block
   * self-targeted prompt injection — the patched record round-trips into the
   * system prompt on the next turn, so a freeform string here is unsafe.
   */
  async function patch(userId, prefs = {}) {
    if (!userId || !prefs || typeof prefs !== "object") return;
    const updates = {};
    for (const k of ALLOWED_KEYS) {
      const validated = validatePrefValue(k, prefs[k]);
      if (validated !== null) updates[k] = validated;
    }
    if (Object.keys(updates).length === 0) return;

    const now = Date.now();
    const names = { "#u": "updatedAt" };
    const values = { ":u": now };
    const setParts = ["#u = :u"];
    Object.entries(updates).forEach(([key, value], i) => {
      const nameToken = `#k${i}`;
      const valueToken = `:v${i}`;
      names[nameToken] = key;
      values[valueToken] = value;
      setParts.push(`${nameToken} = ${valueToken}`);
    });

    try {
      await dynamoClient.send(
        new UpdateCommand({
          TableName: mediaTable,
          Key: { pk: buildMediaPk(userId), sk: buildAgentPrefsSk() },
          UpdateExpression: `SET ${setParts.join(", ")}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        })
      );
    } catch {
      // Best-effort; agentState is bias only, not source of truth
    }
  }

  async function clear(userId) {
    if (!userId) return;
    try {
      await dynamoClient.send(
        new DeleteCommand({
          TableName: mediaTable,
          Key: { pk: buildMediaPk(userId), sk: buildAgentPrefsSk() },
        })
      );
    } catch {
      // Silent
    }
  }

  return { load, patch, clear };
}

module.exports = {
  createAgentState,
  ALLOWED_KEYS,
  validatePrefValue,
  VALID_STYLES,
  VALID_ASPECTS,
  VALID_THEMES,
};
