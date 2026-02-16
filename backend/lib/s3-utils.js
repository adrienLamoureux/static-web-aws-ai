const {
  GetObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const { buildSafeBaseName } = require("./image-utils");

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const deleteS3ObjectsByPrefix = async (s3Client, bucket, prefix) => {
  if (!bucket || !prefix) return;
  let continuationToken;
  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    const keys = (response.Contents || [])
      .map((item) => item.Key)
      .filter(Boolean);
    for (const key of keys) {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );
    }
    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);
};

const fetchS3ImageBuffer = async (s3Client, bucket, key) => {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
  const buffer = await streamToBuffer(response.Body);
  const contentType = response.ContentType || "image/jpeg";
  return { buffer, contentType };
};

const buildVideoOutputKey = (inputKey = "", outputPrefix = "videos/") => {
  const baseName = inputKey.split("/").pop()?.replace(/\.[^.]+$/, "") || "video";
  const safeBase = buildSafeBaseName(baseName);
  const inputPrefixMatch = inputKey.match(/^(users\/[^/]+\/)/);
  const userPrefix = inputPrefixMatch ? inputPrefixMatch[1] : "";
  const normalizedPrefix = outputPrefix.startsWith("users/")
    ? outputPrefix
    : `${userPrefix}${outputPrefix}`;
  return `${normalizedPrefix}${safeBase}.mp4`;
};

const encodeS3Key = (key = "") =>
  encodeURIComponent(key).replace(/%2F/g, "/");

const buildVideoPosterKeyFromVideoKey = (videoKey = "") => {
  if (!videoKey) return "";
  if (videoKey.endsWith("/output.mp4")) {
    return videoKey.replace(/\/output\.mp4$/, "/poster.jpg");
  }
  if (videoKey.endsWith(".mp4")) {
    return videoKey.replace(/\.mp4$/, ".jpg");
  }
  return "";
};

const buildVideoPosterKeyFromPrefix = (outputPrefix = "videos/") => {
  const safePrefix = outputPrefix.endsWith("/")
    ? outputPrefix
    : `${outputPrefix}/`;
  return `${safePrefix}poster.jpg`;
};

const buildFolderPosterKeyFromVideoKey = (videoKey = "") => {
  if (!videoKey) return "";
  const marker = "/videos/";
  const markerIndex = videoKey.indexOf(marker);
  if (markerIndex === -1) return "";
  const lastSlash = videoKey.lastIndexOf("/");
  if (lastSlash <= markerIndex + marker.length - 1) {
    return "";
  }
  return `${videoKey.slice(0, lastSlash + 1)}poster.jpg`;
};

const resolveVideoPosterKey = (videoKey = "", objectKeys = new Set()) => {
  if (!videoKey) return "";
  const directKey = buildVideoPosterKeyFromVideoKey(videoKey);
  if (directKey && objectKeys.has(directKey)) {
    return directKey;
  }
  const lastSlash = videoKey.lastIndexOf("/");
  if (lastSlash >= 0) {
    const fallbackKey = `${videoKey.slice(0, lastSlash + 1)}poster.jpg`;
    if (objectKeys.has(fallbackKey)) {
      return fallbackKey;
    }
  }
  return "";
};

const copyS3Object = async ({ s3Client, bucket, sourceKey, destinationKey }) => {
  if (!bucket || !sourceKey || !destinationKey) return;
  const copySource = `${bucket}/${encodeS3Key(sourceKey)}`;
  await s3Client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: copySource,
      Key: destinationKey,
    })
  );
};

module.exports = {
  streamToBuffer,
  deleteS3ObjectsByPrefix,
  fetchS3ImageBuffer,
  buildVideoOutputKey,
  encodeS3Key,
  buildVideoPosterKeyFromVideoKey,
  buildVideoPosterKeyFromPrefix,
  buildFolderPosterKeyFromVideoKey,
  resolveVideoPosterKey,
  copyS3Object,
};
