import { buildApiUrl, fetchJson, postJson, deleteJson } from "./apiClient";

export const listStoryPresets = (baseUrl) =>
  fetchJson(
    buildApiUrl(baseUrl, "/story/presets"),
    {},
    "Failed to load story presets."
  );

export const listStorySessions = (baseUrl) =>
  fetchJson(
    buildApiUrl(baseUrl, "/story/sessions"),
    {},
    "Failed to load story sessions."
  );

export const listStoryCharacters = (baseUrl) =>
  fetchJson(
    buildApiUrl(baseUrl, "/story/characters"),
    {},
    "Failed to load story characters."
  );

export const createStorySession = (baseUrl, payload) =>
  postJson(
    buildApiUrl(baseUrl, "/story/sessions"),
    payload,
    "Failed to create story session."
  );

export const getStorySession = (baseUrl, sessionId) =>
  fetchJson(
    buildApiUrl(baseUrl, `/story/sessions/${sessionId}`),
    {},
    "Failed to load story session."
  );

export const sendStoryMessage = (baseUrl, sessionId, payload) =>
  postJson(
    buildApiUrl(baseUrl, `/story/sessions/${sessionId}/message`),
    payload,
    "Failed to send message."
  );

export const generateStoryIllustration = (baseUrl, sessionId, payload, options = {}) =>
  postJson(
    buildApiUrl(
      baseUrl,
      `/story/sessions/${sessionId}/illustrations${
        options.debug ? "?debug=true" : ""
      }`
    ),
    payload,
    "Failed to generate illustration."
  );

export const deleteStorySession = (baseUrl, sessionId) =>
  deleteJson(
    buildApiUrl(baseUrl, `/story/sessions/${sessionId}`),
    "Failed to delete story session."
  );
