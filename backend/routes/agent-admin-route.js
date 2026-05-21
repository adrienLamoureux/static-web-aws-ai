"use strict";

/**
 * agent-admin-route — admin-only Sanctum endpoints for Agent mode.
 *
 *   GET  /api/admin/agent/model — return current Bedrock model id + env default
 *   PUT  /api/admin/agent/model — admin sets/clears the model override
 *   GET  /api/admin/agent/cost  — admin scans AGENT#COST records sorted by total tokens
 *
 * Split from agent-route.js to keep that file under the 500-line cap and to
 * group admin surface area in one place.
 */

const { requireUserMiddleware, requireAdminMiddleware } = require("../lib/auth");
const { getAgentModelId, setAgentModelId } = require("../lib/agent-config");

module.exports = (app, deps) => {
  const { agentCost, promptHelperModelId } = deps;

  // ─── GET /api/admin/agent/model ─────────────────────────────────────────
  app.get(
    "/api/admin/agent/model",
    requireUserMiddleware,
    requireAdminMiddleware,
    async (req, res) => {
      const modelId = await getAgentModelId(deps);
      res.json({ modelId, default: promptHelperModelId });
    }
  );

  // ─── PUT /api/admin/agent/model ─────────────────────────────────────────
  app.put(
    "/api/admin/agent/model",
    requireUserMiddleware,
    requireAdminMiddleware,
    async (req, res) => {
      const raw = String(req.body?.modelId || "").trim();
      try {
        // Empty input → reset to env default (effectively clears override)
        const target = raw || promptHelperModelId;
        const saved = await setAgentModelId(deps, target);
        return res.json({ modelId: saved, reset: !raw });
      } catch (err) {
        console.error("[agent-admin-route] set model error:", err?.message || err);
        return res.status(500).json({ error: "model_save_failed" });
      }
    }
  );

  // ─── GET /api/admin/agent/cost ──────────────────────────────────────────
  // Admin-only. Scans all AGENT#COST records and returns the per-user
  // running token totals (input + output + turn count), sorted by total
  // tokens desc. Used by Sanctum to surface who's burning budget.
  app.get(
    "/api/admin/agent/cost",
    requireUserMiddleware,
    requireAdminMiddleware,
    async (req, res) => {
      if (!agentCost) return res.status(503).json({ error: "cost_telemetry_unavailable" });
      const limit = Math.min(Math.max(Math.round(Number(req.query?.limit) || 50), 1), 200);
      const result = await agentCost.scanAll({ maxItems: limit * 2 }).catch(() => ({ items: [] }));
      const sorted = (result.items || [])
        .map((it) => ({ ...it, totalTokens: (it.inputTokens || 0) + (it.outputTokens || 0) }))
        .sort((a, b) => b.totalTokens - a.totalTokens)
        .slice(0, limit);
      res.json({
        items: sorted,
        scannedCount: result.scannedCount || 0,
        truncated: Boolean(result.truncated),
      });
    }
  );
};
