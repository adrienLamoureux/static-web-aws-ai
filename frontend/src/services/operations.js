import { buildApiUrl, fetchJson, postJson } from "./apiClient";

export const fetchOperationalDashboard = async (apiBaseUrl) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/dashboard");
  return fetchJson(url, {}, "Failed to load operational dashboard.");
};

export const fetchDirectorOverview = async (apiBaseUrl) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/overview");
  return fetchJson(url, {}, "Failed to load director overview.");
};

export const fetchDirectorConfig = async (apiBaseUrl) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/config");
  return fetchJson(url, {}, "Failed to load director config.");
};

export const saveDirectorConfig = async (apiBaseUrl, payload) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/config");
  return postJson(url, payload, "Failed to save director config.");
};

export const prioritizeDirectorJob = async (apiBaseUrl, payload) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/jobs/prioritize");
  return postJson(url, payload, "Failed to prioritize job.");
};

export const pinDirectorStorySession = async (apiBaseUrl, payload) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/story/sessions/pin");
  return postJson(url, payload, "Failed to update story session pin.");
};

export const normalizeDirectorSoundMetadata = async (apiBaseUrl, payload = {}) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/sound/normalize");
  return postJson(url, payload, "Failed to normalize sound metadata.");
};
