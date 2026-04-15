const { Router } = require("express");
const { signSceneMusicUrl } = require("./illustration-helpers");
const {
  parseOptionalNumber,
  DEFAULT_STORY_MUSIC_PROMPT,
  STORY_MUSIC_MODEL_ID,
  buildStoryMusicDefaultInput,
  buildLoopFriendlyMusicPrompt,
  mapMusicTrackResponse,
  buildSceneMusicPayload,
} = require("./music-helpers");
const { createPersistStorySceneMusic } = require("./music-recommendation");

module.exports = function registerStoryMusicRoutes(deps) {
  const {
    mediaTable,
    getItem,
    buildMediaPk,
    buildStorySessionSk,
    buildStorySceneSk,
    queryBySkPrefix,
    storyMessagePrefix,
    normalizePromptFragment,
    dynamoClient,
    PutCommand,
    getSignedUrl,
    s3Client,
    GetObjectCommand,
    replicateClient,
    buildReplicatePredictionRequest,
    aiCraftMusicDirection,
  } = deps;

  const { STORY_MUSIC_DEFAULT_INPUT } = buildStoryMusicDefaultInput(normalizePromptFragment);

  const persistStorySceneMusic = createPersistStorySceneMusic(deps);

  const router = Router();

  router.post(
    "/sessions/:id/scenes/:sceneId/music",
    deps.requireUserMiddleware,
    async (req, res) => {
      const userId = req.user?.sub;
      const sessionId = req.params.id;
      const sceneId = req.params.sceneId;
      const bucket = process.env.MEDIA_BUCKET;
      const apiToken = process.env.REPLICATE_API_TOKEN;
      const manualPrompt = req.body?.prompt?.trim() || "";

      if (!mediaTable) {
        return res.status(500).json({ message: "MEDIA_TABLE is not set" });
      }
      if (!bucket) {
        return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
      }
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!apiToken) {
        return res.status(500).json({ message: "REPLICATE_API_TOKEN must be set" });
      }
      if (!sessionId || !sceneId) {
        return res.status(400).json({ message: "sessionId and sceneId are required" });
      }

      try {
        const sessionItem = await getItem({
          pk: buildMediaPk(userId),
          sk: buildStorySessionSk(sessionId),
        });
        if (!sessionItem) {
          return res.status(404).json({ message: "Session not found" });
        }
        const sceneItem = await getItem({
          pk: buildMediaPk(userId),
          sk: buildStorySceneSk(sessionId, sceneId),
        });
        if (!sceneItem) {
          return res.status(404).json({ message: "Scene not found" });
        }

        const recentMessages = await queryBySkPrefix({
          pk: buildMediaPk(userId),
          skPrefix: storyMessagePrefix(sessionId),
          limit: 6,
          scanForward: false,
        });
        const latestAssistant = recentMessages.find((message) => message.role === "assistant");

        const direction = await aiCraftMusicDirection({
          scene: {
            title: sceneItem.title || "",
            description: sceneItem.description || "",
            prompt: sceneItem.prompt || "",
            sceneEnvironment: sceneItem.sceneEnvironment || "",
            sceneAction: sceneItem.sceneAction || "",
          },
          summary: sessionItem.summary || "",
          latest: latestAssistant?.content || "",
          overridePrompt: manualPrompt,
        });
        const prompt = buildLoopFriendlyMusicPrompt(
          normalizePromptFragment,
          direction?.prompt || manualPrompt || sceneItem.musicPrompt || DEFAULT_STORY_MUSIC_PROMPT
        );
        const musicInput = {
          ...STORY_MUSIC_DEFAULT_INPUT,
          prompt,
        };

        const predictionRequest = buildReplicatePredictionRequest({
          modelId: STORY_MUSIC_MODEL_ID,
          input: musicInput,
        });
        const prediction = await replicateClient.predictions.create(predictionRequest, {
          headers: {
            Prefer: "wait=60",
            "Cancel-After": "10m",
          },
        });
        if (!prediction) {
          return res.status(500).json({
            message: "No prediction returned from Replicate",
          });
        }

        if (prediction.status === "succeeded") {
          const { updatedScene, musicKey, musicUrl, trackItem } = await persistStorySceneMusic({
            bucket,
            userId,
            sessionId,
            sceneId,
            sceneItem,
            prediction,
            prompt,
            modelId: STORY_MUSIC_MODEL_ID,
            direction,
          });
          return res.json({
            sceneId,
            modelId: STORY_MUSIC_MODEL_ID,
            predictionId: prediction.id,
            status: "succeeded",
            prompt,
            direction,
            ...buildSceneMusicPayload(parseOptionalNumber, updatedScene, musicUrl),
            musicKey,
            track: trackItem
              ? await mapMusicTrackResponse(
                  normalizePromptFragment,
                  s3Client,
                  GetObjectCommand,
                  getSignedUrl,
                  bucket,
                  trackItem
                )
              : null,
          });
        }

        const updatedScene = {
          ...sceneItem,
          musicStatus: prediction.status || "starting",
          musicPredictionId: prediction.id || "",
          musicPrompt: prompt,
          musicModelId: STORY_MUSIC_MODEL_ID,
          musicMood: direction?.mood || sceneItem.musicMood || "",
          musicEnergy: direction?.energy || sceneItem.musicEnergy || "",
          musicTempoBpm: Number.isFinite(Number(direction?.tempoBpm))
            ? Math.round(Number(direction.tempoBpm))
            : sceneItem.musicTempoBpm || null,
          musicTags: Array.isArray(direction?.tags)
            ? direction.tags
            : Array.isArray(sceneItem.musicTags)
              ? sceneItem.musicTags
              : [],
          musicUpdatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await dynamoClient.send(
          new PutCommand({
            TableName: mediaTable,
            Item: updatedScene,
          })
        );
        const musicUrl = await signSceneMusicUrl(
          s3Client,
          GetObjectCommand,
          getSignedUrl,
          bucket,
          updatedScene
        );

        return res.json({
          sceneId,
          modelId: STORY_MUSIC_MODEL_ID,
          predictionId: prediction.id,
          status: prediction.status || "starting",
          prompt,
          direction,
          ...buildSceneMusicPayload(parseOptionalNumber, updatedScene, musicUrl),
        });
      } catch (error) {
        console.error("Story music start error:", {
          message: error?.message || String(error),
        });
        return res.status(500).json({
          message: "Failed to start scene music generation",
          error: error?.message || String(error),
        });
      }
    }
  );

  router.get(
    "/sessions/:id/scenes/:sceneId/music",
    deps.requireUserMiddleware,
    async (req, res) => {
      const userId = req.user?.sub;
      const sessionId = req.params.id;
      const sceneId = req.params.sceneId;
      const predictionId = req.query?.predictionId;
      const bucket = process.env.MEDIA_BUCKET;
      const apiToken = process.env.REPLICATE_API_TOKEN;

      if (!mediaTable) {
        return res.status(500).json({ message: "MEDIA_TABLE is not set" });
      }
      if (!bucket) {
        return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
      }
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!apiToken) {
        return res.status(500).json({ message: "REPLICATE_API_TOKEN must be set" });
      }
      if (!sessionId || !sceneId) {
        return res.status(400).json({ message: "sessionId and sceneId are required" });
      }

      try {
        const sessionItem = await getItem({
          pk: buildMediaPk(userId),
          sk: buildStorySessionSk(sessionId),
        });
        if (!sessionItem) {
          return res.status(404).json({ message: "Session not found" });
        }
        const sceneItem = await getItem({
          pk: buildMediaPk(userId),
          sk: buildStorySceneSk(sessionId, sceneId),
        });
        if (!sceneItem) {
          return res.status(404).json({ message: "Scene not found" });
        }
        const resolvedPredictionId = predictionId || sceneItem.musicPredictionId;
        if (!resolvedPredictionId) {
          const musicUrl = await signSceneMusicUrl(
            s3Client,
            GetObjectCommand,
            getSignedUrl,
            bucket,
            sceneItem
          );
          return res.json({
            sceneId,
            status: sceneItem.musicStatus || "",
            predictionId: "",
            prompt: sceneItem.musicPrompt || "",
            modelId: sceneItem.musicModelId || STORY_MUSIC_MODEL_ID,
            ...buildSceneMusicPayload(parseOptionalNumber, sceneItem, musicUrl),
          });
        }

        const prediction = await replicateClient.predictions.get(resolvedPredictionId);
        if (!prediction) {
          return res.status(500).json({
            message: "Prediction not found",
          });
        }

        if (prediction.status !== "succeeded") {
          const updatedScene = {
            ...sceneItem,
            musicStatus: prediction.status || sceneItem.musicStatus || "",
            musicPredictionId: resolvedPredictionId || sceneItem.musicPredictionId || "",
            musicUpdatedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await dynamoClient.send(
            new PutCommand({
              TableName: mediaTable,
              Item: updatedScene,
            })
          );
          const musicUrl = await signSceneMusicUrl(
            s3Client,
            GetObjectCommand,
            getSignedUrl,
            bucket,
            updatedScene
          );
          return res.json({
            sceneId,
            status: prediction.status || "",
            predictionId: resolvedPredictionId,
            prompt: sceneItem.musicPrompt || "",
            modelId: sceneItem.musicModelId || STORY_MUSIC_MODEL_ID,
            ...buildSceneMusicPayload(parseOptionalNumber, updatedScene, musicUrl),
          });
        }

        const direction = {
          mood: sceneItem.musicMood || "",
          energy: sceneItem.musicEnergy || "",
          tempoBpm: sceneItem.musicTempoBpm || null,
          tags: Array.isArray(sceneItem.musicTags) ? sceneItem.musicTags : [],
          source: "stored",
        };
        const { updatedScene, musicKey, musicUrl, trackItem } = await persistStorySceneMusic({
          bucket,
          userId,
          sessionId,
          sceneId,
          sceneItem,
          prediction,
          prompt: sceneItem.musicPrompt || DEFAULT_STORY_MUSIC_PROMPT,
          modelId: sceneItem.musicModelId || STORY_MUSIC_MODEL_ID,
          direction,
        });

        return res.json({
          sceneId,
          status: "succeeded",
          predictionId: resolvedPredictionId,
          prompt: updatedScene.musicPrompt || DEFAULT_STORY_MUSIC_PROMPT,
          modelId: updatedScene.musicModelId || STORY_MUSIC_MODEL_ID,
          ...buildSceneMusicPayload(parseOptionalNumber, updatedScene, musicUrl),
          musicKey,
          track: trackItem
            ? await mapMusicTrackResponse(
                normalizePromptFragment,
                s3Client,
                GetObjectCommand,
                getSignedUrl,
                bucket,
                trackItem
              )
            : null,
        });
      } catch (error) {
        console.error("Story music status error:", {
          message: error?.message || String(error),
        });
        return res.status(500).json({
          message: "Failed to get scene music status",
          error: error?.message || String(error),
        });
      }
    }
  );

  return router;
};
