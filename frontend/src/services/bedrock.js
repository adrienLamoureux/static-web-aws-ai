import { buildApiUrl, buildUrlWithQuery, fetchJson, postJson } from "./apiClient";

export const fetchApiStatus = (baseUrl) =>
  fetchJson(buildApiUrl(baseUrl, "/"), {}, "Failed to load API status.");

export const generateBedrockImage = (baseUrl, payload) =>
  postJson(
    buildApiUrl(baseUrl, "/bedrock/image/generate"),
    payload,
    "Failed to generate image."
  );

export const generatePromptHelper = (baseUrl, payload) =>
  postJson(
    buildApiUrl(baseUrl, "/bedrock/prompt-helper"),
    payload,
    "Prompt helper failed."
  );

export const generateNovaReelVideo = (baseUrl, payload) =>
  postJson(
    buildApiUrl(baseUrl, "/bedrock/nova-reel/image-to-video-s3"),
    payload,
    "Failed to start video generation."
  );

export const getNovaReelJobStatus = (baseUrl, params) =>
  fetchJson(
    buildUrlWithQuery(baseUrl, "/bedrock/nova-reel/job-status", params),
    {},
    "Failed to fetch job status."
  );
