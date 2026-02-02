import { buildApiUrl, fetchJson, postJson } from "./apiClient";

export const listImages = (baseUrl) =>
  fetchJson(buildApiUrl(baseUrl, "/s3/images"), {}, "Failed to load images.");

export const listVideos = (baseUrl) =>
  fetchJson(
    buildApiUrl(baseUrl, "/s3/videos?includeUrls=true"),
    {},
    "Failed to load videos."
  );

export const deleteImage = (baseUrl, key) =>
  postJson(
    buildApiUrl(baseUrl, "/s3/images/delete"),
    { key },
    "Failed to delete image."
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
