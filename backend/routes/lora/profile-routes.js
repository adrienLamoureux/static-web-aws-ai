const { randomUUID } = require("crypto");
const { Router } = require("express");
const {
  DEFAULT_CHARACTER_PROFILE_SEARCH_LIMIT,
  LORA_CATALOG_TYPE,
  LORA_PROFILE_TYPE,
  LORA_MODALITY_IMAGE,
  LORA_MODALITY_VIDEO,
  LORA_PROFILE_MAX_ITEMS_PER_MODALITY,
} = require("../../config/lora");
const {
  clampInteger,
  hasLoraInjectionSupport,
  getLoraSupportedModelKeys,
  buildLoraUnsupportedModelError,
  normalizeString,
  normalizeStringArray,
  parseBooleanLike,
  normalizeLoraProfileModality,
  mergeCatalogMetadataIntoProfile,
} = require("../../lib/lora-utils");

module.exports = function registerLoraProfileRoutes(deps) {
  const {
    buildMediaPk,
    buildMediaSk,
    queryBySkPrefix,
    putMediaItem,
    deleteMediaItem,
    getItem,
    replicateModelConfig,
    replicateVideoConfig,
  } = deps;

  const imageLoraSupportedModels = getLoraSupportedModelKeys(replicateModelConfig);
  const videoLoraSupportedModels = getLoraSupportedModelKeys(replicateVideoConfig);

  const getUnsupportedModelPayload = ({ modality, modelKey }) => {
    const resolvedModelKey = normalizeString(modelKey);
    if (!resolvedModelKey) return null;
    const isImageModality = modality === LORA_MODALITY_IMAGE;
    const modelConfigByKey = isImageModality
      ? replicateModelConfig || {}
      : replicateVideoConfig || {};
    const supportedModels = isImageModality ? imageLoraSupportedModels : videoLoraSupportedModels;
    const modelConfig = modelConfigByKey[resolvedModelKey] || {};
    if (hasLoraInjectionSupport(modelConfig)) {
      return null;
    }
    return buildLoraUnsupportedModelError({
      modality,
      modelKey: resolvedModelKey,
      supportedModels,
    });
  };

  const parseLimit = (
    value,
    fallback = DEFAULT_CHARACTER_PROFILE_SEARCH_LIMIT,
    max = DEFAULT_CHARACTER_PROFILE_SEARCH_LIMIT
  ) => clampInteger(value, fallback, 1, max);

  const normalizeLoraItems = (loras) =>
    Array.isArray(loras)
      ? loras.map((loraItem) => ({
          catalogId: normalizeString(loraItem.catalogId),
          name: normalizeString(loraItem.name),
          downloadUrl: normalizeString(loraItem.downloadUrl),
          strength: Number(loraItem.strength) || 0,
          triggerWords: normalizeStringArray(loraItem.triggerWords),
        }))
      : [];

  const normalizeProfileResponseItem = (item = {}) => {
    // id is the profile's own UUID (or legacy characterId for old records)
    const id = normalizeString(item.id || item.key || item.characterId);
    // characterId is the linked character (may equal id for legacy records)
    const characterId = normalizeString(item.characterId || item.key);
    const imageModelKey = normalizeString(item?.image?.modelKey || item.imageModel);
    const imagePromptPrefix = normalizeString(item?.image?.promptPrefix || item.imagePrompt);
    const videoModelKey = normalizeString(item?.video?.modelKey || item.videoModel);
    const videoPromptPrefix = normalizeString(item?.video?.promptPrefix || item.videoPrompt);
    return {
      id,
      characterId,
      name: normalizeString(item.name || item.displayName),
      displayName: normalizeString(item.displayName || item.name),
      // Top-level convenience fields (mirrors image/video.modelKey/promptPrefix)
      imageModel: imageModelKey,
      imagePrompt: imagePromptPrefix,
      videoModel: videoModelKey,
      videoPrompt: videoPromptPrefix,
      image: {
        modelKey: imageModelKey,
        promptPrefix: imagePromptPrefix,
        loras: normalizeLoraItems(item?.image?.loras),
      },
      video: {
        modelKey: videoModelKey,
        promptPrefix: videoPromptPrefix,
        loras: normalizeLoraItems(item?.video?.loras),
      },
      updatedAt: normalizeString(item.updatedAt),
      createdAt: normalizeString(item.createdAt),
    };
  };

  const listUserItemsByType = async ({ userId, type, limit }) =>
    queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: `${type}#`,
      limit,
      scanForward: false,
    });

  const fetchCatalogByIds = async ({ userId, catalogIds = [] }) => {
    const uniqueIds = Array.from(
      new Set(catalogIds.map((item) => normalizeString(item)).filter(Boolean))
    );
    const catalogEntries = await Promise.all(
      uniqueIds.map(async (catalogId) => {
        const item = await getItem({
          pk: buildMediaPk(userId),
          sk: buildMediaSk(LORA_CATALOG_TYPE, catalogId),
        });
        return [catalogId, item];
      })
    );
    return new Map(catalogEntries.filter(([, item]) => Boolean(item)));
  };

  const router = Router();

  router.get("/lora/profiles", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const limit = parseLimit(
      req.query?.limit,
      DEFAULT_CHARACTER_PROFILE_SEARCH_LIMIT,
      DEFAULT_CHARACTER_PROFILE_SEARCH_LIMIT
    );
    const filterCharacterId = normalizeString(
      req.query?.characterId || req.query?.character_id || ""
    );

    try {
      const rawItems = await listUserItemsByType({
        userId,
        type: LORA_PROFILE_TYPE,
        limit: DEFAULT_CHARACTER_PROFILE_SEARCH_LIMIT,
      });
      const normalized = rawItems.map((item) => normalizeProfileResponseItem(item));
      // Filter by characterId if requested
      const items = filterCharacterId
        ? normalized.filter((p) => p.characterId === filterCharacterId)
        : normalized;
      return res.json({
        total: items.length,
        items: items.slice(0, limit),
      });
    } catch (error) {
      console.error("LoRA profile list error:", {
        message: error?.message || String(error),
      });
      return res.status(500).json({
        message: "Failed to load LoRA profiles",
        error: error?.message || String(error),
      });
    }
  });

  // POST /lora/profiles — create a new LoRA profile (UUID id, linked to a character)
  router.post("/lora/profiles", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const characterId = normalizeString(req.body?.characterId || "");
    const name = normalizeString(req.body?.name || req.body?.displayName || "");
    if (!characterId) {
      return res.status(400).json({ message: "characterId is required" });
    }
    if (!name) {
      return res.status(400).json({ message: "name is required" });
    }

    const profileId = randomUUID();
    // Use same modality normalization as PUT
    const normalizedImageProfile = normalizeLoraProfileModality({
      modalityConfig: req.body?.[LORA_MODALITY_IMAGE] || {},
      maxItems: LORA_PROFILE_MAX_ITEMS_PER_MODALITY,
    });
    const normalizedVideoProfile = normalizeLoraProfileModality({
      modalityConfig: req.body?.[LORA_MODALITY_VIDEO] || {},
      maxItems: LORA_PROFILE_MAX_ITEMS_PER_MODALITY,
    });

    const unsupportedImage = getUnsupportedModelPayload({
      modality: LORA_MODALITY_IMAGE,
      modelKey: normalizedImageProfile.modelKey,
    });
    if (unsupportedImage) return res.status(400).json(unsupportedImage);
    const unsupportedVideo = getUnsupportedModelPayload({
      modality: LORA_MODALITY_VIDEO,
      modelKey: normalizedVideoProfile.modelKey,
    });
    if (unsupportedVideo) return res.status(400).json(unsupportedVideo);

    const requestedCatalogIds = [
      ...normalizedImageProfile.loras.map((i) => i.catalogId),
      ...normalizedVideoProfile.loras.map((i) => i.catalogId),
    ].filter(Boolean);

    try {
      const catalogById = await fetchCatalogByIds({ userId, catalogIds: requestedCatalogIds });
      const missingIds = requestedCatalogIds.filter((id) => id && !catalogById.has(id));
      if (missingIds.length > 0) {
        return res.status(400).json({
          message: "Some catalog entries are missing. Sync catalog first.",
          missingCatalogIds: missingIds,
        });
      }

      const imageProfile = {
        ...normalizedImageProfile,
        loras: mergeCatalogMetadataIntoProfile({
          profileLoras: normalizedImageProfile.loras,
          catalogById,
        }),
      };
      const videoProfile = {
        ...normalizedVideoProfile,
        loras: mergeCatalogMetadataIntoProfile({
          profileLoras: normalizedVideoProfile.loras,
          catalogById,
        }),
      };

      const now = new Date().toISOString();
      await putMediaItem({
        userId,
        type: LORA_PROFILE_TYPE,
        key: profileId,
        extra: {
          id: profileId,
          characterId,
          name,
          displayName: name,
          imageModel: imageProfile.modelKey,
          imagePrompt: imageProfile.promptPrefix,
          videoModel: videoProfile.modelKey,
          videoPrompt: videoProfile.promptPrefix,
          image: imageProfile,
          video: videoProfile,
          createdAt: now,
          updatedAt: now,
        },
      });

      return res.status(201).json({
        profile: normalizeProfileResponseItem({
          id: profileId,
          characterId,
          name,
          displayName: name,
          imageModel: imageProfile.modelKey,
          imagePrompt: imageProfile.promptPrefix,
          videoModel: videoProfile.modelKey,
          videoPrompt: videoProfile.promptPrefix,
          image: imageProfile,
          video: videoProfile,
          createdAt: now,
          updatedAt: now,
        }),
      });
    } catch (error) {
      console.error("LoRA profile create error:", { message: error?.message || String(error) });
      return res
        .status(500)
        .json({ message: "Failed to create LoRA profile", error: error?.message || String(error) });
    }
  });

  router.get("/lora/profiles/:characterId", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const characterId = normalizeString(req.params?.characterId);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!characterId) {
      return res.status(400).json({ message: "characterId is required" });
    }

    try {
      const item = await getItem({
        pk: buildMediaPk(userId),
        sk: buildMediaSk(LORA_PROFILE_TYPE, characterId),
      });
      if (!item) {
        return res.status(404).json({ message: "LoRA character profile not found" });
      }
      return res.json({
        profile: normalizeProfileResponseItem(item),
      });
    } catch (error) {
      console.error("LoRA profile get error:", {
        message: error?.message || String(error),
      });
      return res.status(500).json({
        message: "Failed to load LoRA character profile",
        error: error?.message || String(error),
      });
    }
  });

  // DELETE /lora/profiles/:profileId
  router.delete("/lora/profiles/:profileId", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const profileId = normalizeString(req.params?.profileId);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!profileId) return res.status(400).json({ message: "profileId is required" });

    try {
      const existing = await getItem({
        pk: buildMediaPk(userId),
        sk: buildMediaSk(LORA_PROFILE_TYPE, profileId),
      });
      if (!existing) {
        return res.status(404).json({ message: "LoRA profile not found" });
      }
      // deleteMediaItem uses buildMediaSk(type, key) internally
      await deleteMediaItem({ userId, type: LORA_PROFILE_TYPE, key: profileId });
      return res.json({ deleted: true, id: profileId });
    } catch (error) {
      console.error("LoRA profile delete error:", { message: error?.message || String(error) });
      return res
        .status(500)
        .json({ message: "Failed to delete LoRA profile", error: error?.message || String(error) });
    }
  });

  router.put("/lora/profiles/:characterId", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const characterId = normalizeString(req.params?.characterId);
    // Support both `name` and legacy `displayName`
    const name = normalizeString(req.body?.name || req.body?.displayName);
    const displayName = name;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!characterId) {
      return res.status(400).json({ message: "characterId is required" });
    }

    const normalizedImageProfile = normalizeLoraProfileModality({
      modalityConfig: req.body?.[LORA_MODALITY_IMAGE] || {},
      maxItems: LORA_PROFILE_MAX_ITEMS_PER_MODALITY,
    });
    const normalizedVideoProfile = normalizeLoraProfileModality({
      modalityConfig: req.body?.[LORA_MODALITY_VIDEO] || {},
      maxItems: LORA_PROFILE_MAX_ITEMS_PER_MODALITY,
    });
    const unsupportedImageModelPayload = getUnsupportedModelPayload({
      modality: LORA_MODALITY_IMAGE,
      modelKey: normalizedImageProfile.modelKey,
    });
    if (unsupportedImageModelPayload) {
      return res.status(400).json(unsupportedImageModelPayload);
    }
    const unsupportedVideoModelPayload = getUnsupportedModelPayload({
      modality: LORA_MODALITY_VIDEO,
      modelKey: normalizedVideoProfile.modelKey,
    });
    if (unsupportedVideoModelPayload) {
      return res.status(400).json(unsupportedVideoModelPayload);
    }
    const requestedCatalogIds = [
      ...normalizedImageProfile.loras.map((item) => item.catalogId),
      ...normalizedVideoProfile.loras.map((item) => item.catalogId),
    ].filter(Boolean);

    try {
      const existing = await getItem({
        pk: buildMediaPk(userId),
        sk: buildMediaSk(LORA_PROFILE_TYPE, characterId),
      });
      const catalogById = await fetchCatalogByIds({
        userId,
        catalogIds: requestedCatalogIds,
      });
      const missingCatalogIds = requestedCatalogIds.filter(
        (catalogId) => catalogId && !catalogById.has(catalogId)
      );
      if (missingCatalogIds.length > 0) {
        return res.status(400).json({
          message: "Some catalog entries are missing. Sync catalog first.",
          missingCatalogIds,
        });
      }

      const imageProfile = {
        ...normalizedImageProfile,
        loras: mergeCatalogMetadataIntoProfile({
          profileLoras: normalizedImageProfile.loras,
          catalogById,
        }),
      };
      const videoProfile = {
        ...normalizedVideoProfile,
        loras: mergeCatalogMetadataIntoProfile({
          profileLoras: normalizedVideoProfile.loras,
          catalogById,
        }),
      };

      const now = new Date().toISOString();
      const createdAt = normalizeString(existing?.createdAt) || now;
      // id = the existing id field if present, or falls back to characterId (legacy)
      const profileId = normalizeString(existing?.id || existing?.key || characterId);
      const profileCharacterId = normalizeString(existing?.characterId || characterId);
      await putMediaItem({
        userId,
        type: LORA_PROFILE_TYPE,
        key: characterId,
        extra: {
          id: profileId,
          characterId: profileCharacterId,
          name,
          displayName,
          imageModel: imageProfile.modelKey,
          imagePrompt: imageProfile.promptPrefix,
          videoModel: videoProfile.modelKey,
          videoPrompt: videoProfile.promptPrefix,
          image: imageProfile,
          video: videoProfile,
          updatedAt: now,
          createdAt,
        },
      });

      return res.json({
        profile: normalizeProfileResponseItem({
          id: profileId,
          characterId: profileCharacterId,
          name,
          displayName,
          imageModel: imageProfile.modelKey,
          imagePrompt: imageProfile.promptPrefix,
          videoModel: videoProfile.modelKey,
          videoPrompt: videoProfile.promptPrefix,
          image: imageProfile,
          video: videoProfile,
          updatedAt: now,
          createdAt,
        }),
      });
    } catch (error) {
      console.error("LoRA profile upsert error:", {
        message: error?.message || String(error),
      });
      return res.status(500).json({
        message: "Failed to save LoRA character profile",
        error: error?.message || String(error),
      });
    }
  });

  return router;
};
