/**
 * Shared constants and utility functions for the story music domain.
 */

const { parseIntegerEnv } = require("./illustration-helpers");
const { signObjectUrl } = require("../../lib/s3-utils");

const parseNumberEnv = (value, fallback, minimum = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(parsed, minimum);
};

const parseBooleanEnv = (value, fallback = false) => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
};

const parseOptionalNumber = (value) => {
  if (value === null || value === "" || typeof value === "undefined") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const DEFAULT_STORY_MUSIC_DURATION_SECONDS = 8;
const DEFAULT_STORY_MUSIC_MODEL_VERSION = "stereo-large";
const DEFAULT_STORY_MUSIC_OUTPUT_FORMAT = "mp3";
const DEFAULT_STORY_MUSIC_NORMALIZATION = "peak";
const DEFAULT_STORY_MUSIC_TOP_K = 250;
const DEFAULT_STORY_MUSIC_TOP_P = 0;
const DEFAULT_STORY_MUSIC_TEMPERATURE = 1;
const DEFAULT_STORY_MUSIC_GUIDANCE = 3;
const DEFAULT_STORY_MUSIC_LOOP_HINT =
  "Seamless loopable ambient game underscore with no intro hit, no ending cadence, and no fade-out.";
const DEFAULT_STORY_MUSIC_APPLY_LOOP_HINT = false;
const AUDIO_CONTENT_TYPE_BY_EXTENSION = Object.freeze({
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/mp4",
});
const STORY_MUSIC_SUPPORTED_OUTPUT_FORMATS = new Set(Object.keys(AUDIO_CONTENT_TYPE_BY_EXTENSION));

const STORY_MUSIC_DURATION_SECONDS = parseIntegerEnv(
  process.env.STORY_MUSIC_DURATION_SECONDS,
  DEFAULT_STORY_MUSIC_DURATION_SECONDS,
  1
);

// normalizePromptFragment is a dep — pass it in where needed, or resolve at module load
// We defer to the callers for deps that come from the DI container.

const DEFAULT_STORY_MUSIC_PROMPT = "Cinematic fantasy ambience, gentle orchestral movement";
const MUSIC_LIBRARY_SK_PREFIX = "MUSICLIB#";
const STORY_MUSIC_RECOMMENDATION_METHOD = "keyword-overlap-v1";
const STORY_MUSIC_RECOMMENDATION_SCAN_LIMIT = 500;
const STORY_MUSIC_RECOMMENDATION_CANDIDATE_LIMIT = 5;
const STORY_MUSIC_RECOMMENDATION_MIN_TERM_LENGTH = 3;
const STORY_MUSIC_RECOMMENDATION_WEIGHTS = Object.freeze({
  tokenCoverage: 0.65,
  tagCoverage: 0.2,
  moodMatch: 0.1,
  energyMatch: 0.05,
});
const STORY_MUSIC_RECOMMENDATION_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "ambient",
  "around",
  "audio",
  "before",
  "between",
  "cinematic",
  "during",
  "fantasy",
  "from",
  "game",
  "gentle",
  "into",
  "just",
  "like",
  "music",
  "scene",
  "score",
  "soundtrack",
  "story",
  "that",
  "the",
  "then",
  "there",
  "this",
  "track",
  "with",
]);

/**
 * Build the resolved STORY_MUSIC_DEFAULT_INPUT constant using runtime env values.
 * Must be called after the env-derived constants are resolved.
 */
