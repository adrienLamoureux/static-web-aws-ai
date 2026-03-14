const { buildDirectorFallbackConfig } = require("../lib/director-config");
const {
  LORA_MODALITY_VIDEO,
  LORA_PROFILE_TYPE,
} = require("../config/lora");
const {
  buildLoraUnsupportedModelError,
  getLoraSupportedModelKeys,
  hasLoraInjectionSupport,
  normalizeString,
  applyCharacterProfileToReplicateInput,
} = require("../lib/lora-utils");

module.exports = (app, deps) => {
  const {
    ensureUserKey,
    replicateModelConfig,
    replicateVideoConfig,
    fetchS3ImageBuffer,
    fetchImageBuffer,
    replicateClient,
    getReplicateOutputUrl,
    buildVideoOutputKey,
    s3Client,
    PutObjectCommand,
    buildVideoPosterKeyFromVideoKey,
    copyS3Object,
    putMediaItem,
    getSignedUrl,
    GetObjectCommand,
    buildReplicatePredictionRequest,
    getItem,
    buildMediaPk,
    buildMediaSk,
  } = deps;

const videoLoraSupportedModels = getLoraSupportedModelKeys(replicateVideoConfig);

const buildVideoJobKey = (predictionId = "") =>
  `render/replicate/video/${predictionId || Date.now()}`;

const resolveModelDefault = (requestedModel, fallbackModel) => {
  const candidate = String(requestedModel || "").trim();
  if (!candidate) return fallbackModel;
  return candidate;
};

const hasBodyField = (body, key) =>
  Boolean(body && Object.prototype.hasOwnProperty.call(body, key));

const directorFallbackConfig = buildDirectorFallbackConfig({
  replicateModelConfig,
  replicateVideoConfig,
  defaultNegativePrompt: "",
});

app.post("/replicate/video/generate", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const userId = req.user?.sub;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const modelKey = resolveModelDefault(
    req.body?.model,
    directorFallbackConfig.video.videoModel
  );
  const inputKey = req.body?.inputKey;
  const imageUrl = req.body?.imageUrl;
  const prompt = req.body?.prompt?.trim();
  const characterId = normalizeString(req.body?.characterId);
  const generateAudio = hasBodyField(req.body, "generateAudio")
    ? req.body?.generateAudio
    : directorFallbackConfig.video.generateAudio;

  if (!mediaBucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET must be set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!apiToken) {
    return res
      .status(500)
      .json({ message: "REPLICATE_API_TOKEN must be set" });
  }
  if (!inputKey) {
    return res.status(400).json({ message: "inputKey is required" });
  }
  try {
    ensureUserKey(inputKey, userId);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  if (!prompt) {
    return res.status(400).json({ message: "prompt is required" });
  }

  const modelConfig = replicateVideoConfig[modelKey];
  if (!modelConfig) {
    return res.status(400).json({
      message: `Unsupported model selection: ${modelKey}`,
      allowed: Object.keys(replicateVideoConfig),
    });
  }
  if (modelConfig.requiresImage && !imageUrl && !inputKey) {
    return res.status(400).json({ message: "imageUrl or inputKey is required" });
  }
  let profileModality = {};
  if (characterId) {
    if (!hasLoraInjectionSupport(modelConfig)) {
      return res.status(400).json(
        buildLoraUnsupportedModelError({
          modality: LORA_MODALITY_VIDEO,
          modelKey,
          supportedModels: videoLoraSupportedModels,
        })
      );
    }
    const profileItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildMediaSk(LORA_PROFILE_TYPE, characterId),
    });
    if (!profileItem) {
      return res.status(400).json({
        message: `No LoRA profile found for characterId: ${characterId}`,
      });
    }
    profileModality = profileItem?.[LORA_MODALITY_VIDEO] || {};
    const profileModelKey = normalizeString(profileModality?.modelKey);
    if (profileModelKey && profileModelKey !== modelKey) {
      return res.status(400).json({
        message: `Character profile ${characterId} is configured for model ${profileModelKey}, not ${modelKey}`,
      });
    }
  }
  let resolvedImageUrl = imageUrl;
  if (modelConfig.requiresImage) {
    let hasInlineImage = false;
    if (inputKey) {
      try {
        const { buffer, contentType } = await fetchS3ImageBuffer(
          mediaBucket,
          inputKey
        );
        resolvedImageUrl = `data:${contentType};base64,${buffer.toString(
          "base64"
        )}`;
        hasInlineImage = true;
      } catch (error) {
        console.warn("Failed to inline S3 image for Replicate:", {
          message: error?.message || String(error),
          inputKey,
        });
      }
    }
    if (!hasInlineImage && imageUrl) {
      try {
        const { buffer, contentType } = await fetchImageBuffer(imageUrl);
        resolvedImageUrl = `data:${contentType};base64,${buffer.toString(
          "base64"
        )}`;
        hasInlineImage = true;
      } catch (error) {
        console.warn("Failed to inline image for Replicate:", {
          message: error?.message || String(error),
        });
      }
    }
    if (!hasInlineImage) {
      return res.status(400).json({ message: "imageUrl is required" });
    }
  }
  const promptWithProfile = applyCharacterProfileToReplicateInput({
    input: {},
    prompt,
    modelConfig,
    profileModality,
  }).prompt;
  const rawInput = modelConfig.buildInput({
    imageUrl: resolvedImageUrl,
    prompt: promptWithProfile,
    generateAudio,
  });
  const { input } = applyCharacterProfileToReplicateInput({
    input: rawInput,
    prompt: promptWithProfile,
    modelConfig,
    profileModality,
  });

  try {
    console.log("Replicate video generate invoke:", {
      modelId: modelConfig.modelId,
      inputKey,
    });
    const predictionRequest = buildReplicatePredictionRequest({
      modelId: modelConfig.modelId,
      input,
    });
    const prediction = await replicateClient.predictions.create(
      predictionRequest,
      {
        headers: {
          Prefer: "wait=60",
          "Cancel-After": "15m",
        },
      }
    );
    if (!prediction) {
      return res.status(500).json({
        message: "No prediction returned from Replicate",
      });
    }
    const jobKey = buildVideoJobKey(prediction.id);

    if (prediction.status === "succeeded") {
      const outputUrl = getReplicateOutputUrl(prediction.output);
      if (!outputUrl) {
        return res.status(500).json({
          message: "No video returned from Replicate",
          response: prediction,
        });
      }
      const { buffer, contentType } = await fetchImageBuffer(outputUrl);
      const outputKey = buildVideoOutputKey(inputKey, "videos/");
      await s3Client.send(
        new PutObjectCommand({
          Bucket: mediaBucket,
          Key: outputKey,
          Body: buffer,
          ContentType: contentType || "video/mp4",
        })
      );
      const posterKey = buildVideoPosterKeyFromVideoKey(outputKey);
      if (posterKey) {
        try {
          await copyS3Object({
            bucket: mediaBucket,
            sourceKey: inputKey,
            destinationKey: posterKey,
          });
        } catch (error) {
          console.warn("Failed to create video poster:", {
            message: error?.message || String(error),
            posterKey,
          });
        }
      }
      await putMediaItem({
        userId,
        type: "VID",
        key: outputKey,
        extra: { posterKey: posterKey || "" },
      });
      await putMediaItem({
        userId,
        type: "JOB",
        key: jobKey,
        extra: {
          provider: "replicate",
          entityType: "video",
          predictionId: prediction.id,
          inputKey,
          characterId,
          status: "completed",
          progressPct: 100,
          etaSeconds: 0,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      return res.json({
        modelId: modelConfig.modelId,
        provider: "replicate",
        outputKey,
        outputUrl,
        predictionId: prediction.id,
        status: prediction.status,
        characterId,
      });
    }
    await putMediaItem({
      userId,
      type: "JOB",
      key: jobKey,
      extra: {
        provider: "replicate",
        entityType: "video",
        predictionId: prediction.id,
        inputKey,
        characterId,
        status: prediction.status,
        progressPct: prediction.status === "starting" ? 24 : 52,
        etaSeconds: 90,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    res.json({
      modelId: modelConfig.modelId,
      provider: "replicate",
      predictionId: prediction.id,
      status: prediction.status,
      characterId,
    });
  } catch (error) {
    console.error("Replicate video generation error details:", {
      name: error?.name,
      message: error?.message,
      metadata: error?.$metadata,
      cause: error?.cause,
    });
    res.status(500).json({
      message: "Replicate video generation failed",
      error: error?.message || String(error),
    });
  }
});

app.get("/replicate/video/status", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const userId = req.user?.sub;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const predictionId = req.query?.predictionId;
  const inputKey = req.query?.inputKey;
  const characterId = normalizeString(req.query?.characterId);

  if (!mediaBucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET must be set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!apiToken) {
    return res
      .status(500)
      .json({ message: "REPLICATE_API_TOKEN must be set" });
  }
  if (!predictionId) {
    return res.status(400).json({ message: "predictionId is required" });
  }
  if (!inputKey) {
    return res.status(400).json({ message: "inputKey is required" });
  }
  try {
    ensureUserKey(inputKey, userId);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  try {
    const prediction = await replicateClient.predictions.get(predictionId);
    if (!prediction) {
      return res.status(500).json({
        message: "Prediction not found",
      });
    }
    if (prediction.status !== "succeeded") {
      await putMediaItem({
        userId,
        type: "JOB",
        key: buildVideoJobKey(predictionId),
        extra: {
          provider: "replicate",
          entityType: "video",
          predictionId,
          inputKey,
          characterId,
          status: prediction.status,
          progressPct: prediction.status === "starting" ? 30 : 68,
          etaSeconds: 55,
          updatedAt: new Date().toISOString(),
        },
      });
      return res.json({
        predictionId,
        status: prediction.status,
        characterId,
      });
    }
    const outputUrl = getReplicateOutputUrl(prediction.output);
    if (!outputUrl) {
      return res.status(500).json({
        message: "No video returned from Replicate",
        response: prediction,
      });
    }
    const { buffer, contentType } = await fetchImageBuffer(outputUrl);
    const outputKey = buildVideoOutputKey(inputKey, "videos/");
    await s3Client.send(
      new PutObjectCommand({
        Bucket: mediaBucket,
        Key: outputKey,
        Body: buffer,
        ContentType: contentType || "video/mp4",
      })
    );
    const posterKey = buildVideoPosterKeyFromVideoKey(outputKey);
    if (posterKey) {
      try {
        await copyS3Object({
          bucket: mediaBucket,
          sourceKey: inputKey,
          destinationKey: posterKey,
        });
      } catch (error) {
        console.warn("Failed to create video poster:", {
          message: error?.message || String(error),
          posterKey,
        });
      }
    }
    await putMediaItem({
      userId,
      type: "VID",
      key: outputKey,
      extra: { posterKey: posterKey || "" },
    });
    await putMediaItem({
      userId,
      type: "JOB",
      key: buildVideoJobKey(predictionId),
      extra: {
        provider: "replicate",
        entityType: "video",
        predictionId,
        inputKey,
        characterId,
        status: "completed",
        progressPct: 100,
        etaSeconds: 0,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: mediaBucket,
        Key: outputKey,
      }),
      { expiresIn: 900 }
    );

    res.json({
      predictionId,
      status: prediction.status,
      outputKey,
      outputUrl: signedUrl,
      characterId,
    });
  } catch (error) {
    try {
      await putMediaItem({
        userId,
        type: "JOB",
        key: buildVideoJobKey(predictionId),
        extra: {
          provider: "replicate",
          entityType: "video",
          predictionId,
          inputKey,
          characterId,
          status: "failed",
          progressPct: 100,
          etaSeconds: 0,
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          errorMessage: error?.message || String(error),
        },
      });
    } catch (_ignored) {}
    console.error("Replicate video status error details:", {
      name: error?.name,
      message: error?.message,
      metadata: error?.$metadata,
      cause: error?.cause,
    });
    res.status(500).json({
      message: "Failed to get Replicate prediction status",
      error: error?.message || String(error),
    });
  }
});

};
