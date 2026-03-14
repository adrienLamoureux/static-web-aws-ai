const { createCivitaiClient } = require("../lib/civitai-client");
const {
  LORA_MODALITY_IMAGE,
  LORA_PROFILE_TYPE,
  LORA_STRENGTH_DEFAULT,
} = require("../config/lora");
const {
  applyCharacterProfileToReplicateInput,
  buildLoraUnsupportedModelError,
  getLoraSupportedModelKeys,
  hasConfiguredLoraSupport,
  normalizeString,
} = require("../lib/lora-utils");

const CIVITAI_FAILED_EVENTS = new Set([
  "failed",
  "rejected",
  "laterejected",
  "claimexpired",
  "expired",
  "deleted",
]);

const parseOptionalInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};

const buildImageJobKey = (token = "") =>
  `render/civitai/image/${token || Date.now()}`;

const parseCatalogId = (catalogId = "") => {
  const normalized = normalizeString(catalogId);
  const [provider, modelId, versionId] = normalized.split(":");
  if (
    normalizeString(provider).toLowerCase() !== "civitai" ||
    !normalizeString(modelId) ||
    !normalizeString(versionId)
  ) {
    return null;
  }
  return {
    modelId: normalizeString(modelId),
    versionId: normalizeString(versionId),
  };
};

const resolveAdditionalNetworks = ({
  profileModality = {},
  modelConfig = {},
}) => {
  const modelFamily =
    normalizeString(modelConfig?.loraAirModelFamily).toLowerCase() || "sd1";
  const loras = Array.isArray(profileModality?.loras)
    ? profileModality.loras
    : [];
  const additionalNetworks = {};
  loras.forEach((item) => {
    const parsedCatalog = parseCatalogId(item?.catalogId);
    if (!parsedCatalog) return;
    const strengthInput = Number(item?.strength);
    const strength = Number.isFinite(strengthInput)
      ? strengthInput
      : LORA_STRENGTH_DEFAULT;
    const air = `urn:air:${modelFamily}:lora:civitai:${parsedCatalog.modelId}@${parsedCatalog.versionId}`;
    additionalNetworks[air] = {
      strength,
    };
  });
  return additionalNetworks;
};

const resolveOutputUrls = (jobs = []) =>
  jobs
    .map((item) =>
      normalizeString(
        item?.result?.blobUrl || item?.result?.url || item?.result?.imageUrl
      )
    )
    .filter(Boolean);

const resolveJobErrorMessage = (jobs = []) => {
  const failedItem = jobs.find((item) =>
    CIVITAI_FAILED_EVENTS.has(
      normalizeString(item?.lastEvent?.type).toLowerCase()
    )
  );
  if (!failedItem) return "CivitAI image generation failed.";
  const contextMessage =
    normalizeString(failedItem?.lastEvent?.context?.message) ||
    normalizeString(failedItem?.lastEvent?.context?.error);
  return (
    contextMessage ||
    normalizeString(failedItem?.error?.message) ||
    `CivitAI job ${normalizeString(failedItem?.jobId)} failed.`
  );
};

const resolveCost = (jobs = []) => {
  const total = jobs.reduce((acc, item) => {
    const cost = Number(item?.cost);
    return Number.isFinite(cost) ? acc + cost : acc;
  }, 0);
  return total > 0 ? total : null;
};

