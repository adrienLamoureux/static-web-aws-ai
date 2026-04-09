"use strict";

const { Router } = require("express");
const { getFlags, saveFlags, KNOWN_FLAGS } = require("../../lib/feature-flags");

/**
 * Feature flag routes registered under /ops/director.
 *
 * GET  /features  — public (no auth). Returns current flags.
 * PUT  /features  — adminGuard. Updates flags and persists to DynamoDB.
 */
module.exports = function registerFeatureFlagsRoutes(deps) {
  const { requireUserMiddleware, requireAdminMiddleware } = deps;
  const adminGuard = [requireUserMiddleware, requireAdminMiddleware];

  const knownFlagSet = new Set(KNOWN_FLAGS);

  const router = Router();

  // ── GET /director/features ─────────────────────────────────────────────
  // Public — no auth required. Returns current feature flags.
  router.get("/director/features", async (req, res) => {
    try {
      const flags = await getFlags(deps);
      return res.json({ flags });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load feature flags",
        error: error?.message || String(error),
      });
    }
  });

  // ── PUT /director/features ─────────────────────────────────────────────
  // Admin only. Validates flag names and persists update.
  router.put("/director/features", ...adminGuard, async (req, res) => {
    const inputFlags = req.body?.flags;

    if (!inputFlags || typeof inputFlags !== "object" || Array.isArray(inputFlags)) {
      return res.status(400).json({ message: "flags must be an object" });
    }

    // Validate that only known flag names are present
    const unknownKeys = Object.keys(inputFlags).filter((k) => !knownFlagSet.has(k));
    if (unknownKeys.length > 0) {
      return res.status(400).json({
        message: "Unknown feature flag(s)",
        unknownKeys,
        knownFlags: KNOWN_FLAGS,
      });
    }

    try {
      const flags = await saveFlags(deps, inputFlags);
      return res.json({ flags });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to save feature flags",
        error: error?.message || String(error),
      });
    }
  });

  return router;
};
