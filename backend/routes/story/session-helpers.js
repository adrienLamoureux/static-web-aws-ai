// Pure utility functions shared by session-routes.js and session-item-routes.js

const toTimestamp = (value = "") => {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
};

const parseOptionalNumber = (value) => {
  if (value === null || value === "" || typeof value === "undefined") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const sortSessionsByRecent = (items = []) =>
  [...items].sort(
    (left, right) =>
      toTimestamp(right.updatedAt || right.createdAt) -
      toTimestamp(left.updatedAt || left.createdAt)
  );

const resolveSessionId = (item = {}) => {
  if (item.sessionId) return item.sessionId;
  if (typeof item.sk === "string" && item.sk.startsWith("SESSION#")) {
    return item.sk.slice("SESSION#".length);
  }
  return "";
};

const normalizeSessionItem = (item = {}) => ({
  ...item,
  sessionId: resolveSessionId(item),
});

const buildSessionResponse = (item = {}) => ({
  id: resolveSessionId(item),
  sessionId: resolveSessionId(item),
  title: item.title,
  presetId: item.presetId,
  protagonistName: item.protagonistName,
  synopsis: item.synopsis,
  characterId: item.characterId || null,
  loraProfileId: item.loraProfileId || null,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  turnCount: item.turnCount || 0,
  sceneCount: item.sceneCount || 0,
});

module.exports = {
  toTimestamp,
  parseOptionalNumber,
  sortSessionsByRecent,
  resolveSessionId,
  normalizeSessionItem,
  buildSessionResponse,
};
