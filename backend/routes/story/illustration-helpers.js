/**
 * Shared constants and utility functions for the story illustration domain.
 */
const { signObjectUrl } = require("../../lib/s3-utils");

const parseIntegerEnv = (value, fallback, minimum = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(Math.round(parsed), minimum);
};

const DEFAULT_STORY_ILLUSTRATION_MODEL = "wai-nsfw-illustrious-v11";
const DEFAULT_STORY_ILLUSTRATION_WIDTH = 768;
const DEFAULT_STORY_ILLUSTRATION_HEIGHT = 1024;
const STORY_ILLUSTRATION_MODEL_KEYS = new Set(["animagine", "wai-nsfw-illustrious-v11"]);
const OPENING_SCENE_ID_PREFIX = "opening-";
const OPENING_SCENE_TITLE = "opening scene";
const DEFAULT_STORY_OPENING_SCENE_MAX_ENVIRONMENT_FRAGMENTS = 3;
const DEFAULT_STORY_OPENING_SCENE_MAX_ACTION_FRAGMENTS = 1;
const STORY_ANIMATION_MODEL_KEY = "wan-2.2-i2v-fast";
const DEFAULT_STORY_ANIMATION_PROMPT = "A lot of movements";

const STORY_ILLUSTRATION_WIDTH = parseIntegerEnv(
  process.env.STORY_ILLUSTRATION_WIDTH,
  DEFAULT_STORY_ILLUSTRATION_WIDTH,
  1
);
const STORY_ILLUSTRATION_HEIGHT = parseIntegerEnv(
  process.env.STORY_ILLUSTRATION_HEIGHT,
  DEFAULT_STORY_ILLUSTRATION_HEIGHT,
  1
);
const STORY_OPENING_SCENE_MAX_ENVIRONMENT_FRAGMENTS = parseIntegerEnv(
  process.env.STORY_OPENING_SCENE_MAX_ENVIRONMENT_FRAGMENTS,
  DEFAULT_STORY_OPENING_SCENE_MAX_ENVIRONMENT_FRAGMENTS,
  1
);
const STORY_OPENING_SCENE_MAX_ACTION_FRAGMENTS = parseIntegerEnv(
  process.env.STORY_OPENING_SCENE_MAX_ACTION_FRAGMENTS,
  DEFAULT_STORY_OPENING_SCENE_MAX_ACTION_FRAGMENTS,
  0
);

// STORY_ILLUSTRATION_MODEL_INPUT_MAP is resolved per-request via replicateModelConfig,
// so there is no static top-level map here; the config object is passed in via deps.

const resolveStoryIllustrationSize = (modelConfig = {}) => {
  const configuredSizes = Array.isArray(modelConfig?.sizes) ? modelConfig.sizes : [];
  const normalizedSizes = configuredSizes
    .map((size) => ({
      width: Number(size?.width),
      height: Number(size?.height),
    }))
    .filter((size) => Number.isFinite(size.width) && Number.isFinite(size.height));

  if (normalizedSizes.length === 0) return null;

  const exactMatch = normalizedSizes.find(
    (size) => size.width === STORY_ILLUSTRATION_WIDTH && size.height === STORY_ILLUSTRATION_HEIGHT
  );
  if (exactMatch) return exactMatch;

  const portraitMatch = normalizedSizes.find((size) => size.height > size.width);
  if (portraitMatch) return portraitMatch;

  return normalizedSizes[0];
};

const isOpeningSceneItem = (normalizePromptFragment, sceneItem = {}) => {
  const normalizedSceneId = normalizePromptFragment(sceneItem.sceneId || "").toLowerCase();
  const normalizedTitle = normalizePromptFragment(sceneItem.title || "").toLowerCase();
  return (
    normalizedSceneId.startsWith(OPENING_SCENE_ID_PREFIX) || normalizedTitle === OPENING_SCENE_TITLE
  );
};

const signSceneVideoUrl = async (
  s3Client,
  GetObjectCommand,
  getSignedUrl,
  bucket,
  sceneItem = {}
) => {
  if (!sceneItem.videoKey) return "";
  return signObjectUrl(s3Client, GetObjectCommand, getSignedUrl, bucket, sceneItem.videoKey);
};

const signSceneMusicUrl = async (
  s3Client,
  GetObjectCommand,
  getSignedUrl,
  bucket,
  sceneItem = {}
) => {
  if (!sceneItem.musicKey) return "";
  return signObjectUrl(s3Client, GetObjectCommand, getSignedUrl, bucket, sceneItem.musicKey);
};

const buildStorySceneVideoKey = (buildUserPrefix, userId = "", sessionId = "", sceneId = "") =>
  `${buildUserPrefix(userId)}stories/${sessionId}/scenes/${sceneId}.mp4`;

const buildDataUrl = ({ buffer, contentType }) =>
  `data:${contentType || "image/png"};base64,${buffer.toString("base64")}`;

module.exports = {
  parseIntegerEnv,
  DEFAULT_STORY_ILLUSTRATION_MODEL,
  DEFAULT_STORY_ILLUSTRATION_WIDTH,
  DEFAULT_STORY_ILLUSTRATION_HEIGHT,
  STORY_ILLUSTRATION_MODEL_KEYS,
  OPENING_SCENE_ID_PREFIX,
  OPENING_SCENE_TITLE,
  DEFAULT_STORY_OPENING_SCENE_MAX_ENVIRONMENT_FRAGMENTS,
  DEFAULT_STORY_OPENING_SCENE_MAX_ACTION_FRAGMENTS,
  STORY_ANIMATION_MODEL_KEY,
  DEFAULT_STORY_ANIMATION_PROMPT,
  STORY_ILLUSTRATION_WIDTH,
  STORY_ILLUSTRATION_HEIGHT,
  STORY_OPENING_SCENE_MAX_ENVIRONMENT_FRAGMENTS,
  STORY_OPENING_SCENE_MAX_ACTION_FRAGMENTS,
  resolveStoryIllustrationSize,
  isOpeningSceneItem,
  signSceneVideoUrl,
  signSceneMusicUrl,
  buildStorySceneVideoKey,
  buildDataUrl,
};
