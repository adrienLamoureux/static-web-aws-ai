const {
  LORA_STRENGTH_DEFAULT,
  MIN_LORA_STRENGTH,
  MAX_LORA_STRENGTH,
} = require("../config/lora");

const normalizeString = (value = "") => String(value || "").trim();

const normalizeLowerString = (value = "") => normalizeString(value).toLowerCase();

const normalizeStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => normalizeString(item))
      .filter(Boolean);
  }
  return [];
};

const dedupeStringArray = (values = []) => {
  const seen = new Set();
  const output = [];
  values.forEach((value) => {
    const key = normalizeLowerString(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    output.push(normalizeString(value));
  });
  return output;
};

const clampNumber = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const clampInteger = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
};

const parseBooleanLike = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = normalizeLowerString(value);
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return fallback;
};

const buildLoraCatalogId = ({ provider = "", modelId = "", versionId = "" }) => {
  const normalizedProvider = normalizeLowerString(provider);
  const normalizedModelId = normalizeString(modelId);
  const normalizedVersionId = normalizeString(versionId);
  if (!normalizedProvider || !normalizedModelId || !normalizedVersionId) return "";
  return `${normalizedProvider}:${normalizedModelId}:${normalizedVersionId}`;
};

const hasLoraInjectionSupport = (modelConfig = {}) => {
  const injectionConfig = modelConfig?.loraInjection || {};
  const weightsField = normalizeString(injectionConfig.weightsField);
  const strengthField = normalizeString(injectionConfig.strengthField);
  const scaleFieldNames = Array.isArray(injectionConfig.scaleFieldNames)
    ? injectionConfig.scaleFieldNames.map((item) => normalizeString(item)).filter(Boolean)
    : [];
  return Boolean(weightsField || strengthField || scaleFieldNames.length);
};

const hasConfiguredLoraSupport = (modelConfig = {}) =>
  hasLoraInjectionSupport(modelConfig) || parseBooleanLike(modelConfig?.supportsLora, false);

const getLoraSupportedModelKeys = (modelConfigByKey = {}) =>
  Object.keys(modelConfigByKey || {}).filter((modelKey) =>
    hasConfiguredLoraSupport(modelConfigByKey[modelKey] || {})
  );

const buildLoraUnsupportedModelError = ({
  modelKey = "",
  modality = "",
  supportedModels = [],
}) => {
  const resolvedModelKey = normalizeString(modelKey);
  const resolvedModality = normalizeString(modality) || "image";
  const normalizedSupportedModels = Array.isArray(supportedModels)
    ? supportedModels.map((item) => normalizeString(item)).filter(Boolean)
    : [];
  const supportedModelNotice = normalizedSupportedModels.length
    ? `Supported models: ${normalizedSupportedModels.join(", ")}.`
    : "No LoRA-capable models are configured for this modality.";
  return {
    code: "LORA_UNSUPPORTED_MODEL",
    message: `Model "${resolvedModelKey}" does not support LoRA for ${resolvedModality}. ${supportedModelNotice}`,
    modality: resolvedModality,
    modelKey: resolvedModelKey,
    supportedModels: normalizedSupportedModels,
  };
};

const splitPromptFragments = (prompt = "") =>
  normalizeString(prompt)
    .split(",")
    .map((fragment) => normalizeString(fragment))
    .filter(Boolean);

const mergePromptFragments = (basePrompt = "", extraFragments = []) => {
  const merged = dedupeStringArray([
    ...normalizeStringArray(extraFragments),
    ...splitPromptFragments(basePrompt),
  ]);
  return merged.join(", ");
};

const normalizeLoraProfileItem = (item = {}) => {
  const catalogId = normalizeString(item.catalogId);
  const downloadUrl = normalizeString(item.downloadUrl);
  const name = normalizeString(item.name);
  const triggerWords = dedupeStringArray(normalizeStringArray(item.triggerWords));
  const strength = clampNumber(
    item.strength,
    LORA_STRENGTH_DEFAULT,
    MIN_LORA_STRENGTH,
    MAX_LORA_STRENGTH
  );

  if (!catalogId && !downloadUrl && !name) return null;

  return {
    catalogId,
    downloadUrl,
    name,
    triggerWords,
    strength,
  };
};

