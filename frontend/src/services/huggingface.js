import { buildApiUrl, postJson } from "./apiClient";

export const generateHuggingFaceImage = (baseUrl, payload) =>
  postJson(
    buildApiUrl(baseUrl, "/gradio/image/generate"),
    payload,
    "Failed to generate image."
  );
