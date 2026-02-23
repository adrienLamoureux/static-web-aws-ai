import {
  buildApiUrl,
  buildUrlWithQuery,
  fetchJson,
  postJson,
  deleteJson,
} from "./apiClient";

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

export const startStorySceneAnimation = (
  baseUrl,
  sessionId,
  sceneId,
  payload
) =>
  postJson(
    buildApiUrl(baseUrl, `/story/sessions/${sessionId}/scenes/${sceneId}/animation`),
    payload,
    "Failed to start scene animation."
  );

export const getStorySceneAnimationStatus = (
  baseUrl,
  sessionId,
  sceneId,
  params = {}
) =>
  fetchJson(
    buildUrlWithQuery(
      baseUrl,
      `/story/sessions/${sessionId}/scenes/${sceneId}/animation`,
      params
    ),
    {},
    "Failed to fetch scene animation status."
  );

export const startStorySceneMusic = (
  baseUrl,
  sessionId,
  sceneId,
  payload
) =>
  postJson(
    buildApiUrl(baseUrl, `/story/sessions/${sessionId}/scenes/${sceneId}/music`),
    payload,
    "Failed to start scene music generation."
  );

export const getStorySceneMusicStatus = (
  baseUrl,
  sessionId,
  sceneId,
  params = {}
) =>
  fetchJson(
    buildUrlWithQuery(
      baseUrl,
      `/story/sessions/${sessionId}/scenes/${sceneId}/music`,
      params
    ),
    {},
    "Failed to fetch scene music status."
  );

export const saveStorySceneMusicToLibrary = (
  baseUrl,
  sessionId,
  sceneId,
  payload = {}
) =>
  postJson(
    buildApiUrl(
      baseUrl,
      `/story/sessions/${sessionId}/scenes/${sceneId}/music/favorite`
    ),
    payload,
    "Failed to save soundtrack to library."
  );

export const recommendStorySceneMusic = (baseUrl, sessionId, sceneId) =>
  postJson(
    buildApiUrl(
      baseUrl,
      `/story/sessions/${sessionId}/scenes/${sceneId}/music/recommend`
    ),
    {},
    "Failed to recommend soundtrack for scene."
  );

export const listStoryMusicLibrary = (baseUrl, params = {}) =>
  fetchJson(
    buildUrlWithQuery(baseUrl, "/story/music-library", params),
    {},
    "Failed to load soundtrack library."
  );

export const requestStoryMusicUploadUrl = (baseUrl, payload) =>
  postJson(
    buildApiUrl(baseUrl, "/story/music-library/upload-url"),
    payload,
    "Failed to request music upload URL."
  );

export const saveUploadedStoryMusicTrack = (baseUrl, payload) =>
  postJson(
    buildApiUrl(baseUrl, "/story/music-library/upload"),
    payload,
    "Failed to save uploaded music track."
  );

export const selectStorySceneLibraryTrack = (
  baseUrl,
  sessionId,
  sceneId,
  payload
) =>
  postJson(
    buildApiUrl(
      baseUrl,
      `/story/sessions/${sessionId}/scenes/${sceneId}/music/select`
    ),
    payload,
    "Failed to apply soundtrack from library."
  );

export const deleteStorySession = (baseUrl, sessionId) =>
  deleteJson(
    buildApiUrl(baseUrl, `/story/sessions/${sessionId}`),
    "Failed to delete story session."
  );
