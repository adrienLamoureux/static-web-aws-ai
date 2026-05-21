"use strict";

/**
 * agent-sessions-route — CRUD for named agent conversation sessions.
 *
 *   GET    /api/agent/sessions          — list user's sessions (sorted by lastUsedAt desc)
 *   POST   /api/agent/sessions          — create with body { sessionId, name }
 *   PATCH  /api/agent/sessions/:id      — rename with body { name }
 *   DELETE /api/agent/sessions/:id      — delete metadata + memory
 *
 * All gated by agentMode flag + cohort scoping (same as /turn). The DELETE
 * also wipes the conversation memory via agentMemory.clearMemory.
 */

const { requireUserMiddleware } = require("../lib/auth");
const { getFlags, evaluateFlag } = require("../lib/feature-flags");

const gate = async (req, res, deps) => {
  const flags = await getFlags(deps).catch(() => ({}));
  if (!evaluateFlag(flags, "agentMode", req.user)) {
    res.status(404).json({ error: "agent_mode_disabled" });
    return false;
  }
  return true;
};

module.exports = (app, deps) => {
  const { agentSessions, agentMemory } = deps;

  app.get("/api/agent/sessions", requireUserMiddleware, async (req, res) => {
    if (!(await gate(req, res, deps))) return;
    if (!agentSessions) return res.json({ items: [] });
    const userId = req.user.sub;
    const items = await agentSessions.list(userId).catch(() => []);
    res.json({ items });
  });

  app.post("/api/agent/sessions", requireUserMiddleware, async (req, res) => {
    if (!(await gate(req, res, deps))) return;
    if (!agentSessions) return res.status(503).json({ error: "sessions_unavailable" });
    const userId = req.user.sub;
    const sessionId = String(req.body?.sessionId || "").trim();
    const name = String(req.body?.name || "").trim();
    if (!sessionId) return res.status(400).json({ error: "sessionId_required" });
    const session = await agentSessions.create(userId, { sessionId, name }).catch(() => null);
    if (!session) {
      return res.status(400).json({ error: "session_create_failed" });
    }
    res.json({ session });
  });

  app.patch("/api/agent/sessions/:id", requireUserMiddleware, async (req, res) => {
    if (!(await gate(req, res, deps))) return;
    if (!agentSessions) return res.status(503).json({ error: "sessions_unavailable" });
    const userId = req.user.sub;
    const sessionId = String(req.params.id || "").trim();
    const name = String(req.body?.name || "").trim();
    if (!sessionId) return res.status(400).json({ error: "sessionId_required" });
    if (!name) return res.status(400).json({ error: "name_required" });
    const updated = await agentSessions.rename(userId, sessionId, name).catch(() => null);
    if (!updated) return res.status(404).json({ error: "session_not_found" });
    res.json({ session: updated });
  });

  app.delete("/api/agent/sessions/:id", requireUserMiddleware, async (req, res) => {
    if (!(await gate(req, res, deps))) return;
    if (!agentSessions) return res.status(503).json({ error: "sessions_unavailable" });
    const userId = req.user.sub;
    const sessionId = String(req.params.id || "").trim();
    if (!sessionId) return res.status(400).json({ error: "sessionId_required" });
    // Wipe the conversation memory too — deleting the metadata without
    // clearing messages leaves orphaned AGENT#{id}#MSG#... rows behind.
    if (agentMemory) {
      await agentMemory.clearMemory(userId, sessionId).catch(() => {});
    }
    const removed = await agentSessions.remove(userId, sessionId).catch(() => false);
    if (!removed) return res.status(400).json({ error: "session_delete_failed" });
    res.json({ ok: true });
  });
};
