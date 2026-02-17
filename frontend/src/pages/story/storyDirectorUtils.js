import { STORY_GROUP_TYPES } from "./constants";

export const BOARD_STORAGE_KEY = "story-director-board-v1";
export const DEFAULT_BUDGET_CAP = 2400;

export const readBoardState = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(BOARD_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const buildDefaultBoard = (groupType) => {
  const label = STORY_GROUP_TYPES.find((item) => item.value === groupType)?.label || "Chapter";
  const defaultGroupId = `${groupType}-1`;
  return {
    groups: [{ id: defaultGroupId, name: `${label} 1` }],
    assignments: {},
    activeGroupId: defaultGroupId,
  };
};

export const normalizeBoard = (board, groupType) => {
  const fallback = buildDefaultBoard(groupType);
  if (!board || typeof board !== "object") return fallback;

  const groups = Array.isArray(board.groups) && board.groups.length > 0
    ? board.groups
    : fallback.groups;

  const assignments =
    board.assignments && typeof board.assignments === "object"
      ? board.assignments
      : {};

  const activeGroupId =
    board.activeGroupId === "all" || groups.some((group) => group.id === board.activeGroupId)
      ? board.activeGroupId
      : groups[0].id;

  return { groups, assignments, activeGroupId };
};

export const toTimestamp = (value) => {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const formatStamp = (value) => {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "Unknown time";
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const tokenize = (value = "") =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);

export const buildMemoryItems = (messages = [], scenes = []) => {
  const messageItems = messages.map((message, index) => ({
    id: `message-${index}`,
    type: "message",
    title: message.role === "user" ? "Player turn" : "Narrator reply",
    detail: message.content,
    createdAt: message.createdAt,
    text: message.content || "",
  }));

  const sceneItems = scenes.map((scene, index) => ({
    id: `scene-${scene.sceneId || index}`,
    type: "scene",
    title: scene.title || "Scene beat",
    detail: scene.description || scene.prompt || "",
    createdAt: scene.createdAt,
    text: `${scene.title || ""} ${scene.description || ""} ${scene.prompt || ""}`,
  }));

  return [...messageItems, ...sceneItems].sort(
    (a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt)
  );
};

export const computeRelevance = (text, query) => {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;

  const textTokens = new Set(tokenize(text));
  return queryTokens.reduce((score, token) => score + (textTokens.has(token) ? 1 : 0), 0);
};

export const getLatestDebugContext = (scenes = []) => {
  const sortedScenes = [...scenes].sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));
  const latestWithDebug = sortedScenes.find((scene) => scene?.debug?.context);
  return latestWithDebug?.debug?.context || null;
};
