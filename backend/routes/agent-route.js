"use strict";

/**
 * agent-route — POST /api/agent/turn
 *
 * v0 Agent mode endpoint. Uses Bedrock `ConverseCommand` with one tool
 * (`generate_image`). On `stopReason === "tool_use"` the dispatcher kicks off
 * a Replicate prediction and returns the job descriptor. The frontend then
 * polls the existing `/replicate/image/status` endpoint.
 *
 * Gated behind feature flag `agentMode`. When the flag is off, requests 404
 * so the frontend's silent fallback path triggers.
 */

const { requireUserMiddleware } = require("../lib/auth");
const { getFlags, evaluateFlag } = require("../lib/feature-flags");
const { ALL_TOOL_SPECS, dispatchTool } = require("../lib/agent-tools");
const { getAgentModelId } = require("../lib/agent-config");
const { sanitiseSessionId } = require("../lib/agent-sessions");

/**
 * Resolve the per-user memory namespace from a request body. Falls back to the
 * legacy `modelId` body field for back-compat with old clients, then to the
 * implicit "default" session. The sanitiser strips anything outside
 * `[a-zA-Z0-9_-]` so an attacker can't inject `#MSG#` style sub-keys into the
 * SK namespace (still PK-scoped to the user, but freeform SK fragments could
 * collide with the messages prefix the agent-memory module writes).
 */
const resolveSessionId = (body) => {
  const raw = body?.sessionId || body?.modelId || "default";
  return sanitiseSessionId(raw) || "default";
};

// Additive system prompt fragment appended when the user is in companion
// mode (viewport-takeover, no app shell). Hiyori is the ONLY interface — so
// she narrates more, mentions on-screen affordances, and politely refuses
// admin operations with an offer to drop into the dashboard.
const COMPANION_MODE_ADDENDUM = `

## Companion mode (the user has handed you the entire screen)
- Be a touch more narrative: "let me see…", "okay, pulling that up now…", "the grid below shows your last 8 — the cooler-toned one is gorgeous."
- Mention what is appearing on screen so the user can react to it ("scroll down to see them").
- Confirm via natural language, not buttons — if a destructive or story-shaping action is required, ask once ("delete that one? say yes if you mean it") and only proceed after explicit assent in the next turn.
- ADMIN OPERATIONS ARE OUT OF REACH. If the user asks for anything Sanctum/admin-only (LoRA catalog edits, feature flags, model picker, cost dashboard, user management), respond with: "That one's behind the Director's desk — I can't help from here. Want me to drop you into the dashboard?" Do NOT call any tool for these asks.
- Stick to one tool per turn here. Multi-step plans can feel disorienting without the visual scaffolding of agent-mode panels.`;

const SYSTEM_PROMPT = `You are Hiyori, the resident creative agent inside Whisk Studio's Atelier (the image studio). The user has switched to Agent mode and is trusting you to drive the creative process.

## Voice
- Warm, slightly playful, confident. 1–3 sentences max before any tool use.
- You narrate your *choices* ("picking Nova Canvas at 3:4 with the sakura preset — ikuyo!") rather than asking permission. Decisive but never bossy.
- Light Japanese flavor is fine sparingly ("ikuyo!", "neh~"); never cosplay.

## Tools
- \`generate_image\` — any visual intent ("dragon", "sunset"). Pick: style ('anime' default, 'manga' for ink/B&W, 'chibi' for cute, 'photoreal' for cinematic), aspect ('3:4' default portrait, '16:9' wide, '1:1' square), prompt (rewrite to SD-style English with quality tags).
- \`set_theme\` — when the user asks for a different mood/vibe ('darker', 'cozier'). Map to the closest theme id.
- \`continue_story\` — when the user narrates a story beat ('let's have her open the door'). The user confirms before commit.
- \`illustrate_scene\` — when the user asks to see a specific written scene. The user confirms before commit.
- \`recall_favorites\` — pull the user's recent generations to spot patterns. Use when they mention 'my favorites', 'what I usually like', or ask for variations on prior style. Look at the returned prompts and comment on themes in your follow-up.
- \`generate_music\` — score a story scene. Use when the user asks for music ('something melancholic for the rooftop scene'). Pick a single-word mood + short description. User confirms before commit.
- \`browse_gallery\` — pull recent public shared images for inspiration. Use when the user asks 'what's been popular', 'show me ideas', or seems stuck. Comment on what you see in your follow-up.

Pick *one tool per turn by default*. You MAY chain 2–3 tools in a single turn when the user's request naturally maps to a multi-step workflow:
- "start a story about a fox spirit and illustrate the opening" → \`continue_story\` + \`illustrate_scene\`
- "make me a forest scene and pick a matching theme" → \`generate_image\` + \`set_theme\`
- "show me my favorites then make a variation of the first one" → \`recall_favorites\` + \`generate_image\`

Never chain more than 3 tools — verbose plans feel scripted. Always include a brief text response BEFORE the tool calls explaining the plan in one sentence ("first the story, then the illustration — ikuyo!").

## When NOT to call any tool
- The user is chatting, asking questions, or thanking you — respond in plain text.
- The user is critiquing a previous result without asking for a new one.

## Memory + preferences
If \`<memory>\` is provided, personalise your choices. If \`<prefs>\` is provided, bias your tool defaults toward those values (lastStyle, lastAspect) — they reflect what the user has actually chosen before.

## Emotion
End EVERY response with exactly one emotion tag on its own line:
[EMOTION: happy] | [EMOTION: thinking] | [EMOTION: surprised] | [EMOTION: neutral]`;

