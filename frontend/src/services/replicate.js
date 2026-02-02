import { buildApiUrl, buildUrlWithQuery, postJson, fetchJson } from "./apiClient";

export const generateReplicateImage = (baseUrl, payload) =>
  postJson(
    buildApiUrl(baseUrl, "/replicate/image/generate"),
    payload,
    "Failed to generate image."
  );

export const generateReplicateVideo = (baseUrl, payload) =>
  postJson(
    buildApiUrl(baseUrl, "/replicate/video/generate"),
    payload,
    "Failed to start video generation."
  );

export const getReplicateVideoStatus = (baseUrl, params) =>
  fetchJson(
    buildUrlWithQuery(baseUrl, "/replicate/video/status", params),
    {},
    "Failed to fetch prediction status."
  );
