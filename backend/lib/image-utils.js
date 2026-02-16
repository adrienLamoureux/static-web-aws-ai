const Jimp = require("jimp");

const { buildUserPrefix } = require("./keys");

const buildSafeBaseName = (value = "") => {
  const safeValue = value.replace(/[^a-zA-Z0-9._-]/g, "").trim();
  return safeValue || "image";
};

const buildImageKey = ({
  userId = "",
  provider = "bedrock",
  index = 0,
  baseName = "",
  batchId = "",
}) => {
  const safeProvider = provider.replace(/[^a-zA-Z0-9-_]/g, "");
  const safeBase = buildSafeBaseName(baseName);
  const safeBatch = batchId.replace(/[^a-zA-Z0-9-_]/g, "");
  const prefix = userId ? buildUserPrefix(userId) : "";
  if (safeBatch) {
    return `${prefix}images/${safeProvider}/${safeBatch}/${safeBase}-${index}.png`;
  }
  return `${prefix}images/${safeProvider}/${safeBase}-${Date.now()}-${index}.png`;
};

const buildImageBatchId = () =>
  `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildSeedList = (count, seed) => {
  const baseSeed = Number.isFinite(Number(seed))
    ? Number(seed)
    : Math.floor(Math.random() * 2147483647);
  return Array.from({ length: count }, (_, index) => baseSeed + index);
};

const buildVideoReadyKey = (sourceKey = "") => {
  const baseName = sourceKey.split("/").pop()?.replace(/\.[^.]+$/, "") || "image";
  const safeBase = buildSafeBaseName(baseName);
  const prefixMatch = sourceKey.match(/^(users\/[^/]+\/)/);
  const prefix = prefixMatch ? prefixMatch[1] : "";
  return `${prefix}images/video-ready/${safeBase}.jpg`;
};

const toVideoReadyBuffer = async (buffer) => {
  const image = await Jimp.read(buffer);
  image.cover(1280, 720);
  image.quality(90);
  return image.getBufferAsync(Jimp.MIME_JPEG);
};

const fetchImageBuffer = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const contentType =
    response.headers.get("content-type") || "image/png";
  return { buffer: Buffer.from(arrayBuffer), contentType };
};

const isDataUrl = (value = "") => /^data:/i.test(value);

const decodeDataUrl = (value = "") => {
  const match = value.match(/^data:([^;]+);base64,(.*)$/i);
  if (!match) {
    throw new Error("Unsupported data URL format");
  }
  const [, contentType, base64] = match;
  return { buffer: Buffer.from(base64, "base64"), contentType };
};

const looksLikeBase64 = (value = "") =>
  /^[a-z0-9+/=]+$/i.test(value) && value.length > 256;

const resolveGradioImageBuffer = async (output) => {
  if (!output) {
    throw new Error("No image returned from Gradio");
  }
  if (Array.isArray(output)) {
    if (!output.length) {
      throw new Error("No image returned from Gradio");
    }
    return resolveGradioImageBuffer(output[0]);
  }
  if (typeof output === "string") {
    if (isDataUrl(output)) {
      return decodeDataUrl(output);
    }
    if (/^https?:\/\//i.test(output)) {
      return fetchImageBuffer(output);
    }
    if (looksLikeBase64(output)) {
      return { buffer: Buffer.from(output, "base64"), contentType: "image/png" };
    }
    throw new Error("Unsupported Gradio image output");
  }
  if (typeof output === "object") {
    if (output.image) {
      return resolveGradioImageBuffer(output.image);
    }
    const url = output.url || output.path || output.data;
    if (typeof url === "string") {
      return resolveGradioImageBuffer(url);
    }
  }
  throw new Error("Unsupported Gradio image output");
};

module.exports = {
  buildSafeBaseName,
  buildImageKey,
  buildImageBatchId,
  buildSeedList,
  buildVideoReadyKey,
  toVideoReadyBuffer,
  fetchImageBuffer,
  isDataUrl,
  decodeDataUrl,
  looksLikeBase64,
  resolveGradioImageBuffer,
};
