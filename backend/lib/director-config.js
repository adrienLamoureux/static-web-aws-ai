const DIRECTOR_CONFIG_TYPE = "CFG";
const DIRECTOR_CONFIG_KEY = "director/config";
const DEFAULT_IMAGE_MODEL_KEY = "animagine";
const DEFAULT_VIDEO_MODEL_KEY = "wan-2.2-i2v-fast";
const DEFAULT_SOUND_MOOD = "cinematic";
const DEFAULT_SOUND_ENERGY = "medium";
const DEFAULT_SOUND_TAGS = ["cinematic", "atmospheric"];
const DEFAULT_IMAGE_WIDTH = 768;
const DEFAULT_IMAGE_HEIGHT = 1024;
const DEFAULT_GENERATE_AUDIO = true;
const MAX_SOUND_TAGS = 12;
const MAX_SOUND_MOOD_LENGTH = 80;
const SOUND_ENERGY_LEVELS = new Set(["low", "medium", "high"]);

const parseInteger = (value, fallback, minimum = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(Math.round(parsed), minimum);
};

const parseBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
};

const splitTagInput = (value = "") =>
  String(value)
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

const normalizeTags = (value) => {
  const rawTags = Array.isArray(value) ? value : splitTagInput(value || "");
  const seen = new Set();
  return rawTags
    .map((tag) => String(tag || "").trim().toLowerCase())
    .filter(Boolean)
    .filter((tag) => {
      if (seen.has(tag)) return false;
      seen.add(tag);
      return true;
    })
    .slice(0, MAX_SOUND_TAGS);
};

const normalizeEnergy = (value = "", fallback = DEFAULT_SOUND_ENERGY) => {
  const normalized = String(value || "").trim().toLowerCase();
  return SOUND_ENERGY_LEVELS.has(normalized) ? normalized : fallback;
};

const normalizeMood = (value = "", fallback = DEFAULT_SOUND_MOOD) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized.slice(0, MAX_SOUND_MOOD_LENGTH);
};

const normalizeSizeForModel = ({
  modelConfig,
  requestedWidth,
  requestedHeight,
  fallbackSize,
}) => {
  const allowedSizes = Array.isArray(modelConfig?.sizes) ? modelConfig.sizes : [];
  if (!allowedSizes.length) {
    return {
      width: parseInteger(requestedWidth, DEFAULT_IMAGE_WIDTH),
      height: parseInteger(requestedHeight, DEFAULT_IMAGE_HEIGHT),
    };
  }
  const width = parseInteger(requestedWidth, fallbackSize.width);
  const height = parseInteger(requestedHeight, fallbackSize.height);
  const exactMatch = allowedSizes.find(
    (size) => Number(size.width) === width && Number(size.height) === height
  );
  if (exactMatch) {
    return {
      width: Number(exactMatch.width),
      height: Number(exactMatch.height),
    };
  }
  return {
    width: Number(fallbackSize.width),
    height: Number(fallbackSize.height),
  };
};

const resolveModelKey = (requestedKey, availableConfig = {}, fallbackKey = "") => {
  const normalizedRequested = String(requestedKey || "").trim();
  if (normalizedRequested && availableConfig[normalizedRequested]) {
    return normalizedRequested;
  }
  if (fallbackKey && availableConfig[fallbackKey]) {
    return fallbackKey;
  }
  return Object.keys(availableConfig)[0] || "";
};

const resolveScheduler = (requestedScheduler, modelConfig = {}) => {
  const schedulers = Array.isArray(modelConfig.schedulers)
    ? modelConfig.schedulers
    : [];
  if (!schedulers.length) return "";
  const requested = String(requestedScheduler || "").trim();
  if (requested && schedulers.includes(requested)) {
    return requested;
  }
  return schedulers[0];
};

