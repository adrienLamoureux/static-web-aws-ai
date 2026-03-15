const {
  DEFAULT_CHARACTER_PROFILE_SEARCH_LIMIT,
  LORA_CATALOG_TYPE,
  LORA_PROFILE_TYPE,
  LORA_MODALITY_IMAGE,
  LORA_MODALITY_VIDEO,
  LORA_SYNC_DEFAULT_LIMIT,
  LORA_SYNC_MAX_LIMIT,
  LORA_PROFILE_MAX_ITEMS_PER_MODALITY,
} = require("../config/lora");
const { createCivitaiClient } = require("../lib/civitai-client");
const {
  clampInteger,
  hasLoraInjectionSupport,
  getLoraSupportedModelKeys,
  buildLoraUnsupportedModelError,
  normalizeLowerString,
  normalizeString,
  normalizeStringArray,
  parseBooleanLike,
  normalizeLoraProfileModality,
  mergeCatalogMetadataIntoProfile,
} = require("../lib/lora-utils");

const CIVITAI_ERROR_STATUS_PATTERN = /CivitAI request failed \((\d{3})\):/i;
const CIVITAI_MODEL_URL_ID_PATTERN = /civitai\.com\/models\/(\d+)/i;
const DIGITS_ONLY_PATTERN = /^\d+$/;

const extractCivitaiStatusCodeFromError = (error) => {
  const message = normalizeString(error?.message || error);
  const match = message.match(CIVITAI_ERROR_STATUS_PATTERN);
  const parsedStatus = Number(match?.[1]);
  if (!Number.isInteger(parsedStatus)) return null;
  return parsedStatus;
};

const collectCatalogBaseModels = (catalogItems = []) => {
  const seen = new Set();
  const output = [];
  (Array.isArray(catalogItems) ? catalogItems : []).forEach((item) => {
    const baseModel = normalizeString(item?.baseModel);
    if (!baseModel) return;
    const key = normalizeLowerString(baseModel);
    if (seen.has(key)) return;
    seen.add(key);
    output.push(baseModel);
  });
  return output;
};

const normalizeModelIdList = (value = undefined) => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => normalizeString(item))
          .filter((item) => DIGITS_ONLY_PATTERN.test(item))
      )
    );
  }
  const normalized = normalizeString(value);
  if (!normalized) return [];
  if (DIGITS_ONLY_PATTERN.test(normalized)) return [normalized];
  return Array.from(
    new Set(
      normalized
        .split(/[,\s]+/g)
        .map((item) => normalizeString(item))
        .filter((item) => DIGITS_ONLY_PATTERN.test(item))
    )
  );
};

const extractModelIdFromCivitaiUrl = (value = "") => {
  const normalized = normalizeString(value);
  if (!normalized) return "";
  const match = normalized.match(CIVITAI_MODEL_URL_ID_PATTERN);
  return normalizeString(match?.[1]);
};

const resolveRequestedModelIds = (payload = {}) => {
  const modelIds = [
    ...normalizeModelIdList(payload.modelIds),
    ...normalizeModelIdList(payload.ids),
    ...normalizeModelIdList(payload.modelId),
    ...normalizeModelIdList(payload.civitaiModelId),
    ...normalizeModelIdList(payload.query),
    ...normalizeModelIdList(extractModelIdFromCivitaiUrl(payload.modelUrl)),
    ...normalizeModelIdList(extractModelIdFromCivitaiUrl(payload.modelRef)),
    ...normalizeModelIdList(extractModelIdFromCivitaiUrl(payload.query)),
  ];
  return Array.from(new Set(modelIds));
};

const withBaseModelHint = ({
  metadata = {},
  requestedBaseModel = "",
  hintItems = [],
}) => {
  const normalizedRequestedModel = normalizeString(requestedBaseModel);
  if (!normalizedRequestedModel) return metadata;
  const suggestedBaseModels = collectCatalogBaseModels(hintItems);
  if (!suggestedBaseModels.length) return metadata;
  const normalizedMetadata =
    metadata && typeof metadata === "object" ? metadata : {};
  return {
    ...normalizedMetadata,
    baseModelHint: {
      requestedBaseModel: normalizedRequestedModel,
      suggestedBaseModels,
    },
  };
};