const buildStoryMusicDefaultInput = (normalizePromptFragment) => {
  const requestedStoryMusicOutputFormat = normalizePromptFragment(
    process.env.STORY_MUSIC_OUTPUT_FORMAT || ""
  )
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const STORY_MUSIC_OUTPUT_FORMAT = STORY_MUSIC_SUPPORTED_OUTPUT_FORMATS.has(
    requestedStoryMusicOutputFormat
  )
    ? requestedStoryMusicOutputFormat
    : DEFAULT_STORY_MUSIC_OUTPUT_FORMAT;

  const STORY_MUSIC_MODEL_VERSION =
    normalizePromptFragment(process.env.STORY_MUSIC_MODEL_VERSION || "") ||
    DEFAULT_STORY_MUSIC_MODEL_VERSION;
  const STORY_MUSIC_NORMALIZATION =
    normalizePromptFragment(process.env.STORY_MUSIC_NORMALIZATION_STRATEGY || "") ||
    DEFAULT_STORY_MUSIC_NORMALIZATION;
  const STORY_MUSIC_TOP_K = parseIntegerEnv(
    process.env.STORY_MUSIC_TOP_K,
    DEFAULT_STORY_MUSIC_TOP_K,
    0
  );
  const STORY_MUSIC_TOP_P = parseNumberEnv(
    process.env.STORY_MUSIC_TOP_P,
    DEFAULT_STORY_MUSIC_TOP_P,
    0
  );
  const STORY_MUSIC_TEMPERATURE = parseNumberEnv(
    process.env.STORY_MUSIC_TEMPERATURE,
    DEFAULT_STORY_MUSIC_TEMPERATURE,
    0
  );
  const STORY_MUSIC_GUIDANCE = parseIntegerEnv(
    process.env.STORY_MUSIC_CLASSIFIER_FREE_GUIDANCE,
    DEFAULT_STORY_MUSIC_GUIDANCE,
    0
  );

  const STORY_MUSIC_DEFAULT_INPUT = Object.freeze({
    top_k: STORY_MUSIC_TOP_K,
    top_p: STORY_MUSIC_TOP_P,
    duration: STORY_MUSIC_DURATION_SECONDS,
    temperature: STORY_MUSIC_TEMPERATURE,
    continuation: false,
    model_version: STORY_MUSIC_MODEL_VERSION,
    output_format: STORY_MUSIC_OUTPUT_FORMAT,
    continuation_start: 0,
    multi_band_diffusion: false,
    normalization_strategy: STORY_MUSIC_NORMALIZATION,
    classifier_free_guidance: STORY_MUSIC_GUIDANCE,
  });

  return {
    STORY_MUSIC_OUTPUT_FORMAT,
    STORY_MUSIC_DEFAULT_INPUT,
  };
};

const STORY_MUSIC_MODEL_ID =
  process.env.REPLICATE_STORY_MUSIC_MODEL_ID ||
  "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb";

const STORY_MUSIC_APPLY_LOOP_HINT = parseBooleanEnv(
  process.env.STORY_MUSIC_APPLY_LOOP_HINT,
  DEFAULT_STORY_MUSIC_APPLY_LOOP_HINT
);

const buildLoopFriendlyMusicPrompt = (normalizePromptFragment, rawPrompt = "") => {
  const STORY_MUSIC_LOOP_HINT = normalizePromptFragment(
    process.env.STORY_MUSIC_LOOP_HINT || DEFAULT_STORY_MUSIC_LOOP_HINT
  );
  const normalizedPrompt = normalizePromptFragment(rawPrompt || "");
  if (!STORY_MUSIC_APPLY_LOOP_HINT || !STORY_MUSIC_LOOP_HINT) {
    return normalizedPrompt;
  }
  const normalizedLower = normalizedPrompt.toLowerCase();
  const hintLower = STORY_MUSIC_LOOP_HINT.toLowerCase();
  if (!normalizedPrompt) return STORY_MUSIC_LOOP_HINT;
  if (normalizedLower.includes("seamless loop") || normalizedLower.includes(hintLower)) {
    return normalizedPrompt;
  }
  return `${normalizedPrompt}. ${STORY_MUSIC_LOOP_HINT}`;
};

const parseMusicTags = (normalizePromptFragment, value) => {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim());
  return Array.from(
    new Set(
      raw.map((item) => normalizePromptFragment(String(item || "")).toLowerCase()).filter(Boolean)
    )
  ).slice(0, 12);
};

const normalizeTrackForSearch = (normalizePromptFragment, trackItem = {}) => {
  const tags = parseMusicTags(normalizePromptFragment, trackItem.tags);
  const title = normalizePromptFragment(trackItem.title || "Saved soundtrack");
  const description = normalizePromptFragment(trackItem.description || "");
  const prompt = normalizePromptFragment(trackItem.prompt || "");
  const mood = normalizePromptFragment(trackItem.mood || "").toLowerCase();
  const energy = normalizePromptFragment(trackItem.energy || "").toLowerCase();
  const source =
    normalizePromptFragment(trackItem.source || "").toLowerCase() ||
    (trackItem.sessionId || trackItem.sceneId ? "generated" : "");
  const searchText = normalizePromptFragment(
    trackItem.searchText ||
      buildTrackSearchText(normalizePromptFragment, {
        title,
        description,
        mood,
        energy,
        tags,
        prompt,
      })
  ).toLowerCase();
  return {
    ...trackItem,
    title,
    description,
    prompt,
    mood,
    energy,
    source,
    tags,
    searchText,
  };
};

