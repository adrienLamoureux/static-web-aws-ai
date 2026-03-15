import { buildApiUrl, buildUrlWithQuery, fetchJson, postJson } from "./apiClient";

export const listImages = (baseUrl) =>
  fetchJson(buildApiUrl(baseUrl, "/s3/images"), {}, "Failed to load images.");

export const listVideos = (baseUrl, options = {}) => {
  if (typeof options === "boolean") {
    return fetchJson(
      buildApiUrl(baseUrl, `/s3/videos?includeUrls=${options}`),
      {},
      "Failed to load videos."
    );
  }
  const includeUrls = options?.includeUrls ?? true;
  const includePosters = options?.includePosters ?? false;
  const params = new URLSearchParams({
    includeUrls: String(includeUrls),
    includePosters: String(includePosters),
  });
  return fetchJson(
    buildApiUrl(baseUrl, `/s3/videos?${params.toString()}`),
    {},
    "Failed to load videos."
  );
};

export const deleteVideo = (baseUrl, key) =>
  postJson(
    buildApiUrl(baseUrl, "/s3/videos/delete"),
    { key },
    "Failed to delete video."
  );

export const deleteImage = (baseUrl, key) =>
  postJson(
    buildApiUrl(baseUrl, "/s3/images/delete"),
    { key },
    "Failed to delete image."
  );

export const setImageFavorite = (baseUrl, key, favorite) =>
  postJson(
    buildApiUrl(baseUrl, "/s3/images/favorite"),
    { key, favorite },
    "Failed to update image favorite."
  );

export const setVideoFavorite = (baseUrl, key, favorite) =>
  postJson(
    buildApiUrl(baseUrl, "/s3/videos/favorite"),
    { key, favorite },
    "Failed to update video favorite."
  );

export const shareImage = (baseUrl, key) =>
  postJson(
    buildApiUrl(baseUrl, "/s3/images/share"),
    { key },
    "Failed to share image."
  );

export const shareVideo = (baseUrl, key) =>
  postJson(
    buildApiUrl(baseUrl, "/s3/videos/share"),
    { key },
    "Failed to share video."
  );

export const listSharedImages = (baseUrl, params = {}) =>
  fetchJson(
    buildUrlWithQuery(baseUrl, "/s3/shared/images", params),
    {},
    "Failed to load shared images."
  );

export const listSharedVideos = (baseUrl, params = {}) =>
  fetchJson(
    buildUrlWithQuery(baseUrl, "/s3/shared/videos", params),
    {},
    "Failed to load shared videos."
  );

export const listSharedImageFavorites = (baseUrl) =>
  fetchJson(
    buildApiUrl(baseUrl, "/s3/shared/images/favorites"),
    {},
    "Failed to load favorites."
  );

export const setSharedImageFavorite = (baseUrl, key, favorite) =>
  postJson(
    buildApiUrl(baseUrl, "/s3/shared/images/favorites"),
    { key, favorite },
    "Failed to update favorite."
  );

export const requestImageUploadUrl = (baseUrl, payload) =>
  postJson(
    buildApiUrl(baseUrl, "/s3/image-upload-url"),
    payload,
    "Failed to request upload URL."
  );

export const putFileToUrl = async (url, file, contentType) => {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!response.ok) {
    throw new Error("S3 upload failed. Please retry.");
  }
};
