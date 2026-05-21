import {
  buildApiUrl,
  buildUrlWithQuery,
  fetchJson,
  postJson,
  putJson,
  deleteJson,
} from "./apiClient";

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

export const fetchDirectorAppConfig = async (apiBaseUrl) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/app-config");
  return fetchJson(url, {}, "Failed to load app config.");
};

export const saveDirectorAppConfig = async (apiBaseUrl, payload) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/app-config");
  return postJson(url, payload, "Failed to save app config.");
};

export const listDirectorMasonryImages = async (apiBaseUrl) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/masonry/images");
  return fetchJson(url, {}, "Failed to load masonry images.");
};

export const requestDirectorMasonryUploadUrl = async (apiBaseUrl, payload) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/masonry/upload-url");
  return postJson(url, payload, "Failed to request masonry upload URL.");
};

export const deleteDirectorMasonryImage = async (apiBaseUrl, payload) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/masonry/images/delete");
  return postJson(url, payload, "Failed to delete masonry image.");
};

export const fetchDashboard = async (apiBaseUrl) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/dashboard");
  return fetchJson(url, {}, "Failed to load dashboard.");
};

export const fetchCompanionModel = async (apiBaseUrl) => {
  const url = buildApiUrl(apiBaseUrl, "/api/admin/companion-model");
  return fetchJson(url, {}, "Failed to load companion model.");
};

export const saveCompanionModel = async (apiBaseUrl, { modelId }) => {
  const url = buildApiUrl(apiBaseUrl, "/api/admin/companion-model");
  return putJson(url, { modelId }, "Failed to save companion model.");
};

export const retryDirectorJob = async (apiBaseUrl, { jobKey }) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/jobs/retry");
  return postJson(url, { jobKey }, "Failed to retry job.");
};

export const cancelDirectorJob = async (apiBaseUrl, { jobKey }) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/jobs/cancel");
  return postJson(url, { jobKey }, "Failed to cancel job.");
};

export const fetchAllStorySessions = async (apiBaseUrl, { limit = 100 } = {}) => {
  const url = buildUrlWithQuery(apiBaseUrl, "/ops/director/story/sessions/all", { limit });
  return fetchJson(url, {}, "Failed to load all story sessions.");
};

export const fetchCompanionMemory = async (apiBaseUrl, { userId, modelId }) => {
  const url = buildUrlWithQuery(apiBaseUrl, "/ops/director/companion/memory", { userId, modelId });
  return fetchJson(url, {}, "Failed to load companion memory.");
};

export const clearCompanionMemoryAdmin = async (apiBaseUrl, { userId, modelId }) => {
  const url = buildUrlWithQuery(apiBaseUrl, "/ops/director/companion/memory", { userId, modelId });
  return deleteJson(url, "Failed to clear companion memory.");
};

export const fetchDirectorUsage = async (apiBaseUrl, { window: w = "24h" } = {}) => {
  const url = buildUrlWithQuery(apiBaseUrl, "/ops/director/usage", { window: w });
  return fetchJson(url, {}, "Failed to load usage data.");
};

export const listSharedImagesAdmin = async (
  apiBaseUrl,
  { limit = 120, continuationToken } = {}
) => {
  const url = buildUrlWithQuery(apiBaseUrl, "/ops/director/media/shared/images", {
    limit,
    continuationToken,
  });
  return fetchJson(url, {}, "Failed to list shared images.");
};

export const deleteSharedImageAdmin = async (apiBaseUrl, { key }) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/media/shared/images/delete");
  return postJson(url, { key }, "Failed to delete shared image.");
};

export const listSharedVideosAdmin = async (
  apiBaseUrl,
  { limit = 120, continuationToken } = {}
) => {
  const url = buildUrlWithQuery(apiBaseUrl, "/ops/director/media/shared/videos", {
    limit,
    continuationToken,
  });
  return fetchJson(url, {}, "Failed to list shared videos.");
};

export const deleteSharedVideoAdmin = async (apiBaseUrl, { key }) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/media/shared/videos/delete");
  return postJson(url, { key }, "Failed to delete shared video.");
};

export const fetchFeatureFlags = async (apiBaseUrl) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/features");
  return fetchJson(url, {}, "Failed to load feature flags.");
};

export const saveFeatureFlags = async (apiBaseUrl, { flags }) => {
  const url = buildApiUrl(apiBaseUrl, "/ops/director/features");
  return putJson(url, { flags }, "Failed to save feature flags.");
};

export const fetchAgentCost = async (apiBaseUrl, { limit = 50 } = {}) => {
  const url = buildApiUrl(apiBaseUrl, `/api/admin/agent/cost?limit=${encodeURIComponent(limit)}`);
  return fetchJson(url, {}, "Failed to load agent cost telemetry.");
};

export const fetchAgentModel = async (apiBaseUrl) => {
  const url = buildApiUrl(apiBaseUrl, "/api/admin/agent/model");
  return fetchJson(url, {}, "Failed to load agent model.");
};

export const saveAgentModel = async (apiBaseUrl, modelId) => {
  const url = buildApiUrl(apiBaseUrl, "/api/admin/agent/model");
  return putJson(url, { modelId }, "Failed to save agent model.");
};
