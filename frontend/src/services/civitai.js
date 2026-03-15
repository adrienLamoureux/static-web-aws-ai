import { buildApiUrl, buildUrlWithQuery, fetchJson, postJson } from "./apiClient";

export const generateCivitaiImage = (baseUrl, payload) =>
  postJson(
    buildApiUrl(baseUrl, "/civitai/image/generate"),
    payload,
    "Failed to start CivitAI image generation."
  );

export const getCivitaiImageStatus = (baseUrl, params) =>
  fetchJson(
    buildUrlWithQuery(baseUrl, "/civitai/image/status", params),
    {},
    "Failed to fetch CivitAI job status."
  );