const buildDirectorFallbackConfig = ({
  replicateModelConfig = {},
  replicateVideoConfig = {},
  defaultNegativePrompt = "",
}) => {
  const defaultImageModelKey = resolveModelKey(
    process.env.DIRECTOR_DEFAULT_IMAGE_MODEL,
    replicateModelConfig,
    DEFAULT_IMAGE_MODEL_KEY
  );
  const imageModelConfig = replicateModelConfig[defaultImageModelKey] || {};
  const defaultImageSize = {
    width: parseInteger(
      process.env.DIRECTOR_DEFAULT_IMAGE_WIDTH,
      DEFAULT_IMAGE_WIDTH
    ),
    height: parseInteger(
      process.env.DIRECTOR_DEFAULT_IMAGE_HEIGHT,
      DEFAULT_IMAGE_HEIGHT
    ),
  };
  const resolvedImageSize = normalizeSizeForModel({
    modelConfig: imageModelConfig,
    requestedWidth: defaultImageSize.width,
    requestedHeight: defaultImageSize.height,
    fallbackSize:
      imageModelConfig.sizes?.[0] || {
        width: DEFAULT_IMAGE_WIDTH,
        height: DEFAULT_IMAGE_HEIGHT,
      },
  });

  const defaultVideoModelKey = resolveModelKey(
    process.env.DIRECTOR_DEFAULT_VIDEO_MODEL,
    replicateVideoConfig,
    DEFAULT_VIDEO_MODEL_KEY
  );

  const generation = {
    imageModel: defaultImageModelKey,
    imageScheduler: resolveScheduler(
      process.env.DIRECTOR_DEFAULT_IMAGE_SCHEDULER,
      imageModelConfig
    ),
    imageWidth: resolvedImageSize.width,
    imageHeight: resolvedImageSize.height,
    negativePrompt:
      String(process.env.DIRECTOR_DEFAULT_NEGATIVE_PROMPT || "").trim() ||
      defaultNegativePrompt ||
      "",
  };

  const video = {
    videoModel: defaultVideoModelKey,
    generateAudio: parseBoolean(
      process.env.DIRECTOR_DEFAULT_VIDEO_GENERATE_AUDIO,
      DEFAULT_GENERATE_AUDIO
    ),
  };

  const sound = {
    defaultMood: normalizeMood(
      process.env.DIRECTOR_DEFAULT_SOUND_MOOD,
      DEFAULT_SOUND_MOOD
    ),
    defaultEnergy: normalizeEnergy(
      process.env.DIRECTOR_DEFAULT_SOUND_ENERGY,
      DEFAULT_SOUND_ENERGY
    ),
    defaultTags: normalizeTags(
      process.env.DIRECTOR_DEFAULT_SOUND_TAGS || DEFAULT_SOUND_TAGS
    ),
  };
  if (!sound.defaultTags.length) {
    sound.defaultTags = [...DEFAULT_SOUND_TAGS];
  }

  return {
    generation,
    video,
    sound,
  };
};

const normalizeDirectorConfig = ({
  input = {},
  fallbackConfig,
  replicateModelConfig = {},
  replicateVideoConfig = {},
}) => {
  const fallback = fallbackConfig || buildDirectorFallbackConfig({
    replicateModelConfig,
    replicateVideoConfig,
    defaultNegativePrompt: "",
  });
  const generationInput = input.generation || {};
  const videoInput = input.video || {};
  const soundInput = input.sound || {};

  const imageModelKey = resolveModelKey(
    generationInput.imageModel,
    replicateModelConfig,
    fallback.generation.imageModel
  );
  const imageModelConfig = replicateModelConfig[imageModelKey] || {};
  const resolvedImageSize = normalizeSizeForModel({
    modelConfig: imageModelConfig,
    requestedWidth: generationInput.imageWidth,
    requestedHeight: generationInput.imageHeight,
    fallbackSize: {
      width: fallback.generation.imageWidth,
      height: fallback.generation.imageHeight,
    },
  });

  const generation = {
    imageModel: imageModelKey,
    imageScheduler: resolveScheduler(
      generationInput.imageScheduler,
      imageModelConfig
    ),
    imageWidth: resolvedImageSize.width,
    imageHeight: resolvedImageSize.height,
    negativePrompt:
      String(generationInput.negativePrompt || "").trim() ||
      fallback.generation.negativePrompt,
  };

  const videoModelKey = resolveModelKey(
    videoInput.videoModel,
    replicateVideoConfig,
    fallback.video.videoModel
  );
  const video = {
    videoModel: videoModelKey,
    generateAudio:
      typeof videoInput.generateAudio === "boolean"
        ? videoInput.generateAudio
        : fallback.video.generateAudio,
  };

  const sound = {
    defaultMood: normalizeMood(soundInput.defaultMood, fallback.sound.defaultMood),
    defaultEnergy: normalizeEnergy(
      soundInput.defaultEnergy,
      fallback.sound.defaultEnergy
    ),
    defaultTags: normalizeTags(soundInput.defaultTags),
  };
  if (!sound.defaultTags.length) {
    sound.defaultTags = [...fallback.sound.defaultTags];
  }

  return {
    generation,
    video,
    sound,
  };
};

const getDirectorConfigDbKey = ({ buildMediaPk, buildMediaSk, userId }) => ({
  pk: buildMediaPk(userId),
  sk: buildMediaSk(DIRECTOR_CONFIG_TYPE, DIRECTOR_CONFIG_KEY),
});

module.exports = {
  DIRECTOR_CONFIG_TYPE,
  DIRECTOR_CONFIG_KEY,
  SOUND_ENERGY_LEVELS,
  splitTagInput,
  normalizeTags,
  normalizeEnergy,
  normalizeMood,
  buildDirectorFallbackConfig,
  normalizeDirectorConfig,
  getDirectorConfigDbKey,
};
