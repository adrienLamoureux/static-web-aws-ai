export const LORA_MODALITY_IMAGE = "image";
export const LORA_MODALITY_VIDEO = "video";
export const LORA_STRENGTH_DEFAULT = 1;

export const CATALOG_DEFAULT_LIMIT = 100;
export const CATALOG_MIN_LIMIT = 1;
export const CATALOG_MAX_LIMIT = 200;
export const CATALOG_SEARCH_DEBOUNCE_MS = 250;

export const SYNC_DEFAULT_LIMIT = 20;
export const SYNC_MIN_LIMIT = 1;
export const SYNC_MAX_LIMIT = 80;

export const PROFILE_STRENGTH_MIN = 0;
export const PROFILE_STRENGTH_MAX = 2;

export const normalizeString = (value = "") => String(value || "").trim();

export const toUniqueStringArray = (values = []) => {
  const seen = new Set();
  const output = [];
  values.forEach((value) => {
    const normalized = normalizeString(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(normalized);
  });
  return output;
};

export const clampInteger = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
};

export const clampStrength = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return LORA_STRENGTH_DEFAULT;
  return Math.min(Math.max(parsed, PROFILE_STRENGTH_MIN), PROFILE_STRENGTH_MAX);
};

export const normalizeLoraItem = (item = {}) => ({
  catalogId: normalizeString(item.catalogId),
  name: normalizeString(item.name),
  downloadUrl: normalizeString(item.downloadUrl),
  triggerWords: toUniqueStringArray(item.triggerWords || []),
  strength: clampStrength(item.strength),
});

export const emptyModalityDraft = () => ({
  modelKey: "",
  promptPrefix: "",
  loras: [],
});

export const createEmptyProfileDraft = ({ characterId = "", name = "" } = {}) => ({
  characterId: normalizeString(characterId),
  name: normalizeString(name),
  image: emptyModalityDraft(),
  video: emptyModalityDraft(),
});

export const normalizeProfileDraft = ({ profile = {}, characterId = "", name = "" }) => ({
  characterId: normalizeString(profile.characterId) || normalizeString(characterId),
  name: normalizeString(profile.name || profile.displayName) || normalizeString(name),
  image: {
    modelKey: normalizeString(profile?.image?.modelKey),
    promptPrefix: normalizeString(profile?.image?.promptPrefix),
    loras: Array.isArray(profile?.image?.loras)
      ? profile.image.loras.map(normalizeLoraItem).filter((item) => item.catalogId || item.downloadUrl)
      : [],
  },
  video: {
    modelKey: normalizeString(profile?.video?.modelKey),
    promptPrefix: normalizeString(profile?.video?.promptPrefix),
    loras: Array.isArray(profile?.video?.loras)
      ? profile.video.loras.map(normalizeLoraItem).filter((item) => item.catalogId || item.downloadUrl)
      : [],
  },
});

export const normalizeCatalogItems = (items = []) =>
  (Array.isArray(items) ? items : []).map((item) => ({
    catalogId: normalizeString(item.catalogId),
    name: normalizeString(item.name),
    modelName: normalizeString(item.modelName),
    versionName: normalizeString(item.versionName),
    baseModel: normalizeString(item.baseModel),
    creatorName: normalizeString(item.creatorName),
    triggerWords: toUniqueStringArray(item.triggerWords || []),
    downloadUrl: normalizeString(item.downloadUrl),
    modelUrl: normalizeString(item.modelUrl),
    tags: toUniqueStringArray(item.tags || []),
    stats: {
      downloadCount: Number(item?.stats?.downloadCount) || 0,
      favoriteCount: Number(item?.stats?.favoriteCount) || 0,
      rating: Number(item?.stats?.rating) || 0,
    },
  }));

export const normalizeCharacterOptions = (characters = []) =>
  (Array.isArray(characters) ? characters : [])
    .map((item) => ({
      id: normalizeString(item?.id),
      name: normalizeString(item?.name || item?.id),
      source: normalizeString(item?.source || 'user'),
    }))
    .filter((item) => item.id && item.name);

export const buildProfileSavePayload = (draft = {}) => ({
  name: normalizeString(draft.name || draft.displayName),
  displayName: normalizeString(draft.name || draft.displayName), // legacy compat
  image: {
    modelKey: normalizeString(draft?.image?.modelKey),
    promptPrefix: normalizeString(draft?.image?.promptPrefix),
    loras: Array.isArray(draft?.image?.loras)
      ? draft.image.loras.map(normalizeLoraItem).filter((item) => item.catalogId || item.downloadUrl)
      : [],
  },
  video: {
    modelKey: normalizeString(draft?.video?.modelKey),
    promptPrefix: normalizeString(draft?.video?.promptPrefix),
    loras: Array.isArray(draft?.video?.loras)
      ? draft.video.loras.map(normalizeLoraItem).filter((item) => item.catalogId || item.downloadUrl)
      : [],
  },
});

export const toNumberLabel = (value) => new Intl.NumberFormat().format(Number(value) || 0);

export const isProfileNotFoundError = (message = "") =>
  String(message || "").toLowerCase().includes("not found");
