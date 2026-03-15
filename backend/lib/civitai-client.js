const {
  CIVITAI_API_BASE_URL,
  CIVITAI_WEB_BASE_URL,
  CIVITAI_MODELS_PATH,
  CIVITAI_MODEL_TYPE,
  CIVITAI_ORCHESTRATION_BASE_URL,
  CIVITAI_ORCHESTRATION_JOBS_PATH,
  CIVITAI_REQUEST_TIMEOUT_MS,
  CIVITAI_BASEMODEL_SCAN_PAGE_LIMIT,
  CIVITAI_BASEMODEL_SCAN_PAGE_SIZE,
  LORA_SYNC_DEFAULT_LIMIT,
  LORA_SYNC_MAX_LIMIT,
} = require("../config/lora");
const {
  buildLoraCatalogId,
  clampInteger,
  normalizeString,
  normalizeStringArray,
  parseBooleanLike,
} = require("./lora-utils");

const hasFetch = typeof globalThis.fetch === "function";

const resolveFetch = () => {
  if (!hasFetch) {
    throw new Error(
      "global fetch is not available. Use Node.js 18+ or provide a fetch implementation."
    );
  }
  return globalThis.fetch.bind(globalThis);
};

const normalizeCivitaiSort = (value = "") => {
  const normalized = normalizeString(value);
  return normalized || "Highest Rated";
};

const normalizeCivitaiPeriod = (value = "") => {
  const normalized = normalizeString(value);
  return normalized || "Month";
};

const DIGITS_ONLY_PATTERN = /^\d+$/;
const DEFAULT_EMPTY_METADATA = Object.freeze({});

const normalizeModelIdList = (value = undefined) => {
  const values = Array.isArray(value) ? value : [value];
  const output = [];
  const seen = new Set();
  values.forEach((item) => {
    const normalized = normalizeString(item);
    if (!DIGITS_ONLY_PATTERN.test(normalized) || seen.has(normalized)) return;
    seen.add(normalized);
    output.push(normalized);
  });
  return output;
};

const normalizeBaseModelKey = (value = "") => normalizeString(value).toLowerCase();

const resolveCivitaiDownloadUrl = (version = {}) => {
  if (!Array.isArray(version.files)) return "";
  const fileWithDownload = version.files.find((file) =>
    normalizeString(file?.downloadUrl)
  );
  return normalizeString(fileWithDownload?.downloadUrl);
};

const resolveCivitaiPreviewImageUrl = (version = {}, model = {}) => {
  const versionImage = Array.isArray(version.images)
    ? version.images.find((image) => normalizeString(image?.url))
    : null;
  if (versionImage?.url) return normalizeString(versionImage.url);
  const modelImage = Array.isArray(model.images)
    ? model.images.find((image) => normalizeString(image?.url))
    : null;
  return normalizeString(modelImage?.url);
};

const mapCivitaiModelsToCatalogEntries = (models = []) => {
  const entries = [];
  models.forEach((model) => {
    const modelId = normalizeString(model?.id);
    const modelName = normalizeString(model?.name);
    const creatorName = normalizeString(model?.creator?.username);
    const tags = normalizeStringArray(model?.tags);
    const modelVersions = Array.isArray(model?.modelVersions)
      ? model.modelVersions
      : [];

    modelVersions.forEach((version) => {
      const versionId = normalizeString(version?.id);
      const versionName = normalizeString(version?.name);
      const catalogId = buildLoraCatalogId({
        provider: "civitai",
        modelId,
        versionId,
      });
      if (!catalogId) return;

      const baseModel = normalizeString(version?.baseModel);
      const triggerWords = normalizeStringArray(version?.trainedWords);
      const downloadUrl = resolveCivitaiDownloadUrl(version);
      const previewImageUrl = resolveCivitaiPreviewImageUrl(version, model);
      const modelUrl = `${CIVITAI_WEB_BASE_URL}/models/${modelId}${
        versionId ? `?modelVersionId=${versionId}` : ""
      }`;

      entries.push({
        catalogId,
        provider: "civitai",
        modelId,
        modelName,
        versionId,
        versionName,
        name: [modelName, versionName].filter(Boolean).join(" / "),
        baseModel,
        triggerWords,
        downloadUrl,
        previewImageUrl,
        modelUrl,
        creatorName,
        tags,
        nsfw: parseBooleanLike(model?.nsfw, false),
        stats: {
          downloadCount: Number(model?.stats?.downloadCount) || 0,
          favoriteCount: Number(model?.stats?.favoriteCount) || 0,
          rating: Number(model?.stats?.rating) || 0,
        },
      });
    });
  });
  return entries;
};