module.exports = (app, deps) => {
  const {
    civitaiModelConfig = {},
    buildImageBatchId,
    clampPromptTokens,
    MAX_REPLICATE_PROMPT_TOKENS,
    fetchImageBuffer,
    buildImageKey,
    s3Client,
    PutObjectCommand,
    putMediaItem,
    getSignedUrl,
    GetObjectCommand,
    getItem,
    buildMediaPk,
    buildMediaSk,
  } = deps;

  const civitaiModelKeys = Object.keys(civitaiModelConfig || {});
  const defaultModelKey = civitaiModelKeys[0] || "";
  const imageLoraSupportedModels = getLoraSupportedModelKeys(civitaiModelConfig);

  app.post("/civitai/image/generate", async (req, res) => {
    const mediaBucket = process.env.MEDIA_BUCKET;
    const userId = req.user?.sub;
    const apiToken = process.env.CIVITAI_API_TOKEN;
    const modelKey = normalizeString(req.body?.model) || defaultModelKey;
    const imageName = normalizeString(req.body?.imageName);
    const prompt = normalizeString(req.body?.prompt);
    const negativePrompt = normalizeString(req.body?.negativePrompt);
    const width = parseOptionalInteger(req.body?.width, 1024);
    const height = parseOptionalInteger(req.body?.height, 1024);
    const requestedImages = Number(req.body?.numImages) || 1;
    const numImages = Math.min(Math.max(requestedImages, 1), 4);
    const seed = req.body?.seed;
    const characterId = normalizeString(req.body?.characterId);
    const batchId = buildImageBatchId();

    if (!mediaBucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET must be set" });
    }
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!apiToken) {
      return res.status(500).json({ message: "CIVITAI_API_TOKEN must be set" });
    }
    if (!modelKey) {
      return res.status(500).json({ message: "No CivitAI model is configured" });
    }
    if (!imageName) {
      return res.status(400).json({ message: "imageName is required" });
    }
    if (!prompt) {
      return res.status(400).json({ message: "prompt is required" });
    }

    const modelConfig = civitaiModelConfig[modelKey];
    if (!modelConfig) {
      return res.status(400).json({
        message: `Unsupported CivitAI model selection: ${modelKey}`,
        allowed: civitaiModelKeys,
      });
    }
    const sizeAllowed = Array.isArray(modelConfig.sizes)
      ? modelConfig.sizes.some((size) => size.width === width && size.height === height)
      : false;
    if (!sizeAllowed) {
      return res.status(400).json({
        message: `Unsupported size for ${modelKey}`,
        allowedSizes: modelConfig.sizes || [],
      });
    }

    let profileModality = {};
    if (characterId) {
      if (!hasConfiguredLoraSupport(modelConfig)) {
        return res.status(400).json(
          buildLoraUnsupportedModelError({
            modality: LORA_MODALITY_IMAGE,
            modelKey,
            supportedModels: imageLoraSupportedModels,
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
      profileModality = profileItem?.[LORA_MODALITY_IMAGE] || {};
      const profileModelKey = normalizeString(profileModality?.modelKey);
      if (profileModelKey && profileModelKey !== modelKey) {
        return res.status(400).json({
          message: `Character profile ${characterId} is configured for model ${profileModelKey}, not ${modelKey}`,
        });
      }
    }

    try {
      const promptWithProfile = applyCharacterProfileToReplicateInput({
        input: {},
        prompt: clampPromptTokens(prompt),
        modelConfig,
        profileModality,
      }).prompt;
      const finalPrompt = clampPromptTokens(promptWithProfile);
      const finalNegativePrompt = negativePrompt
        ? clampPromptTokens(negativePrompt)
        : "";

      const civitaiClient = createCivitaiClient({
        apiToken,
      });
      const response = await civitaiClient.createImageJobs({
        modelId: modelConfig.modelId,
        baseModel: modelConfig.baseModel,
        params: modelConfig.buildInput({
          prompt: finalPrompt,
          negativePrompt: finalNegativePrompt,
          width,
          height,
          seed,
        }),
        quantity: numImages,
        additionalNetworks: resolveAdditionalNetworks({
          profileModality,
          modelConfig,
        }),
        wait: false,
        detailed: true,
        charge: true,
      });

      const token = normalizeString(response?.token);
      const jobs = Array.isArray(response?.jobs) ? response.jobs : [];
      const jobIds = jobs
        .map((item) => normalizeString(item?.jobId))
        .filter(Boolean);

      if (!token) {
        return res.status(500).json({
          message: "No token returned from CivitAI",
        });
      }

      await putMediaItem({
        userId,
        type: "JOB",
        key: buildImageJobKey(token),
        extra: {
          provider: "civitai",
          entityType: "image",
          token,
          modelKey,
          imageName,
          batchId,
          characterId,
          status: "starting",
          progressPct: 15,
          etaSeconds: 75,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      return res.json({
        provider: "civitai",
        token,
        jobIds,
        batchId,
        status: "starting",
        notice: `CivitAI is generating the image. Prompt limit: ${MAX_REPLICATE_PROMPT_TOKENS} tokens.`,
      });
    } catch (error) {
      return res.status(500).json({
        message: "CivitAI image generation failed",
        error: error?.message || String(error),
      });
    }
  });

  app.get("/civitai/image/status", async (req, res) => {
    const mediaBucket = process.env.MEDIA_BUCKET;
    const userId = req.user?.sub;
    const apiToken = process.env.CIVITAI_API_TOKEN;
    const token = normalizeString(req.query?.token);
    const imageName = normalizeString(req.query?.imageName);
    const batchId = normalizeString(req.query?.batchId);
    const prompt = normalizeString(req.query?.prompt);
    const negativePrompt = normalizeString(req.query?.negativePrompt);
    const characterId = normalizeString(req.query?.characterId);

    if (!mediaBucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET must be set" });
    }
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!apiToken) {
      return res.status(500).json({ message: "CIVITAI_API_TOKEN must be set" });
    }
    if (!token) {
      return res.status(400).json({ message: "token is required" });
    }
    if (!imageName) {
      return res.status(400).json({ message: "imageName is required" });
    }
    if (!batchId) {
      return res.status(400).json({ message: "batchId is required" });
    }

    try {
      const civitaiClient = createCivitaiClient({
        apiToken,
      });
      const response = await civitaiClient.getImageJobs({
        token,
        wait: false,
        detailed: true,
      });
      const jobs = Array.isArray(response?.jobs) ? response.jobs : [];
      const outputUrls = resolveOutputUrls(jobs);
      const hasFailedJobs = jobs.some((item) =>
        CIVITAI_FAILED_EVENTS.has(
          normalizeString(item?.lastEvent?.type).toLowerCase()
        )
      );
      const totalCost = resolveCost(jobs);

      if (hasFailedJobs) {
        const errorMessage = resolveJobErrorMessage(jobs);
        await putMediaItem({
          userId,
          type: "JOB",
          key: buildImageJobKey(token),
          extra: {
            provider: "civitai",
            entityType: "image",
            token,
            imageName,
            batchId,
            characterId,
            status: "failed",
            progressPct: 100,
            etaSeconds: 0,
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            errorMessage,
            estimatedCostUsd: totalCost,
          },
        });
        return res.json({
          provider: "civitai",
          token,
          status: "failed",
          error: errorMessage,
        });
      }

      if (!outputUrls.length) {
        await putMediaItem({
          userId,
          type: "JOB",
          key: buildImageJobKey(token),
          extra: {
            provider: "civitai",
            entityType: "image",
            token,
            imageName,
            batchId,
            characterId,
            status: "processing",
            progressPct: 58,
            etaSeconds: 35,
            updatedAt: new Date().toISOString(),
            estimatedCostUsd: totalCost,
          },
        });
        return res.json({
          provider: "civitai",
          token,
          status: "processing",
        });
      }

      const images = await Promise.all(
        outputUrls.map(async (url, index) => {
          const { buffer, contentType } = await fetchImageBuffer(url);
          const key = buildImageKey({
            userId,
            provider: "civitai",
            index,
            baseName: imageName,
            batchId,
          });
          await s3Client.send(
            new PutObjectCommand({
              Bucket: mediaBucket,
              Key: key,
              Body: buffer,
              ContentType: contentType,
            })
          );
          await putMediaItem({
            userId,
            type: "IMG",
            key,
            extra: {
              provider: "civitai",
              model: "civitai",
              ...(prompt ? { prompt } : {}),
              ...(negativePrompt ? { negativePrompt } : {}),
              ...(characterId ? { characterId } : {}),
              ...(totalCost !== null ? { estimatedCostUsd: totalCost } : {}),
            },
          });
          const signedUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({
              Bucket: mediaBucket,
              Key: key,
            }),
            { expiresIn: 900 }
          );
          return { key, url: signedUrl };
        })
      );

      await putMediaItem({
        userId,
        type: "JOB",
        key: buildImageJobKey(token),
        extra: {
          provider: "civitai",
          entityType: "image",
          token,
          imageName,
          batchId,
          characterId,
          status: "completed",
          progressPct: 100,
          etaSeconds: 0,
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          estimatedCostUsd: totalCost,
        },
      });

      return res.json({
        provider: "civitai",
        token,
        status: "succeeded",
        batchId,
        images,
        ...(totalCost !== null ? { estimatedCostUsd: totalCost } : {}),
      });
    } catch (error) {
      await putMediaItem({
        userId,
        type: "JOB",
        key: buildImageJobKey(token),
        extra: {
          provider: "civitai",
          entityType: "image",
          token,
          imageName,
          batchId,
          characterId,
          status: "failed",
          progressPct: 100,
          etaSeconds: 0,
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          errorMessage: error?.message || String(error),
        },
      }).catch(() => {});
      return res.status(500).json({
        message: "Failed to get CivitAI image status",
        error: error?.message || String(error),
      });
    }
  });
};