const normalizeLoraProfileModality = ({
  modalityConfig = {},
  maxItems = 1,
}) => {
  const modelKey = normalizeString(modalityConfig.modelKey);
  const promptPrefix = normalizeString(modalityConfig.promptPrefix);
  const loras = Array.isArray(modalityConfig.loras)
    ? modalityConfig.loras
        .map((item) => normalizeLoraProfileItem(item))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];

  return {
    modelKey,
    promptPrefix,
    loras,
  };
};

const mergeCatalogMetadataIntoProfile = ({
  profileLoras = [],
  catalogById = new Map(),
}) =>
  profileLoras.map((profileLora) => {
    const catalogItem = catalogById.get(profileLora.catalogId) || {};
    const catalogTriggerWords = dedupeStringArray(
      normalizeStringArray(catalogItem.triggerWords)
    );
    return {
      ...profileLora,
      name: profileLora.name || normalizeString(catalogItem.name),
      downloadUrl:
        profileLora.downloadUrl || normalizeString(catalogItem.downloadUrl),
      triggerWords:
        profileLora.triggerWords.length > 0
          ? profileLora.triggerWords
          : catalogTriggerWords,
    };
  });

const resolveProfilePrompt = ({ prompt = "", profileModality = {} }) => {
  const fragments = [
    profileModality.promptPrefix,
    ...(Array.isArray(profileModality.loras)
      ? profileModality.loras.flatMap((item) => item.triggerWords || [])
      : []),
  ];
  return mergePromptFragments(prompt, fragments);
};

const getAverageStrength = (loras = []) => {
  if (!loras.length) return LORA_STRENGTH_DEFAULT;
  const sum = loras.reduce(
    (acc, item) =>
      acc +
      clampNumber(
        item.strength,
        LORA_STRENGTH_DEFAULT,
        MIN_LORA_STRENGTH,
        MAX_LORA_STRENGTH
      ),
    0
  );
  return sum / loras.length;
};

const resolveReplicateLoraPatch = ({
  profileModality = {},
  modelConfig = {},
}) => {
  const loras = Array.isArray(profileModality.loras)
    ? profileModality.loras.filter(
        (item) => normalizeString(item.downloadUrl) || normalizeString(item.catalogId)
      )
    : [];
  if (!loras.length) return {};

  const injectionConfig = modelConfig?.loraInjection || {};
  const weightsField = normalizeString(injectionConfig.weightsField);
  const weightsFormat = normalizeLowerString(injectionConfig.weightsFormat) || "array";
  const strengthField = normalizeString(injectionConfig.strengthField);
  const scaleFieldNames = Array.isArray(injectionConfig.scaleFieldNames)
    ? injectionConfig.scaleFieldNames.map((item) => normalizeString(item)).filter(Boolean)
    : [];
  const resolvedDownloadUrls = loras
    .map((item) => normalizeString(item.downloadUrl))
    .filter(Boolean);
  const averageStrength = getAverageStrength(loras);

  const patch = {};

  if (weightsField && resolvedDownloadUrls.length) {
    patch[weightsField] =
      weightsFormat === "csv"
        ? resolvedDownloadUrls.join(",")
        : resolvedDownloadUrls;
  }

  if (strengthField) {
    patch[strengthField] = averageStrength;
  }

  scaleFieldNames.forEach((fieldName) => {
    patch[fieldName] = averageStrength;
  });

  return patch;
};

const applyCharacterProfileToReplicateInput = ({
  input = {},
  prompt = "",
  modelConfig = {},
  profileModality = {},
}) => {
  const mergedPrompt = resolveProfilePrompt({
    prompt,
    profileModality,
  });
  const patch = resolveReplicateLoraPatch({
    profileModality,
    modelConfig,
  });
  return {
    prompt: mergedPrompt,
    input: {
      ...input,
      ...patch,
    },
    patchApplied: Object.keys(patch).length > 0,
  };
};

module.exports = {
  normalizeString,
  normalizeLowerString,
  normalizeStringArray,
  dedupeStringArray,
  clampNumber,
  clampInteger,
  parseBooleanLike,
  buildLoraCatalogId,
  hasLoraInjectionSupport,
  hasConfiguredLoraSupport,
  getLoraSupportedModelKeys,
  buildLoraUnsupportedModelError,
  mergePromptFragments,
  normalizeLoraProfileModality,
  mergeCatalogMetadataIntoProfile,
  applyCharacterProfileToReplicateInput,
};