const buildTrackSearchText = (
  normalizePromptFragment,
  { title = "", description = "", mood = "", energy = "", tags = [], prompt = "" }
) =>
  [title, description, mood, energy, prompt, ...(Array.isArray(tags) ? tags : [])]
    .map((item) => normalizePromptFragment(String(item || "")).toLowerCase())
    .filter(Boolean)
    .join(" ");

const mapMusicTrackResponse = async (
  normalizePromptFragment,
  s3Client,
  GetObjectCommand,
  getSignedUrl,
  bucket,
  trackItem = {}
) => {
  const signMusicTrackUrl = (key) =>
    signObjectUrl(s3Client, GetObjectCommand, getSignedUrl, bucket, key);

  return {
    trackId: trackItem.trackId || String(trackItem.sk || "").replace(MUSIC_LIBRARY_SK_PREFIX, ""),
    title: trackItem.title || "Saved soundtrack",
    description: trackItem.description || "",
    key: trackItem.key || "",
    url: await signMusicTrackUrl(trackItem.key),
    prompt: trackItem.prompt || "",
    mood: normalizePromptFragment(trackItem.mood || "").toLowerCase(),
    energy: normalizePromptFragment(trackItem.energy || "").toLowerCase(),
    tempoBpm: trackItem.tempoBpm || null,
    tags: parseMusicTags(normalizePromptFragment, trackItem.tags),
    modelId: trackItem.modelId || STORY_MUSIC_MODEL_ID,
    sessionId: trackItem.sessionId || "",
    sceneId: trackItem.sceneId || "",
    source: trackItem.source || "",
    createdAt: trackItem.createdAt || "",
    updatedAt: trackItem.updatedAt || "",
  };
};

const buildSceneMusicPayload = (parseOptionalNumberFn, sceneItem = {}, musicUrl = "") => ({
  musicKey: sceneItem.musicKey || "",
  musicUrl: musicUrl || "",
  musicStatus: sceneItem.musicStatus || "",
  musicPredictionId: sceneItem.musicPredictionId || "",
  musicPrompt: sceneItem.musicPrompt || "",
  musicModelId: sceneItem.musicModelId || "",
  musicMood: sceneItem.musicMood || "",
  musicEnergy: sceneItem.musicEnergy || "",
  musicTempoBpm: sceneItem.musicTempoBpm || null,
  musicTags: Array.isArray(sceneItem.musicTags) ? sceneItem.musicTags : [],
  musicLibraryTrackId: sceneItem.musicLibraryTrackId || "",
  recommendedTrackId: sceneItem.recommendedTrackId || "",
  recommendationMethod: sceneItem.recommendationMethod || "",
  recommendationScore: parseOptionalNumberFn(sceneItem.recommendationScore),
  musicUpdatedAt: sceneItem.musicUpdatedAt || "",
});

const inferAudioExtension = ({
  contentType = "",
  url = "",
  fallback = DEFAULT_STORY_MUSIC_OUTPUT_FORMAT,
}) => {
  const normalizedType = String(contentType || "").toLowerCase();
  if (normalizedType.includes("audio/mpeg") || normalizedType.includes("audio/mp3")) {
    return "mp3";
  }
  if (normalizedType.includes("audio/wav") || normalizedType.includes("audio/x-wav")) {
    return "wav";
  }
  if (normalizedType.includes("audio/ogg")) return "ogg";
  if (normalizedType.includes("audio/flac")) return "flac";
  if (normalizedType.includes("audio/aac")) return "aac";
  if (normalizedType.includes("audio/mp4")) return "m4a";
  const extFromUrl = String(url || "")
    .split("?")[0]
    .split(".")
    .pop()
    ?.toLowerCase();
  if (extFromUrl && /^[a-z0-9]{2,5}$/.test(extFromUrl)) {
    return extFromUrl;
  }
  return fallback;
};

const resolveAudioContentType = ({ contentType = "", extension = "" }) => {
  const normalizedType = String(contentType || "").toLowerCase();
  if (normalizedType.startsWith("audio/")) {
    return normalizedType;
  }
  const normalizedExtension = String(extension || "").toLowerCase();
  return (
    AUDIO_CONTENT_TYPE_BY_EXTENSION[normalizedExtension] ||
    AUDIO_CONTENT_TYPE_BY_EXTENSION[DEFAULT_STORY_MUSIC_OUTPUT_FORMAT] ||
    "audio/mpeg"
  );
};

