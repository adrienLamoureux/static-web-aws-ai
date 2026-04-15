const { Router } = require("express");
const { ScanCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

/**
 * Admin-only director routes: cross-user session browser + companion memory admin.
 *
 * Registered under /ops by operations-routes.js.
 */
module.exports = function registerDirectorAdminRoutes(deps) {
  const {
    mediaTable,
    dynamoClient,
    buildMediaPk,
    buildCompanionMemorySk,
    companionMsgPrefix,
    companionMemory,
    DeleteCommand,
    queryBySkPrefix,
  } = deps;

  const { requireUserMiddleware, requireAdminMiddleware } = deps;
  const adminGuard = [requireUserMiddleware, requireAdminMiddleware];

  const router = Router();

  // ── A2: GET /ops/director/story/sessions/all ─────────────────────────────
  // Cross-user story session browser. Returns top-level SESSION# items only.
  router.get("/director/story/sessions/all", ...adminGuard, async (req, res) => {
    const rawLimit = Number(req.query?.limit) || 100;
    const limit = Math.min(Math.max(1, rawLimit), 200);

    if (!mediaTable) {
      return res.status(500).json({ message: "MEDIA_TABLE is not set" });
    }

    try {
      const response = await dynamoClient.send(
        new ScanCommand({
          TableName: mediaTable,
          FilterExpression:
            "begins_with(sk, :prefix) AND NOT contains(sk, :msg) AND NOT contains(sk, :scene)",
          ExpressionAttributeValues: {
            ":prefix": "SESSION#",
            ":msg": "#MSG#",
            ":scene": "#SCENE#",
          },
          Limit: 1000,
        })
      );

      const rawItems = response.Items || [];
      const sessions = rawItems
        .filter((item) => {
          const sk = String(item.sk || "");
          return /^SESSION#[^#]+$/.test(sk);
        })
        .map((item) => {
          const pk = String(item.pk || "");
          const userId = pk.startsWith("USER#") ? pk.slice("USER#".length) : pk;
          const sk = String(item.sk || "");
          const sessionId = sk.startsWith("SESSION#") ? sk.slice("SESSION#".length) : sk;
          return {
            userId,
            sessionId,
            title: item.title || "Untitled session",
            presetId: item.presetId || "",
            characterId: item.characterId || "",
            turnCount: Number(item.turnCount || 0),
            sceneCount: Number(item.sceneCount || 0),
            directorPinned: Boolean(item.directorPinned),
            createdAt: item.createdAt || "",
            updatedAt: item.updatedAt || item.createdAt || "",
          };
        })
        .sort((a, b) => {
          const aTime = a.updatedAt || a.createdAt || "";
          const bTime = b.updatedAt || b.createdAt || "";
          return bTime < aTime ? -1 : bTime > aTime ? 1 : 0;
        })
        .slice(0, limit);

      return res.json({ sessions, total: sessions.length, limit });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load story sessions",
        error: error?.message || String(error),
      });
    }
  });

  // ── A3: GET /ops/director/companion/memory ────────────────────────────────
  // Admin read of companion memory for a specific userId + modelId.
  router.get("/director/companion/memory", ...adminGuard, async (req, res) => {
    const userId = String(req.query?.userId || "").trim();
    const modelId = String(req.query?.modelId || "hiyori_free").trim();

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    if (!mediaTable) {
      return res.status(500).json({ message: "MEDIA_TABLE is not set" });
    }

    try {
      // Load memory record
      const memSk = buildCompanionMemorySk(modelId);
      const pk = buildMediaPk(userId);

      const memResult = await dynamoClient
        .send(new GetCommand({ TableName: mediaTable, Key: { pk, sk: memSk } }))
        .catch(() => ({ Item: null }));

      const memItem = memResult.Item || null;

      // Load last 5 messages
      const msgPrefix = companionMsgPrefix(modelId);
      let recentMessages = [];
      if (queryBySkPrefix) {
        const allMsgs = await queryBySkPrefix({
          pk,
          skPrefix: msgPrefix,
          limit: 20,
          scanForward: false,
        }).catch(() => []);
        recentMessages = (allMsgs || []).slice(0, 5).map((m) => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        }));
      }

      return res.json({
        userId,
        modelId,
        summary: memItem?.summary || null,
        turnCount: memItem?.turnCount || 0,
        lastUpdatedAt: memItem?.updatedAt || null,
        recentMessages,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load companion memory",
        error: error?.message || String(error),
      });
    }
  });

  // ── A3: DELETE /ops/director/companion/memory ─────────────────────────────
  // Admin clear of companion memory for a specific userId + modelId.
  router.delete("/director/companion/memory", ...adminGuard, async (req, res) => {
    const userId = String(req.query?.userId || "").trim();
    const modelId = String(req.query?.modelId || "hiyori_free").trim();

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    if (!mediaTable) {
      return res.status(500).json({ message: "MEDIA_TABLE is not set" });
    }

    try {
      if (companionMemory?.clearMemory) {
        await companionMemory.clearMemory(userId, modelId);
      } else {
        // Fallback: clear manually via DynamoDB
        const pk = buildMediaPk(userId);
        const memSk = buildCompanionMemorySk(modelId);
        const msgPrefix = companionMsgPrefix(modelId);

        let msgItems = [];
        if (queryBySkPrefix) {
          msgItems = await queryBySkPrefix({ pk, skPrefix: msgPrefix, limit: 200 }).catch(() => []);
        }

        await Promise.all([
          ...(msgItems || []).map((item) =>
            dynamoClient
              .send(new DeleteCommand({ TableName: mediaTable, Key: { pk, sk: item.sk } }))
              .catch(() => {})
          ),
          dynamoClient
            .send(new DeleteCommand({ TableName: mediaTable, Key: { pk, sk: memSk } }))
            .catch(() => {}),
        ]);
      }

      return res.json({ cleared: true, userId, modelId });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to clear companion memory",
        error: error?.message || String(error),
      });
    }
  });

  return router;
};