const registerLoraRoutes = (app, deps) => {
  const {
    buildMediaPk,
    buildMediaSk,
    queryBySkPrefix,
    putMediaItem,
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
    const supportedModels = isImageModality
      ? imageLoraSupportedModels
      : videoLoraSupportedModels;
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

  const normalizeCatalogResponseItem = (item = {}) => ({
    catalogId: normalizeString(item.catalogId || item.key),
    provider: normalizeString(item.provider),
    modelId: normalizeString(item.modelId),
    modelName: normalizeString(item.modelName),
    versionId: normalizeString(item.versionId),
    versionName: normalizeString(item.versionName),
    name: normalizeString(item.name),
    baseModel: normalizeString(item.baseModel),
    downloadUrl: normalizeString(item.downloadUrl),
    triggerWords: normalizeStringArray(item.triggerWords),
    previewImageUrl: normalizeString(item.previewImageUrl),
    modelUrl: normalizeString(item.modelUrl),
    creatorName: normalizeString(item.creatorName),
    tags: normalizeStringArray(item.tags),
    nsfw: parseBooleanLike(item.nsfw, false),
    stats: {
      downloadCount: Number(item?.stats?.downloadCount) || 0,
      favoriteCount: Number(item?.stats?.favoriteCount) || 0,
      rating: Number(item?.stats?.rating) || 0,
    },
    updatedAt: normalizeString(item.updatedAt),
    syncedAt: normalizeString(item.syncedAt),
    createdAt: normalizeString(item.createdAt),
  });

  const normalizeProfileResponseItem = (item = {}) => ({
    characterId: normalizeString(item.characterId || item.key),
    displayName: normalizeString(item.displayName),
    image: {
      modelKey: normalizeString(item?.image?.modelKey),
      promptPrefix: normalizeString(item?.image?.promptPrefix),
      loras: Array.isArray(item?.image?.loras)
        ? item.image.loras.map((loraItem) => ({
            catalogId: normalizeString(loraItem.catalogId),
            name: normalizeString(loraItem.name),
            downloadUrl: normalizeString(loraItem.downloadUrl),
            strength: Number(loraItem.strength) || 0,
            triggerWords: normalizeStringArray(loraItem.triggerWords),
          }))
        : [],
    },
    video: {
      modelKey: normalizeString(item?.video?.modelKey),
      promptPrefix: normalizeString(item?.video?.promptPrefix),
      loras: Array.isArray(item?.video?.loras)
        ? item.video.loras.map((loraItem) => ({
            catalogId: normalizeString(loraItem.catalogId),
            name: normalizeString(loraItem.name),
            downloadUrl: normalizeString(loraItem.downloadUrl),
            strength: Number(loraItem.strength) || 0,
            triggerWords: normalizeStringArray(loraItem.triggerWords),
          }))
        : [],
    },
    updatedAt: normalizeString(item.updatedAt),
    createdAt: normalizeString(item.createdAt),
  });

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

  app.post("/lora/catalog/sync/civitai", async (req, res) => {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const syncLimit = parseLimit(
      req.body?.limit,
      LORA_SYNC_DEFAULT_LIMIT,
      LORA_SYNC_MAX_LIMIT
    );
    const query = normalizeString(req.body?.query);
    const baseModel = normalizeString(req.body?.baseModel);
    const sort = normalizeString(req.body?.sort);
    const period = normalizeString(req.body?.period);
    const modelIds = resolveRequestedModelIds(req.body || {});
    const hasNsfwInput = Object.prototype.hasOwnProperty.call(req.body || {}, "nsfw");

    try {
      const civitaiClient = createCivitaiClient();
      const searchParams = {
        query,
        limit: syncLimit,
        baseModel,
        sort,
        period,
        modelIds,
        nsfw: hasNsfwInput ? req.body?.nsfw : undefined,
      };
      const { items, metadata } = await civitaiClient.searchLoras(searchParams);
      let responseMetadata = metadata;
      if (baseModel && items.length === 0) {
        const fallbackResult = await civitaiClient.searchLoras({
          ...searchParams,
          limit: LORA_SYNC_MAX_LIMIT,
          baseModel: "",
        });
        responseMetadata = withBaseModelHint({
          metadata: responseMetadata,
          requestedBaseModel: baseModel,
          hintItems: fallbackResult.items,
        });
      }
      const now = new Date().toISOString();
      const writes = items.map((entry) =>
        putMediaItem({
          userId,
          type: LORA_CATALOG_TYPE,
          key: entry.catalogId,
          extra: {
            ...entry,
            syncedAt: now,
            updatedAt: now,
          },
        })
      );
      await Promise.all(writes);

      return res.json({
        syncedCount: items.length,
        query,
        baseModel,
        modelIds,
        metadata: responseMetadata,
        items: items.map((item) => normalizeCatalogResponseItem(item)),
      });
    } catch (error) {
      const errorMessage = error?.message || String(error);
      const upstreamStatus = extractCivitaiStatusCodeFromError(errorMessage);
      const shouldForwardClientError = upstreamStatus >= 400 && upstreamStatus < 500;
      console.error("CivitAI LoRA sync error:", {
        message: errorMessage,
      });
      return res.status(shouldForwardClientError ? upstreamStatus : 500).json({
        message: shouldForwardClientError
          ? "CivitAI rejected the LoRA catalog sync request"
          : "Failed to sync LoRA catalog from CivitAI",
        error: errorMessage,
      });
    }
  });

  app.get("/lora/catalog", async (req, res) => {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const limit = parseLimit(
      req.query?.limit,
      LORA_SYNC_DEFAULT_LIMIT,
      DEFAULT_CHARACTER_PROFILE_SEARCH_LIMIT
    );
    const query = normalizeLowerString(req.query?.query || req.query?.q || "");

    try {
      const rawItems = await listUserItemsByType({
        userId,
        type: LORA_CATALOG_TYPE,
        limit: DEFAULT_CHARACTER_PROFILE_SEARCH_LIMIT,
      });
      const normalizedItems = rawItems.map((item) => normalizeCatalogResponseItem(item));
      const filteredItems = query
        ? normalizedItems.filter((item) => {
            const searchable = [
              item.catalogId,
              item.name,
              item.modelName,
              item.versionName,
              item.baseModel,
              item.creatorName,
              ...(item.tags || []),
              ...(item.triggerWords || []),
            ]
              .join(" ")
              .toLowerCase();
            return searchable.includes(query);
          })
        : normalizedItems;

      return res.json({
        total: filteredItems.length,
        items: filteredItems.slice(0, limit),
      });
    } catch (error) {
      console.error("LoRA catalog list error:", {
        message: error?.message || String(error),
      });
      return res.status(500).json({
        message: "Failed to load LoRA catalog",
        error: error?.message || String(error),
      });
    }
  });

  app.get("/lora/profiles", async (req, res) => {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const limit = parseLimit(
      req.query?.limit,
      DEFAULT_CHARACTER_PROFILE_SEARCH_LIMIT,
      DEFAULT_CHARACTER_PROFILE_SEARCH_LIMIT
    );

    try {
      const items = await listUserItemsByType({
        userId,
        type: LORA_PROFILE_TYPE,
        limit,
      });
      return res.json({
        total: items.length,
        items: items.map((item) => normalizeProfileResponseItem(item)),
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

  app.get("/lora/profiles/:characterId", async (req, res) => {
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

  app.put("/lora/profiles/:characterId", async (req, res) => {
    const userId = req.user?.sub;
    const characterId = normalizeString(req.params?.characterId);
    const displayName = normalizeString(req.body?.displayName);
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
      await putMediaItem({
        userId,
        type: LORA_PROFILE_TYPE,
        key: characterId,
        extra: {
          characterId,
          displayName,
          image: imageProfile,
          video: videoProfile,
          updatedAt: now,
          createdAt: normalizeString(existing?.createdAt) || now,
        },
      });

      return res.json({
        profile: normalizeProfileResponseItem({
          characterId,
          displayName,
          image: imageProfile,
          video: videoProfile,
          updatedAt: now,
          createdAt: normalizeString(existing?.createdAt) || now,
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
};

module.exports = registerLoraRoutes;
module.exports.extractCivitaiStatusCodeFromError = extractCivitaiStatusCodeFromError;
module.exports.collectCatalogBaseModels = collectCatalogBaseModels;
module.exports.withBaseModelHint = withBaseModelHint;
module.exports.normalizeModelIdList = normalizeModelIdList;
module.exports.extractModelIdFromCivitaiUrl = extractModelIdFromCivitaiUrl;
module.exports.resolveRequestedModelIds = resolveRequestedModelIds;
