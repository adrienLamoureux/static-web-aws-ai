const { Router } = require("express");
const {
  parseOptionalNumber,
  buildSessionResponse,
} = require("./session-helpers");

module.exports = function registerStorySessionItemRoutes(deps) {
  const {
    mediaTable,
    queryBySkPrefix,
    buildMediaPk,
    buildStorySessionSk,
    dynamoClient,
    PutCommand,
    getItem,
    storyMessagePrefix,
    storyScenePrefix,
    getSignedUrl,
    s3Client,
    GetObjectCommand,
    DeleteCommand,
    buildUserPrefix,
    deleteS3ObjectsByPrefix,
  } = deps;

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

  router.patch("/sessions/:id/lora", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const sessionId = req.params?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!sessionId) return res.status(400).json({ message: "sessionId is required" });

    const loraProfileId = req.body?.loraProfileId !== undefined
      ? (req.body.loraProfileId || null)
      : undefined;

    if (loraProfileId === undefined) {
      return res.status(400).json({ message: "loraProfileId is required in body (use null to clear)" });
    }

    try {
      const existing = await getItem({
        pk: buildMediaPk(userId),
        sk: buildStorySessionSk(sessionId),
      });
      if (!existing) {
        return res.status(404).json({ message: "Story session not found" });
      }
      const now = new Date().toISOString();
      const updated = { ...existing, loraProfileId, updatedAt: now };
      await dynamoClient.send(
        new PutCommand({ TableName: mediaTable, Item: updated })
      );
      return res.json({
        session: buildSessionResponse(updated),
      });
    } catch (error) {
      console.error("Session lora patch error:", error?.message);
      return res.status(500).json({ message: "Failed to update session LoRA", error: error?.message });
    }
  });

  router.get("/sessions/:id", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const sessionId = req.params.id;
    const bucket = process.env.MEDIA_BUCKET;
    if (!mediaTable) {
      return res.status(500).json({ message: "MEDIA_TABLE is not set" });
    }
    if (!bucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    try {
      const sessionItem = await getItem({
        pk: buildMediaPk(userId),
        sk: buildStorySessionSk(sessionId),
      });
      if (!sessionItem) {
        return res.status(404).json({ message: "Session not found" });
      }

      const messages = await queryBySkPrefix({
        pk: buildMediaPk(userId),
        skPrefix: storyMessagePrefix(sessionId),
        limit: 200,
        scanForward: true,
      });
      const scenes = await queryBySkPrefix({
        pk: buildMediaPk(userId),
        skPrefix: storyScenePrefix(sessionId),
        limit: 50,
        scanForward: true,
      });

      const signedScenes = await Promise.all(
        scenes.map(async (scene) => {
          const signedScene = { ...scene };
          if (scene.imageKey) {
            try {
              signedScene.imageUrl = await getSignedUrl(
                s3Client,
                new GetObjectCommand({
                  Bucket: bucket,
                  Key: scene.imageKey,
                }),
                { expiresIn: 900 }
              );
            } catch {
              signedScene.imageUrl = "";
            }
          }
          if (scene.videoKey) {
            try {
              signedScene.videoUrl = await getSignedUrl(
                s3Client,
                new GetObjectCommand({
                  Bucket: bucket,
                  Key: scene.videoKey,
                }),
                { expiresIn: 900 }
              );
            } catch {
              signedScene.videoUrl = "";
            }
          }
          if (scene.musicKey) {
            try {
              signedScene.musicUrl = await getSignedUrl(
                s3Client,
                new GetObjectCommand({
                  Bucket: bucket,
                  Key: scene.musicKey,
                }),
                { expiresIn: 900 }
              );
            } catch {
              signedScene.musicUrl = "";
            }
          }
          return signedScene;
        })
      );

      res.json({
        session: {
          id: sessionItem.sessionId,
          title: sessionItem.title,
          presetId: sessionItem.presetId,
          protagonistName: sessionItem.protagonistName,
          synopsis: sessionItem.synopsis,
          lorebook: sessionItem.lorebook,
          storyState: sessionItem.storyState,
          createdAt: sessionItem.createdAt,
          updatedAt: sessionItem.updatedAt,
          turnCount: sessionItem.turnCount || 0,
          sceneCount: sessionItem.sceneCount || 0,
        },
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        })),
        scenes: signedScenes.map((scene) => ({
          sceneId: scene.sceneId,
          title: scene.title,
          description: scene.description,
          prompt: scene.prompt,
          sceneEnvironment: scene.sceneEnvironment,
          sceneAction: scene.sceneAction,
          status: scene.status,
          imageKey: scene.imageKey,
          imageUrl: scene.imageUrl,
          videoKey: scene.videoKey,
          videoUrl: scene.videoUrl,
          videoStatus: scene.videoStatus,
          videoPredictionId: scene.videoPredictionId,
          videoPrompt: scene.videoPrompt,
          musicKey: scene.musicKey,
          musicUrl: scene.musicUrl,
          musicStatus: scene.musicStatus,
          musicPredictionId: scene.musicPredictionId,
          musicPrompt: scene.musicPrompt,
          musicModelId: scene.musicModelId,
          musicMood: scene.musicMood,
          musicEnergy: scene.musicEnergy,
          musicTempoBpm: scene.musicTempoBpm,
          musicTags: scene.musicTags,
          musicLibraryTrackId: scene.musicLibraryTrackId,
          recommendedTrackId: scene.recommendedTrackId,
          recommendationMethod: scene.recommendationMethod,
          recommendationScore: parseOptionalNumber(scene.recommendationScore),
          promptPositive: scene.promptPositive,
          promptNegative: scene.promptNegative,
          createdAt: scene.createdAt,
        })),
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to load story session",
        error: error?.message || String(error),
      });
    }
  });

  router.delete("/sessions/:id", deps.requireUserMiddleware, async (req, res) => {
    const mediaBucket = process.env.MEDIA_BUCKET;
    const mediaTableName = process.env.MEDIA_TABLE;
    const userId = req.user?.sub;
    const sessionId = req.params.id;

    if (!mediaTableName) {
      return res.status(500).json({ message: "MEDIA_TABLE is not set" });
    }
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    try {
      const sessionItem = await getItem({
        pk: buildMediaPk(userId),
        sk: buildStorySessionSk(sessionId),
      });
      if (!sessionItem) {
        return res.status(404).json({ message: "Session not found" });
      }

      const deleted = await deleteSessionCascade({
        userId,
        sessionId,
        mediaTableName,
        mediaBucket,
      });

      res.json({
        sessionId,
        deletedMessages: deleted.deletedMessages,
        deletedScenes: deleted.deletedScenes,
      });
    } catch (error) {
      console.error("Story session delete error:", {
        name: error?.name,
        message: error?.message,
        metadata: error?.$metadata,
        cause: error?.cause,
      });
      res.status(500).json({
        message: "Failed to delete story session",
        error: error?.message || String(error),
      });
    }
  });

  return router;
};
