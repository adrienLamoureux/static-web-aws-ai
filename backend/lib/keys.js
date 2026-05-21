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

// ─── Agent mode keys ──────────────────────────────────────────────────────────
// pk = USER#{userId}
// sk = AGENT#{modelId}                    → agent state record (summary, turnCount, updatedAt)
// sk = AGENT#{modelId}#MSG#{timestamp13}  → individual agent turn message
//
// Separate from COMPANION# so agent task context (short-lived) doesn't pollute
// the long-lived companion identity memory.
const buildAgentStateSk = (modelId = "default") => `AGENT#${modelId}`;
const buildAgentMsgSk = (modelId = "default", timestamp = Date.now()) =>
  `AGENT#${modelId}#MSG#${String(timestamp).padStart(13, "0")}`;
const agentMsgPrefix = (modelId = "default") => `AGENT#${modelId}#MSG#`;

// Cross-session agent preferences (single record per user, not per-model).
// Holds { lastStyle, lastAspect, lastLora, theme, updatedAt }
const buildAgentPrefsSk = () => "AGENT#STATE";

// Rate-limit bucket for the agent endpoints (token bucket per user).
// Holds { tokens, refilledAt, updatedAt }
const buildAgentRateLimitSk = () => "AGENT#RATE";

// Per-user running totals for agent cost telemetry.
// Holds { inputTokens, outputTokens, turnCount, lastUpdatedAt }
const buildAgentCostSk = () => "AGENT#COST";

// Per-user daily image generation counter. Separate from AGENT#COST so the
// image cap rolls over independently of the token cap.
// Holds { imagesToday, dayStartedAt, totalImages, lastUpdatedAt }
const buildAgentImageCountSk = () => "AGENT#IMG_COUNT";

// Named agent conversation sessions (v1.7). The session id doubles as the
// memory namespace — agent-memory uses it where it used to use "modelId".
// Holds { name, createdAt, lastUsedAt }.
const buildAgentSessionSk = (sessionId = "default") => `AGENT#SESSION#${sessionId}`;
const agentSessionPrefix = () => "AGENT#SESSION#";

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
  buildAgentStateSk,
  buildAgentMsgSk,
  agentMsgPrefix,
  buildAgentPrefsSk,
  buildAgentRateLimitSk,
  buildAgentCostSk,
  buildAgentImageCountSk,
  buildAgentSessionSk,
  agentSessionPrefix,
};