const EMOTION_RE = /\[EMOTION:\s*(happy|sad|surprised|thinking|neutral)\]/i;

const stripEmotion = (text = "") => text.replace(EMOTION_RE, "").trim();

const extractEmotion = (text = "") => {
  const m = text.match(EMOTION_RE);
  return m ? m[1].toLowerCase() : "neutral";
};

/**
 * Convert client messages into Bedrock Converse format.
 * Bedrock expects { role: "user"|"assistant", content: [{ text: "..." }] }.
 */
const toConverseMessages = (msgs = []) =>
  msgs
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: [{ text: String(m.content || m.text || "").trim() }],
    }))
    .filter((m) => m.content[0].text);

/**
 * Run a "closing turn" — send the toolResult back to the model so it can write
 * a short follow-up sentence ("turned out gentler than I expected — want me to
 * push the contrast?"). Capped at maxTokens=120 to keep latency bounded.
 *
 * Falls back to the pre-tool text on any failure — never blocks the response.
 */
const runClosingTurn = async ({
  bedrockClient,
  ConverseCommand,
  modelId,
  system,
  messages,
  preToolText,
  toolUses,
  toolCalls,
}) => {
  if (!toolUses.length || !toolCalls.length) return null;

  // Reconstruct the assistant turn the model just produced (text + toolUse
  // blocks) and append a toolResult block for each call. Bedrock requires the
  // toolUseId from the original toolUse block to be echoed back.
  const assistantContent = [];
  if (preToolText) assistantContent.push({ text: preToolText });
  for (const tu of toolUses) {
    assistantContent.push({
      toolUse: { toolUseId: tu.toolUseId, name: tu.name, input: tu.input || {} },
    });
  }

  const userToolResults = toolCalls.map((tc, i) => ({
    toolResult: {
      toolUseId: toolUses[i]?.toolUseId,
      content: [{ json: tc.error ? { error: tc.error } : tc.result || { status: "ok" } }],
      ...(tc.error ? { status: "error" } : {}),
    },
  }));

  try {
    const cmd = new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages: [
        ...messages,
        { role: "assistant", content: assistantContent },
        { role: "user", content: userToolResults },
      ],
      // No toolConfig — we want a text-only closing reply.
      inferenceConfig: { maxTokens: 120, temperature: 0.7 },
    });
    const resp = await bedrockClient.send(cmd);
    const blocks = resp?.output?.message?.content || [];
    const text = blocks
      .map((b) => b.text)
      .filter(Boolean)
      .join("")
      .trim();
    return {
      text,
      inputTokens: resp?.usage?.inputTokens || 0,
      outputTokens: resp?.usage?.outputTokens || 0,
    };
  } catch (err) {
    console.warn("[agent-route] closing turn failed:", err?.message || err);
    return null;
  }
};

