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
const buildStorySceneSk = (sessionId = "", sceneId = "") => `SESSION#${sessionId}#SCENE#${sceneId}`;
const storyMessagePrefix = (sessionId = "") => `SESSION#${sessionId}#MSG#`;
const storyScenePrefix = (sessionId = "") => `SESSION#${sessionId}#SCENE#`;

// ─── Companion memory keys ────────────────────────────────────────────────────
// pk = USER#{userId}
// sk = COMPANION#{modelId}                    → memory record (summary, turnCount, updatedAt)
// sk = COMPANION#{modelId}#MSG#{timestamp13}  → individual message turn
const buildCompanionMemorySk = (modelId = "hiyori_free") => `COMPANION#${modelId}`;
const buildCompanionMsgSk = (modelId = "hiyori_free", timestamp = Date.now()) =>
  `COMPANION#${modelId}#MSG#${String(timestamp).padStart(13, "0")}`;
const companionMsgPrefix = (modelId = "hiyori_free") => `COMPANION#${modelId}#MSG#`;

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
  buildCompanionMemorySk,
  buildCompanionMsgSk,
  companionMsgPrefix,
};
