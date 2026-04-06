const { Router } = require("express");
const {
  DEFAULT_CHARACTER_PROFILE_SEARCH_LIMIT,
  LORA_CATALOG_TYPE,
  LORA_SYNC_DEFAULT_LIMIT,
  LORA_SYNC_MAX_LIMIT,
} = require("../../config/lora");
const { createCivitaiClient } = require("../../lib/civitai-client");
const {
  clampInteger,
  normalizeLowerString,
  normalizeString,
  normalizeStringArray,
  parseBooleanLike,
} = require("../../lib/lora-utils");

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

module.exports = function registerLoraCatalogRoutes(deps) {
  const {
    buildMediaPk,
    buildMediaSk,
    queryBySkPrefix,
    putMediaItem,
  } = deps;

  const parseLimit = (
    value,
    fallback = DEFAULT_CHARACTER_PROFILE_SEARCH_LIMIT,
    max = DEFAULT_CHARACTER_PROFILE_SEARCH_LIMIT
  ) => clampInteger(value, fallback, 1, max);

  const listUserItemsByType = async ({ userId, type, limit }) =>
    queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: `${type}#`,
      limit,
      scanForward: false,
    });

  const router = Router();

  router.post("/lora/catalog/sync/civitai", deps.requireUserMiddleware, async (req, res) => {
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

  router.get("/lora/catalog", deps.requireUserMiddleware, async (req, res) => {
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

  return router;
};

module.exports.extractCivitaiStatusCodeFromError = extractCivitaiStatusCodeFromError;
module.exports.collectCatalogBaseModels = collectCatalogBaseModels;
module.exports.withBaseModelHint = withBaseModelHint;
module.exports.normalizeModelIdList = normalizeModelIdList;
module.exports.extractModelIdFromCivitaiUrl = extractModelIdFromCivitaiUrl;
module.exports.resolveRequestedModelIds = resolveRequestedModelIds;