module.exports = (app, deps) => {
  const {
    bedrockClient,
    promptHelperModelId,
    agentMemory,
    agentState,
    agentRateLimit,
    agentCost,
    ConverseCommand,
  } = deps;

  /**
   * Apply rate limit + emit a 429 with a Retry-After header. Returns true
   * when the request should proceed, false when it was already rejected.
   */
  const checkRateLimit = async (userId, res, opts) => {
    if (!agentRateLimit) return true;
    const verdict = await agentRateLimit.check(userId, opts).catch(() => ({ allowed: true }));
    if (verdict.allowed) {
      if (typeof verdict.remaining === "number") {
        res.setHeader?.("X-RateLimit-Remaining", String(verdict.remaining));
      }
      return true;
    }
    const retrySec = Math.max(1, Math.ceil((verdict.retryAfterMs || 1000) / 1000));
    res.setHeader?.("Retry-After", String(retrySec));
    res.status(429).json({ error: "rate_limited", retryAfterMs: verdict.retryAfterMs });
    return false;
  };

  if (!ConverseCommand) {
    // ConverseCommand not wired in deps yet — register a stub so route doesn't crash
    // (build-deps.js exports it, but defensive in case of partial deploys/tests).
    return;
  }

  // ─── POST /api/agent/turn ────────────────────────────────────────────────
  // Body: { messages: [{role, content}], context?: { page }, modelId? }
  // Response: { text, emotion, toolCalls?: [{name, args, result}], hasMemory? }
  app.post("/api/agent/turn", requireUserMiddleware, async (req, res) => {
    // Structured latency logging — single JSON line per turn for CloudWatch
    // Insights queries: `filter event="agent.turn" | stats avg(latencyMs)…`
    const _started = Date.now();
    const _logTurn = (fields) => {
      try {
        console.log(
          JSON.stringify({
            event: "agent.turn",
            latencyMs: Date.now() - _started,
            ...fields,
          })
        );
      } catch {
        // ignore — telemetry must never break a request
      }
    };

    // Feature-flag gate: 404 when off OR when user is outside the rolled-out
    // cohort. agentMode supports cohort strings ("admin", "beta", "all") in
    // addition to plain booleans — see lib/feature-flags.js.
    const flags = await getFlags(deps).catch(() => ({}));
    if (!evaluateFlag(flags, "agentMode", req.user)) {
      _logTurn({ status: 404, outcome: "agent_mode_disabled" });
      return res.status(404).json({ error: "agent_mode_disabled" });
    }

    const body = req.body || {};
    const userId = req.user?.sub;
    // sessionId is the v1.7 name for the memory namespace key. Sanitised so a
    // user can't inject `#MSG#` style fragments and shadow the messages SK.
    const modelId = resolveSessionId(body);
    const ctx = body.context || {};

    if (!userId) {
      _logTurn({ status: 401, outcome: "unauthorized" });
      return res.status(401).json({ error: "unauthorized" });
    }

    // ── Rate limit (token bucket per user) ───────────────────────────────
    // Defaults: 30 tokens, 1 token / 2s refill — sustains ~30 req/min.
    if (!(await checkRateLimit(userId, res))) {
      _logTurn({ status: 429, outcome: "rate_limited", userId });
      return;
    }

    // ── Daily token spend cap (soft budget) ──────────────────────────────
    // Distinct from the request bucket — caps daily Bedrock token usage so
    // runaway loops can't bankrupt a user. 200k tokens/day default
    // (~$0.20 at Haiku 4.5 prices). Fails open on DB errors.
    if (agentCost) {
      const dailyVerdict = await agentCost.checkDailyCap(userId).catch(() => ({ allowed: true }));
      if (!dailyVerdict.allowed) {
        const retrySec = Math.max(1, Math.ceil((dailyVerdict.retryAfterMs || 3600_000) / 1000));
        res.setHeader?.("Retry-After", String(retrySec));
        _logTurn({
          status: 429,
          outcome: "daily_cap_reached",
          userId,
          tokensToday: dailyVerdict.tokensToday,
        });
        return res.status(429).json({
          error: "daily_cap_reached",
          tokensToday: dailyVerdict.tokensToday,
          capacity: dailyVerdict.capacity,
          retryAfterMs: dailyVerdict.retryAfterMs,
        });
      }
    }

    // ── Load memory + cross-session prefs in parallel ────────────────────
    const [memory, prefs] = await Promise.all([
      agentMemory ? agentMemory.loadMemory(userId, modelId).catch(() => null) : null,
      agentState ? agentState.load(userId).catch(() => null) : null,
    ]);

    // ── Build system + history ───────────────────────────────────────────
    let system = SYSTEM_PROMPT;
    if (ctx.mode === "companion") system += COMPANION_MODE_ADDENDUM;
    if (ctx.page) system += `\n\nContext: The user is on the ${ctx.page} page.`;
    if (memory?.summary) system += `\n\n<memory>${memory.summary}</memory>`;
    if (prefs) {
      const summarised = ["lastStyle", "lastAspect", "lastLora", "theme"]
        .filter((k) => prefs[k])
        .map((k) => `${k}=${prefs[k]}`)
        .join(", ");
      if (summarised) system += `\n\n<prefs>${summarised}</prefs>`;
    }

    const serverHistory = (memory?.messages || []).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: [{ text: String(m.content || "").trim() }],
    }));
    const clientMsgs = toConverseMessages((body.messages || []).slice(-6));
    const merged = [...serverHistory, ...clientMsgs].slice(-16);
    if (merged.length === 0) {
      _logTurn({ status: 400, outcome: "messages_required" });
      return res.status(400).json({ error: "messages_required" });
    }

    // ── Call Bedrock Converse with tools ─────────────────────────────────
    // Bedrock model id is admin-configurable via Sanctum (Director Agent
    // Model picker) — falls back to env-backed default if no override set.
    // Distinct from `modelId` (the per-user memory partition above).
    const bedrockModelId = await getAgentModelId(deps);
    const command = new ConverseCommand({
      modelId: bedrockModelId,
      system: [{ text: system }],
      messages: merged,
      toolConfig: { tools: ALL_TOOL_SPECS },
      inferenceConfig: { maxTokens: 400, temperature: 0.7 },
    });

    let response;
    try {
      response = await bedrockClient.send(command);
    } catch (err) {
      console.error("[agent-route] Converse error:", err?.message || err);
      _logTurn({ status: 500, outcome: "bedrock_failed", error: err?.message });
      return res.status(500).json({ error: "agent_unavailable" });
    }

    // ── Parse output ─────────────────────────────────────────────────────
    const outputBlocks = response?.output?.message?.content || [];
    const stopReason = response?.stopReason || "end_turn";
    const initialUsage = {
      inputTokens: response?.usage?.inputTokens || 0,
      outputTokens: response?.usage?.outputTokens || 0,
    };

    let preToolText = "";
    const toolUses = [];
    for (const block of outputBlocks) {
      if (block.text) preToolText += block.text;
      if (block.toolUse) toolUses.push(block.toolUse);
    }

    const emotion = extractEmotion(preToolText);
    const text = stripEmotion(preToolText) || "(thinking…)";

    // ── Dispatch tool uses ───────────────────────────────────────────────
    const toolCalls = [];
    if (stopReason === "tool_use" && toolUses.length > 0) {
      for (const tu of toolUses) {
        let dispatched;
        try {
          dispatched = await dispatchTool({
            name: tu.name,
            args: tu.input || {},
            deps,
            userId,
          });
        } catch (err) {
          console.error("[agent-route] dispatchTool threw:", err?.message || err);
          dispatched = { ok: false, error: err?.message || "tool_dispatch_failed" };
        }
        toolCalls.push({
          name: tu.name,
          args: tu.input || {},
          result: dispatched.ok ? dispatched.result : null,
          error: dispatched.ok ? null : dispatched.error,
        });
      }
    }

    // ── Optional second model turn: closing sentence after the tool ─────
    // Skip for intent-only tools (requiresConfirm) — the user hasn't acted
    // yet so the agent has nothing to react to. Also skip when every tool
    // call failed (the error copy will speak for itself).
    let closingText = "";
    let closingUsage = null;
    const eligibleForClosing =
      toolCalls.length > 0 &&
      toolCalls.some((tc) => tc.result && !tc.result.requiresConfirm && !tc.error);
    if (eligibleForClosing) {
      const closing = await runClosingTurn({
        bedrockClient,
        ConverseCommand,
        modelId: bedrockModelId,
        system,
        messages: merged,
        preToolText,
        toolUses,
        toolCalls,
      });
      if (closing?.text) {
        closingText = stripEmotion(closing.text);
        closingUsage = closing;
      }
    }

    // ── Respond ──────────────────────────────────────────────────────────
    const finalText = [text, closingText].filter(Boolean).join("\n\n");
    res.json({
      text: finalText || "(thinking…)",
      emotion,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(memory !== null ? { hasMemory: true } : {}),
    });

    // ── Cost telemetry — sum across both Bedrock calls ───────────────────
    const totalInputTokens = initialUsage.inputTokens + (closingUsage?.inputTokens || 0);
    const totalOutputTokens = initialUsage.outputTokens + (closingUsage?.outputTokens || 0);
    if (agentCost) {
      agentCost
        .record(userId, { inputTokens: totalInputTokens, outputTokens: totalOutputTokens })
        .catch(() => {});
    }

    _logTurn({
      status: 200,
      outcome: "ok",
      toolCount: toolCalls.length,
      tools: toolCalls.map((tc) => tc.name).join(",") || null,
      closingTurn: Boolean(closingText),
      stopReason,
      hasMemory: memory !== null,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });

    // ── Persist memory fire-and-forget ───────────────────────────────────
    if (agentMemory) {
      const lastUserMsg = clientMsgs.filter((m) => m.role === "user").slice(-1)[0];
      const newTurns = [
        ...(lastUserMsg ? [{ role: "user", content: lastUserMsg.content[0].text }] : []),
        {
          role: "assistant",
          content: finalText || text,
          ...(toolCalls.length > 0
            ? {
                toolCalls: toolCalls.map((tc) => ({
                  name: tc.name,
                  args: tc.args,
                  result: tc.result,
                })),
              }
            : {}),
        },
      ].filter((m) => m.content);

      agentMemory
        .saveMessages(userId, modelId, newTurns)
        .then(() => {
          const currentCount = (memory?.turnCount || 0) + newTurns.length;
          if (currentCount > (agentMemory.SUMMARY_THRESHOLD || 30)) {
            agentMemory.compactMemory(userId, modelId).catch(() => {});
          }
        })
        .catch(() => {});
      // Bump session.lastUsedAt so the picker sort surfaces it first.
      // No-op for the implicit "default" session (RESERVED_IDS guard).
      if (deps.agentSessions) {
        deps.agentSessions.touch(userId, modelId).catch(() => {});
      }
    }
  });

  // POST /api/agent/suggest lives in routes/agent-suggest-route.js (split out
  // to keep this file under the 500-line cap).

  // ─── GET /api/agent/memory/status ────────────────────────────────────────
  // sessionId (v1.7) is the preferred query param; modelId is legacy. Both
  // route through sanitiseSessionId for symmetry with /turn.
  app.get("/api/agent/memory/status", async (req, res) => {
    const userId = req.user?.sub || null;
    const modelId = resolveSessionId(req.query);
    if (!userId || !agentMemory) return res.json({ hasMemory: false });
    const status = await agentMemory
      .getMemoryStatus(userId, modelId)
      .catch(() => ({ hasMemory: false }));
    res.json(status);
  });

  // Admin endpoints live in routes/agent-admin-route.js (split for the
  // 500-line cap + to group Sanctum surface area).

  // ─── DELETE /api/agent/memory ────────────────────────────────────────────
  app.delete("/api/agent/memory", requireUserMiddleware, async (req, res) => {
    const userId = req.user.sub;
    const modelId = resolveSessionId(req.query);
    if (!agentMemory) return res.status(503).json({ error: "storage_unavailable" });
    await agentMemory.clearMemory(userId, modelId).catch(() => {});
    res.json({ ok: true });
  });
};
