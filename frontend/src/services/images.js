import { buildApiUrl, postJson } from "./apiClient";

export const createVideoReadyImage = (baseUrl, key) =>
  postJson(
    buildApiUrl(baseUrl, "/images/video-ready"),
    { key },
    "Failed to create video-ready image."
  );

export const selectGeneratedImage = (baseUrl, key) =>
  postJson(
    buildApiUrl(baseUrl, "/images/select"),
    { key },
    "Image selection failed."
  );
