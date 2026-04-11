const { Router } = require("express");
const {
  sortSessionsByRecent,
  normalizeSessionItem,
  buildSessionResponse,
  resolveSessionId,
} = require("./session-helpers");
const { requireEnv, requireAuth, requireParam } = require("../../lib/route-guards");
const { handleRouteError } = require("../../lib/error-handler");

module.exports = function registerStorySessionRoutes(deps) {
  const {
    mediaTable,
    ensureStoryPresets,
    ensureStoryCharacters,
    queryBySkPrefix,
    buildMediaPk,
    storyPresets,
    buildCharacterPrompt,
    resolveStoryLorebook,
    buildInitialStoryState,
    buildStorySessionSk,
    buildStoryMessageSk,
    buildStorySceneSk,
    dynamoClient,
    PutCommand,
    storyMessagePrefix,
    storyScenePrefix,
    DeleteCommand,
    buildUserPrefix,
    deleteS3ObjectsByPrefix,
  } = deps;

  const ACTIVE_STORY_PRESET_IDS = new Set(["frieren-road"]);
  const filterActiveStoryPresets = (presets = []) =>
    presets.filter((preset) => ACTIVE_STORY_PRESET_IDS.has(preset?.id));

  const deleteSessionCascade = async ({
    userId,
    sessionId,
    mediaTableName,
    mediaBucket,
  }) => {
    const messages = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: storyMessagePrefix(sessionId),
      limit: 200,
      scanForward: true,
    });
    const scenes = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: storyScenePrefix(sessionId),
      limit: 200,
      scanForward: true,
    });

    const deleteItems = [
      { pk: buildMediaPk(userId), sk: buildStorySessionSk(sessionId) },
      ...messages.map((item) => ({ pk: item.pk, sk: item.sk })),
      ...scenes.map((item) => ({ pk: item.pk, sk: item.sk })),
    ];

    await Promise.all(
      deleteItems.map((item) =>
        dynamoClient.send(
          new DeleteCommand({
            TableName: mediaTableName,
            Key: item,
          })
        )
      )
    );

    if (mediaBucket) {
      const prefix = `${buildUserPrefix(userId)}stories/${sessionId}/`;
      try {
        await deleteS3ObjectsByPrefix(mediaBucket, prefix);
      } catch (error) {
        console.warn("Failed to delete story assets:", {
          message: error?.message || String(error),
          prefix,
        });
      }
    }

    return {
      deletedMessages: messages.length,
      deletedScenes: scenes.length,
    };
  };

  const router = Router();

  router.get("/sessions", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    if (!requireEnv(res, "MEDIA_TABLE", mediaTable)) return;
    if (!requireAuth(res, userId)) return;
    try {
      const rawItems = await queryBySkPrefix({
        pk: buildMediaPk(userId),
        skPrefix: "SESSION#",
        limit: 200,
        scanForward: false,
      });
      const items = rawItems
        .map(normalizeSessionItem)
        .filter((item) => item.sessionId);
      const keepByPreset = new Map();
      const duplicateSessions = [];

      sortSessionsByRecent(items).forEach((item) => {
        const key = item.presetId || item.sessionId;
        if (!keepByPreset.has(key)) {
          keepByPreset.set(key, item);
          return;
        }
        duplicateSessions.push(item);
      });

      const sessions = sortSessionsByRecent(
        Array.from(keepByPreset.values())
      ).map(buildSessionResponse);

      res.json({
        sessions,
        duplicateSessionsHidden: duplicateSessions.length,
      });
    } catch (error) {
      return handleRouteError(res, "list story sessions", error);
    }
  });

  router.delete("/sessions", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const mediaBucket = process.env.MEDIA_BUCKET;
    if (!requireEnv(res, "MEDIA_TABLE", mediaTable)) return;
    if (!requireAuth(res, userId)) return;

    try {
      const rawSessions = await queryBySkPrefix({
        pk: buildMediaPk(userId),
        skPrefix: "SESSION#",
        limit: 200,
        scanForward: false,
      });
      const sessions = rawSessions
        .map(normalizeSessionItem)
        .filter((item) => item.sessionId);

      if (sessions.length === 0) {
        return res.json({
          deletedSessions: 0,
          deletedMessages: 0,
          deletedScenes: 0,
        });
      }

      const deleted = await Promise.all(
        sessions.map((item) =>
          deleteSessionCascade({
            userId,
            sessionId: item.sessionId,
            mediaTableName: mediaTable,
            mediaBucket,
          })
        )
      );

      const totals = deleted.reduce(
        (acc, item) => ({
          deletedMessages: acc.deletedMessages + (item.deletedMessages || 0),
          deletedScenes: acc.deletedScenes + (item.deletedScenes || 0),
        }),
        { deletedMessages: 0, deletedScenes: 0 }
      );

      return res.json({
        deletedSessions: sessions.length,
        deletedMessages: totals.deletedMessages,
        deletedScenes: totals.deletedScenes,
      });
    } catch (error) {
      return handleRouteError(res, "delete story sessions", error);
    }
  });

  router.post("/sessions", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const presetId = req.body?.presetId;
    const title = req.body?.title?.trim();
    // New optional fields: characterId and loraProfileId
    const requestedCharacterId = req.body?.characterId || null;
    const requestedLoraProfileId = req.body?.loraProfileId || null;
    if (!requireEnv(res, "MEDIA_TABLE", mediaTable)) return;
    if (!requireAuth(res, userId)) return;
    if (!requireParam(res, "presetId", presetId)) return;

    try {
      const mediaBucket = process.env.MEDIA_BUCKET;
      const ensuredPresets = await ensureStoryPresets();
      const presets = filterActiveStoryPresets(
        ensuredPresets.length ? ensuredPresets : storyPresets
      );
      const characters = await ensureStoryCharacters();
      const characterMap = new Map(
        characters.map((character) => [character.id, character])
      );
      const preset = presets.find((item) => item.id === presetId);
      if (!preset) {
        return res.status(400).json({
          message: "Invalid presetId",
          allowedPresetIds: Array.from(ACTIVE_STORY_PRESET_IDS),
        });
      }
      const resolvedProtagonistId =
        preset.protagonistId ||
        (preset.protagonistName?.toLowerCase().includes("frieren")
          ? "frieren"
          : "");
      const character = characterMap.get(resolvedProtagonistId) || null;
      const protagonistPrompt =
        preset.protagonistPrompt || character?.identityPrompt || buildCharacterPrompt(character);
      const protagonistName =
        character?.name || preset.protagonistName || "Protagonist";
      const resolvedLorebook = resolveStoryLorebook(preset, protagonistName);
      const initialStoryState = buildInitialStoryState(resolvedLorebook);

      const rawExistingSessions = await queryBySkPrefix({
        pk: buildMediaPk(userId),
        skPrefix: "SESSION#",
        limit: 200,
        scanForward: false,
      });
      const existingSessions = rawExistingSessions
        .map(normalizeSessionItem)
        .filter((item) => item.sessionId);
      const samePresetSessions = existingSessions.filter(
        (item) => item.presetId === preset.id
      );
      if (samePresetSessions.length > 0) {
        await Promise.all(
          samePresetSessions.map((item) =>
            deleteSessionCascade({
              userId,
              sessionId: item.sessionId,
              mediaTableName: mediaTable,
              mediaBucket,
            })
          )
        );
      }

      const sessionId = `story-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      const now = new Date().toISOString();
      const sessionItem = {
        pk: buildMediaPk(userId),
        sk: buildStorySessionSk(sessionId),
        type: "STORY_SESSION",
        sessionId,
        title: title || preset.name,
        presetId: preset.id,
        synopsis: preset.synopsis,
        protagonistId: resolvedProtagonistId || character?.id || "",
        protagonistName,
        protagonistPrompt,
        // characterId: explicit character selection (may differ from protagonistId)
        characterId: requestedCharacterId || resolvedProtagonistId || character?.id || null,
        // loraProfileId: optional LoRA profile to use for illustrations
        loraProfileId: requestedLoraProfileId || null,
        worldPrompt: preset.worldPrompt,
        stylePrompt: preset.stylePrompt,
        negativePrompt: preset.negativePrompt,
        opening: preset.opening,
        lorebook: resolvedLorebook,
        storyState: initialStoryState,
        summary: "",
        turnCount: 0,
        sceneCount: 1,
        lastIllustrationTurn: 0,
        createdAt: now,
        updatedAt: now,
      };

      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: sessionItem,
        })
      );

      const openingMessage = {
        pk: buildMediaPk(userId),
        sk: buildStoryMessageSk(sessionId, Date.now()),
        type: "STORY_MESSAGE",
        sessionId,
        role: "assistant",
        content: preset.opening,
        createdAt: now,
      };

      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: openingMessage,
        })
      );

      const openingSceneId = `opening-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      const openingScenePrompt = [
        "balanced composition, coherent staging",
        preset.worldPrompt,
      ]
        .filter(Boolean)
        .join(", ");
      const openingScene = {
        pk: buildMediaPk(userId),
        sk: buildStorySceneSk(sessionId, openingSceneId),
        type: "STORY_SCENE",
        sessionId,
        sceneId: openingSceneId,
        title: "Opening scene",
        description: preset.opening,
        prompt: openingScenePrompt,
        status: "pending",
        createdAt: now,
      };

      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: openingScene,
        })
      );

      res.json({
        session: {
          id: sessionId,
          title: sessionItem.title,
          presetId: sessionItem.presetId,
          protagonistName: sessionItem.protagonistName,
          synopsis: sessionItem.synopsis,
          lorebook: sessionItem.lorebook,
          storyState: sessionItem.storyState,
          createdAt: now,
          updatedAt: now,
          turnCount: 0,
          sceneCount: 1,
        },
        messages: [
          {
            role: "assistant",
            content: preset.opening,
            createdAt: now,
          },
        ],
        scenes: [
          {
            sceneId: openingSceneId,
            title: "Opening scene",
            description: preset.opening,
            prompt: openingScenePrompt,
            status: "pending",
            createdAt: now,
          },
        ],
      });
    } catch (error) {
      return handleRouteError(res, "create story session", error);
    }
  });

  return router;
};
