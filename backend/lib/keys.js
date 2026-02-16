const buildUserPrefix = (userId = "") => `users/${userId}/`;

const ensureUserKey = (key = "", userId = "") => {
  const prefix = buildUserPrefix(userId);
  if (!key.startsWith(prefix)) {
    throw new Error("key must belong to the current user");
  }
};

const buildMediaPk = (userId = "") => `USER#${userId}`;
const buildMediaSk = (type = "IMG", key = "") => `${type}#${key}`;
const buildStoryPresetPk = () => "PRESET#STORY";
const buildStoryPresetSk = (presetId = "") => `PRESET#${presetId}`;
const buildStoryCharacterPk = () => "PRESET#CHARACTER";
const buildStoryCharacterSk = (characterId = "") => `CHARACTER#${characterId}`;
const buildPromptHelperPk = () => "PRESET#PROMPT_HELPER";
const buildPromptHelperSk = (key = "") => `OPTIONS#${key.toUpperCase()}`;
const buildStorySessionSk = (sessionId = "") => `SESSION#${sessionId}`;
const buildStoryMessageSk = (sessionId = "", timestamp = Date.now()) =>
  `SESSION#${sessionId}#MSG#${String(timestamp).padStart(13, "0")}`;
const buildStorySceneSk = (sessionId = "", sceneId = "") =>
  `SESSION#${sessionId}#SCENE#${sceneId}`;
const storyMessagePrefix = (sessionId = "") => `SESSION#${sessionId}#MSG#`;
const storyScenePrefix = (sessionId = "") => `SESSION#${sessionId}#SCENE#`;

module.exports = {
  buildUserPrefix,
  ensureUserKey,
  buildMediaPk,
  buildMediaSk,
  buildStoryPresetPk,
  buildStoryPresetSk,
  buildStoryCharacterPk,
  buildStoryCharacterSk,
  buildPromptHelperPk,
  buildPromptHelperSk,
  buildStorySessionSk,
  buildStoryMessageSk,
  buildStorySceneSk,
  storyMessagePrefix,
  storyScenePrefix,
};