const createCivitaiClient = ({
  apiBaseUrl = CIVITAI_API_BASE_URL,
  orchestrationBaseUrl = CIVITAI_ORCHESTRATION_BASE_URL,
  apiToken = process.env.CIVITAI_API_TOKEN || "",
  requestTimeoutMs = CIVITAI_REQUEST_TIMEOUT_MS,
  fetchImpl = resolveFetch(),
} = {}) => {
  const resolveTimeoutMs = () =>
    clampInteger(
      requestTimeoutMs,
      CIVITAI_REQUEST_TIMEOUT_MS,
      1000,
      120000
    );

  const runRequest = async ({
    url,
    method = "GET",
    timeoutMs = resolveTimeoutMs(),
    payload = undefined,
  }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = {
        Accept: "application/json",
      };
      if (apiToken) {
        headers.Authorization = `Bearer ${apiToken}`;
      }
      if (payload) {
        headers["Content-Type"] = "application/json";
      }
      const response = await fetchImpl(url, {
        method,
        headers,
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: controller.signal,
      });
      if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(
          `CivitAI request failed (${response.status}): ${
            bodyText || response.statusText
          }`
        );
      }
      return response.json();
    } finally {
      clearTimeout(timer);
    }
  };

  const fetchAndMapCatalogEntries = async ({
    url,
    timeoutMs = resolveTimeoutMs(),
  }) => {
    const payload = await runRequest({
      url,
      timeoutMs,
    });
    return {
      catalogEntries: mapCivitaiModelsToCatalogEntries(payload?.items || []),
      metadata:
        payload?.metadata && typeof payload.metadata === "object"
          ? payload.metadata
          : DEFAULT_EMPTY_METADATA,
    };
  };

  const collectBaseModelMatchesFromBroadSearch = async ({
    query = "",
    baseModel = "",
    limit = LORA_SYNC_DEFAULT_LIMIT,
    nsfw = undefined,
    timeoutMs = resolveTimeoutMs(),
  }) => {
    const normalizedQuery = normalizeString(query);
    const normalizedBaseModelKey = normalizeBaseModelKey(baseModel);
    if (!normalizedQuery || !normalizedBaseModelKey) {
      return {
        items: [],
        metadata: DEFAULT_EMPTY_METADATA,
      };
    }
    const initialUrl = new URL(CIVITAI_MODELS_PATH, apiBaseUrl);
    initialUrl.searchParams.set("types", CIVITAI_MODEL_TYPE);
    initialUrl.searchParams.set("limit", String(CIVITAI_BASEMODEL_SCAN_PAGE_SIZE));
    initialUrl.searchParams.set("query", normalizedQuery);
    if (typeof nsfw !== "undefined") {
      initialUrl.searchParams.set("nsfw", parseBooleanLike(nsfw, false) ? "true" : "false");
    }

    const seenCatalogIds = new Set();
    const matchedEntries = [];
    let scannedPages = 0;
    let nextUrl = initialUrl.toString();
    let lastMetadata = DEFAULT_EMPTY_METADATA;

    while (
      nextUrl &&
      scannedPages < CIVITAI_BASEMODEL_SCAN_PAGE_LIMIT &&
      matchedEntries.length < limit
    ) {
      scannedPages += 1;
      const { catalogEntries, metadata } = await fetchAndMapCatalogEntries({
        url: nextUrl,
        timeoutMs,
      });
      lastMetadata = metadata;
      catalogEntries.forEach((entry) => {
        const catalogId = normalizeString(entry.catalogId);
        if (!catalogId || seenCatalogIds.has(catalogId)) return;
        if (normalizeBaseModelKey(entry.baseModel) !== normalizedBaseModelKey) return;
        seenCatalogIds.add(catalogId);
        matchedEntries.push(entry);
      });
      if (matchedEntries.length >= limit) break;
      nextUrl = normalizeString(metadata?.nextPage);
    }

    return {
      items: matchedEntries.slice(0, limit),
      metadata: {
        ...lastMetadata,
        fallbackSearch: {
          strategy: "broad-query-post-filter-base-model",
          pagesScanned: scannedPages,
          pageSize: CIVITAI_BASEMODEL_SCAN_PAGE_SIZE,
          requestedBaseModel: normalizeString(baseModel),
        },
      },
    };
  };

  const searchLoras = async ({
    query = "",
    limit = LORA_SYNC_DEFAULT_LIMIT,
    nsfw = undefined,
    sort = "",
    period = "",
    baseModel = "",
    modelIds = [],
  } = {}) => {
    const resolvedLimit = clampInteger(
      limit,
      LORA_SYNC_DEFAULT_LIMIT,
      1,
      LORA_SYNC_MAX_LIMIT
    );
    const url = new URL(CIVITAI_MODELS_PATH, apiBaseUrl);
    url.searchParams.set("types", CIVITAI_MODEL_TYPE);
    url.searchParams.set("limit", String(resolvedLimit));
    const normalizedQuery = normalizeString(query);
    const normalizedSort = normalizeCivitaiSort(sort);
    const normalizedPeriod = normalizeCivitaiPeriod(period);
    const normalizedBaseModel = normalizeString(baseModel);
    const normalizedModelIds = normalizeModelIdList(modelIds);
    const hasModelIdFilter = normalizedModelIds.length > 0;
    if (!hasModelIdFilter && normalizedQuery) {
      url.searchParams.set("query", normalizedQuery);
    }
    if (!hasModelIdFilter && normalizedSort) {
      url.searchParams.set("sort", normalizedSort);
    }
    if (!hasModelIdFilter && normalizedPeriod) {
      url.searchParams.set("period", normalizedPeriod);
    }
    if (normalizedBaseModel) url.searchParams.set("baseModels", normalizedBaseModel);
    normalizedModelIds.forEach((modelId) => {
      url.searchParams.append("ids", modelId);
    });
    if (typeof nsfw !== "undefined") {
      url.searchParams.set("nsfw", parseBooleanLike(nsfw, false) ? "true" : "false");
    }

    const timeoutMs = resolveTimeoutMs();
    const { catalogEntries, metadata } = await fetchAndMapCatalogEntries({
      url: url.toString(),
      timeoutMs,
    });

    if (
      !hasModelIdFilter &&
      normalizedBaseModel &&
      normalizedQuery &&
      catalogEntries.length === 0
    ) {
      return collectBaseModelMatchesFromBroadSearch({
        query: normalizedQuery,
        baseModel: normalizedBaseModel,
        limit: resolvedLimit,
        nsfw,
        timeoutMs,
      });
    }

    return {
      items: catalogEntries.slice(0, resolvedLimit),
      metadata,
    };
  };

  const createImageJobs = async ({
    modelId = "",
    baseModel = "",
    params = {},
    additionalNetworks = undefined,
    quantity = 1,
    wait = false,
    detailed = true,
    charge = true,
    whatIf = false,
  } = {}) => {
    const normalizedModelId = normalizeString(modelId);
    if (!normalizedModelId) {
      throw new Error("CivitAI modelId is required");
    }
    const url = new URL(CIVITAI_ORCHESTRATION_JOBS_PATH, orchestrationBaseUrl);
    url.searchParams.set("wait", wait ? "true" : "false");
    url.searchParams.set("detailed", detailed ? "true" : "false");
    url.searchParams.set("charge", charge ? "true" : "false");
    url.searchParams.set("whatif", whatIf ? "true" : "false");

    const body = {
      $type: "textToImage",
      model: normalizedModelId,
      baseModel: normalizeString(baseModel) || "SD_1_5",
      params: params || {},
      quantity: clampInteger(quantity, 1, 1, 8),
      ...(additionalNetworks &&
      typeof additionalNetworks === "object" &&
      Object.keys(additionalNetworks).length
        ? { additionalNetworks }
        : {}),
    };

    return runRequest({
      url: url.toString(),
      method: "POST",
      payload: body,
    });
  };

  const getImageJobs = async ({
    token = "",
    wait = false,
    detailed = true,
  } = {}) => {
    const normalizedToken = normalizeString(token);
    if (!normalizedToken) {
      throw new Error("CivitAI job token is required");
    }
    const url = new URL(CIVITAI_ORCHESTRATION_JOBS_PATH, orchestrationBaseUrl);
    url.searchParams.set("token", normalizedToken);
    url.searchParams.set("wait", wait ? "true" : "false");
    url.searchParams.set("detailed", detailed ? "true" : "false");
    return runRequest({
      url: url.toString(),
      method: "GET",
    });
  };

  return {
    searchLoras,
    createImageJobs,
    getImageJobs,
  };
};

module.exports = {
  createCivitaiClient,
};