const buildStoryMusicLibrarySk = (trackId = "") => `${MUSIC_LIBRARY_SK_PREFIX}${trackId}`;

const buildStoryMusicLibraryKey = (
  buildUserPrefix,
  userId = "",
  trackId = "",
  outputFormat = DEFAULT_STORY_MUSIC_OUTPUT_FORMAT
) => `${buildUserPrefix(userId)}stories/music-library/${trackId}.${outputFormat}`;

const buildStorySceneMusicKey = (
  buildUserPrefix,
  userId = "",
  sessionId = "",
  sceneId = "",
  outputFormat = DEFAULT_STORY_MUSIC_OUTPUT_FORMAT
) => `${buildUserPrefix(userId)}stories/${sessionId}/scenes/${sceneId}.${outputFormat}`;

const buildGeneratedTrackId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildGeneratedTrackTitle = (normalizePromptFragment, sceneItem = {}) =>
  normalizePromptFragment(`${sceneItem.title || "Scene"} soundtrack`) || "Saved soundtrack";

const parseLibraryLimit = (value, fallback = 200) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), 1), 500);
};

const matchesTrackFilter = (normalizePromptFragment, trackItem = {}, filters = {}) => {
  const track = normalizeTrackForSearch(normalizePromptFragment, trackItem);
  const terms = String(filters.q || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length > 0) {
    const searchable = track.searchText || "";
    const allTermsPresent = terms.every((term) => searchable.includes(term));
    if (!allTermsPresent) return false;
  }

  if (filters.mood && track.mood !== filters.mood) {
    return false;
  }
  if (filters.energy && track.energy !== filters.energy) {
    return false;
  }
  if (filters.source && track.source !== filters.source) {
    return false;
  }

  if (Array.isArray(filters.tags) && filters.tags.length > 0) {
    const tagSet = new Set(track.tags || []);
    if ((filters.tagsMode || "any") === "all") {
      const everyTagPresent = filters.tags.every((tag) => tagSet.has(tag));
      if (!everyTagPresent) return false;
    } else {
      const atLeastOneTag = filters.tags.some((tag) => tagSet.has(tag));
      if (!atLeastOneTag) return false;
    }
  }

  return true;
};

module.exports = {
  parseOptionalNumber,
  DEFAULT_STORY_MUSIC_DURATION_SECONDS,
  DEFAULT_STORY_MUSIC_MODEL_VERSION,
  DEFAULT_STORY_MUSIC_OUTPUT_FORMAT,
  DEFAULT_STORY_MUSIC_NORMALIZATION,
  DEFAULT_STORY_MUSIC_TOP_K,
  DEFAULT_STORY_MUSIC_TOP_P,
  DEFAULT_STORY_MUSIC_TEMPERATURE,
  DEFAULT_STORY_MUSIC_GUIDANCE,
  DEFAULT_STORY_MUSIC_LOOP_HINT,
  DEFAULT_STORY_MUSIC_APPLY_LOOP_HINT,
  DEFAULT_STORY_MUSIC_PROMPT,
  AUDIO_CONTENT_TYPE_BY_EXTENSION,
  STORY_MUSIC_SUPPORTED_OUTPUT_FORMATS,
  STORY_MUSIC_DURATION_SECONDS,
  STORY_MUSIC_MODEL_ID,
  STORY_MUSIC_APPLY_LOOP_HINT,
  MUSIC_LIBRARY_SK_PREFIX,
  STORY_MUSIC_RECOMMENDATION_METHOD,
  STORY_MUSIC_RECOMMENDATION_SCAN_LIMIT,
  STORY_MUSIC_RECOMMENDATION_CANDIDATE_LIMIT,
  STORY_MUSIC_RECOMMENDATION_MIN_TERM_LENGTH,
  STORY_MUSIC_RECOMMENDATION_WEIGHTS,
  STORY_MUSIC_RECOMMENDATION_STOPWORDS,
  buildStoryMusicDefaultInput,
  buildLoopFriendlyMusicPrompt,
  parseMusicTags,
  normalizeTrackForSearch,
  buildTrackSearchText,
  mapMusicTrackResponse,
  buildSceneMusicPayload,
  inferAudioExtension,
  resolveAudioContentType,
  buildStoryMusicLibrarySk,
  buildStoryMusicLibraryKey,
  buildStorySceneMusicKey,
  buildGeneratedTrackId,
  buildGeneratedTrackTitle,
  parseLibraryLimit,
  matchesTrackFilter,
};
