"use strict";

/**
 * agent-suggest-route — POST /api/agent/suggest
 *
 * Single-field suggestion endpoint for "Let Hiyori choose" buttons in
 * Dashboard Forge. Runs a small focused Bedrock InvokeModel call (no tools,
 * capped at 60 tokens). Field-specific prompts return a single value the
 * frontend can drop straight into the matching form field.
 *
 * Body: { field: "prompt"|"style"|"aspect"|"negativePrompt", context?: { currentPrompt? } }
 * Response: { field, value }
 *
 * Gated by the agentMode flag (with cohort scoping) and per-user rate-limited.
 * Records token usage to agentCost.
 */

const { requireUserMiddleware } = require("../lib/auth");
const { getFlags, evaluateFlag } = require("../lib/feature-flags");
const { getAgentModelId } = require("../lib/agent-config");

const SUGGEST_SYSTEMS = {
  prompt:
    "You are Hiyori suggesting a Stable Diffusion image prompt. Respond with one concise " +
    "English prompt (≤120 chars), comma-separated tags ok. No quotes, no preamble, no emoji. " +
    "If the user has a currentPrompt, suggest a refinement; otherwise suggest something " +
    "evocative and shoujo-coded.",
  style:
    "You are Hiyori picking a visual style for an image prompt. Reply with EXACTLY ONE of: " +
    "anime, manga, photoreal, chibi. No other text.",
  aspect:
    "You are Hiyori picking an aspect ratio for an image prompt. Reply with EXACTLY ONE of: " +
    "1:1, 3:4, 16:9. No other text.",
  negativePrompt:
    "You are Hiyori writing a Stable Diffusion negative prompt — quality + anatomical " +
    "exclusions. Respond with one concise comma-separated list (≤120 chars). No quotes, " +
    "no preamble, no emoji. Standard inclusions: low quality, worst quality, blurry, bad " +
    "anatomy, extra digits, signature, watermark. Adjust based on the currentPrompt if given.",
};
const VALID_FIELDS = Object.keys(SUGGEST_SYSTEMS);
const VALID_STYLES = ["anime", "manga", "photoreal", "chibi"];
const VALID_ASPECTS = ["1:1", "3:4", "16:9"];

module.exports = (app, deps) => {
  const { bedrockClient, promptHelperModelId, agentRateLimit, agentCost, InvokeModelCommand } =
    deps;

  app.post("/api/agent/suggest", requireUserMiddleware, async (req, res) => {
    const flags = await getFlags(deps).catch(() => ({}));
    if (!evaluateFlag(flags, "agentMode", req.user)) {
      return res.status(404).json({ error: "agent_mode_disabled" });
    }

    // Suggest is cheap (~60 tokens, ~300ms). Generous bucket: 60 tokens, 1/s.
    const userId = req.user?.sub;
    if (agentRateLimit) {
      const verdict = await agentRateLimit
        .check(userId, { capacity: 60, refillIntervalMs: 1000 })
        .catch(() => ({ allowed: true }));
      if (!verdict.allowed) {
        const retrySec = Math.max(1, Math.ceil((verdict.retryAfterMs || 1000) / 1000));
        res.setHeader?.("Retry-After", String(retrySec));
        return res.status(429).json({ error: "rate_limited", retryAfterMs: verdict.retryAfterMs });
      }
      if (typeof verdict.remaining === "number") {
        res.setHeader?.("X-RateLimit-Remaining", String(verdict.remaining));
      }
    }

    const field = String(req.body?.field || "").trim();
    if (!VALID_FIELDS.includes(field)) {
      return res.status(400).json({ error: "invalid_field", allowed: VALID_FIELDS });
    }
    const ctx = req.body?.context || {};
    const currentPrompt = String(ctx.currentPrompt || "")
      .trim()
      .slice(0, 400);

    const system = SUGGEST_SYSTEMS[field];
    const userText = currentPrompt
      ? `currentPrompt: "${currentPrompt}"`
      : "no current prompt — pick something fresh";

    try {
      const modelId = await getAgentModelId(deps);
      const cmd = new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 60,
          temperature: 0.7,
          system,
          messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
        }),
      });
      const resp = await bedrockClient.send(cmd);
      const body = JSON.parse(new TextDecoder().decode(resp.body));
      if (agentCost) {
        agentCost
          .record(userId, {
            inputTokens: body?.usage?.input_tokens || 0,
            outputTokens: body?.usage?.output_tokens || 0,
          })
          .catch(() => {});
      }
      let value = (body?.content || [])
        .map((c) => c?.text)
        .filter(Boolean)
        .join("")
        .trim();

      // Normalise + validate per field
      if (field === "style") {
        value = value.toLowerCase().replace(/[^a-z]/g, "");
        if (!VALID_STYLES.includes(value)) value = "anime";
      } else if (field === "aspect") {
        const m = value.match(/(1:1|3:4|16:9)/);
        value = m ? m[1] : "3:4";
        if (!VALID_ASPECTS.includes(value)) value = "3:4";
      } else if (field === "prompt" || field === "negativePrompt") {
        value = value
          .replace(/\[EMOTION:.*?\]/gi, "")
          .trim()
          .replace(/^["'`]+|["'`]+$/g, "")
          .trim()
          .slice(0, 200);
      }

      if (!value) return res.status(502).json({ error: "empty_suggestion" });
      return res.json({ field, value });
    } catch (err) {
      console.error("[agent-suggest-route] error:", err?.message || err);
      return res.status(500).json({ error: "suggest_unavailable" });
    }
  });
};

module.exports.SUGGEST_SYSTEMS = SUGGEST_SYSTEMS;
module.exports.VALID_FIELDS = VALID_FIELDS;
