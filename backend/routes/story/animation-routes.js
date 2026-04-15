const { Router } = require("express");
const {
  STORY_ANIMATION_MODEL_KEY,
  DEFAULT_STORY_ANIMATION_PROMPT,
  signSceneVideoUrl,
  buildStorySceneVideoKey,
  buildDataUrl,
} = require("./illustration-helpers");
const { getFlags } = require("../../lib/feature-flags");

module.exports = function registerStoryAnimationRoutes(deps) {
  const {
    mediaTable,
    getItem,
    buildMediaPk,
    buildStorySessionSk,
    buildStorySceneSk,
    dynamoClient,
    PutCommand,
    getSignedUrl,
    s3Client,
    GetObjectCommand,
    PutObjectCommand,
    replicateVideoConfig,
    replicateClient,
    buildReplicatePredictionRequest,
    getReplicateOutputUrl,
    fetchImageBuffer,
    fetchS3ImageBuffer,
    buildUserPrefix,
  } = deps;

  const persistStorySceneVideo = async ({
    bucket,
    userId,
    sessionId,
    sceneId,
    sceneItem,
    prediction,
    prompt,
  }) => {
    const outputUrl = getReplicateOutputUrl(prediction?.output);
    if (!outputUrl) {
      throw new Error("No video returned from Replicate");
    }
    const { buffer, contentType } = await fetchImageBuffer(outputUrl);
    const videoKey = buildStorySceneVideoKey(buildUserPrefix, userId, sessionId, sceneId);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: videoKey,
        Body: buffer,
        ContentType: contentType || "video/mp4",
      })
    );
    const updatedScene = {
      ...sceneItem,
      videoKey,
      videoStatus: "succeeded",
      videoPredictionId: prediction?.id || sceneItem.videoPredictionId || "",
      videoPrompt: prompt || sceneItem.videoPrompt || "",
      videoUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: updatedScene,
      })
    );
    const videoUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: videoKey,
      }),
      { expiresIn: 900 }
    );
    return { updatedScene, videoKey, videoUrl };
  };

  const router = Router();

  router.post(
    "/sessions/:id/scenes/:sceneId/animation",
    deps.requireUserMiddleware,
    async (req, res) => {
      const { enableStoryAnimations } = await getFlags(deps);
      if (!enableStoryAnimations) {
        return res.status(503).json({ error: "Feature disabled" });
      }

      const userId = req.user?.sub;
      const sessionId = req.params.id;
      const sceneId = req.params.sceneId;
      const bucket = process.env.MEDIA_BUCKET;
      const apiToken = process.env.REPLICATE_API_TOKEN;
      const prompt = req.body?.prompt?.trim() || DEFAULT_STORY_ANIMATION_PROMPT;

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

      const videoModelConfig = replicateVideoConfig[STORY_ANIMATION_MODEL_KEY];
      if (!videoModelConfig?.modelId) {
        return res.status(500).json({
          message: `Replicate modelId is not configured for ${STORY_ANIMATION_MODEL_KEY}`,
        });
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
        if (!sceneItem.imageKey) {
          return res.status(400).json({
            message: "Scene illustration is required before animation",
          });
        }

        const sourceImage = await fetchS3ImageBuffer(bucket, sceneItem.imageKey);
        const predictionRequest = buildReplicatePredictionRequest({
          modelId: videoModelConfig.modelId,
          input: videoModelConfig.buildInput({
            imageUrl: buildDataUrl(sourceImage),
            prompt,
          }),
        });
        const prediction = await replicateClient.predictions.create(predictionRequest, {
          headers: {
            Prefer: "wait=60",
            "Cancel-After": "15m",
          },
        });
        if (!prediction) {
          return res.status(500).json({
            message: "No prediction returned from Replicate",
          });
        }

        if (prediction.status === "succeeded") {
          const { videoKey, videoUrl } = await persistStorySceneVideo({
            bucket,
            userId,
            sessionId,
            sceneId,
            sceneItem,
            prediction,
            prompt,
          });
          return res.json({
            sceneId,
            modelId: videoModelConfig.modelId,
            predictionId: prediction.id,
            status: "succeeded",
            prompt,
            videoKey,
            videoUrl,
          });
        }

        const updatedScene = {
          ...sceneItem,
          videoKey: "",
          videoStatus: prediction.status || "starting",
          videoPredictionId: prediction.id || "",
          videoPrompt: prompt,
          videoUpdatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await dynamoClient.send(
          new PutCommand({
            TableName: mediaTable,
            Item: updatedScene,
          })
        );

        return res.json({
          sceneId,
          modelId: videoModelConfig.modelId,
          predictionId: prediction.id,
          status: prediction.status || "starting",
          prompt,
        });
      } catch (error) {
        console.error("Story animation start error:", {
          message: error?.message || String(error),
        });
        return res.status(500).json({
          message: "Failed to start scene animation",
          error: error?.message || String(error),
        });
      }
    }
  );

  router.get(
    "/sessions/:id/scenes/:sceneId/animation",
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
        const resolvedPredictionId = predictionId || sceneItem.videoPredictionId;
        if (!resolvedPredictionId) {
          const existingVideoUrl = await signSceneVideoUrl(
            s3Client,
            GetObjectCommand,
            getSignedUrl,
            bucket,
            sceneItem
          );
          return res.json({
            sceneId,
            status: sceneItem.videoStatus || "",
            predictionId: "",
            prompt: sceneItem.videoPrompt || "",
            videoKey: sceneItem.videoKey || "",
            videoUrl: existingVideoUrl,
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
            videoStatus: prediction.status || sceneItem.videoStatus || "",
            videoPredictionId: resolvedPredictionId || sceneItem.videoPredictionId || "",
            videoUpdatedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await dynamoClient.send(
            new PutCommand({
              TableName: mediaTable,
              Item: updatedScene,
            })
          );
          return res.json({
            sceneId,
            status: prediction.status || "",
            predictionId: resolvedPredictionId,
            prompt: sceneItem.videoPrompt || "",
            videoKey: sceneItem.videoKey || "",
            videoUrl: "",
          });
        }

        const { videoKey, videoUrl } = await persistStorySceneVideo({
          bucket,
          userId,
          sessionId,
          sceneId,
          sceneItem,
          prediction,
          prompt: sceneItem.videoPrompt || DEFAULT_STORY_ANIMATION_PROMPT,
        });

        return res.json({
          sceneId,
          status: "succeeded",
          predictionId: resolvedPredictionId,
          prompt: sceneItem.videoPrompt || DEFAULT_STORY_ANIMATION_PROMPT,
          videoKey,
          videoUrl,
        });
      } catch (error) {
        console.error("Story animation status error:", {
          message: error?.message || String(error),
        });
        return res.status(500).json({
          message: "Failed to get scene animation status",
          error: error?.message || String(error),
        });
      }
    }
  );

  return router;
};
