const { Router } = require("express");

module.exports = function registerUserMediaRoutes(deps) {
  const {
    buildSafeBaseName,
    buildUserPrefix,
    getSignedUrl,
    s3Client,
    PutObjectCommand,
    ensureUserKey,
    GetObjectCommand,
    streamToBuffer,
    buildVideoReadyKey,
    Jimp,
    toVideoReadyBuffer,
    copyS3Object,
    putMediaItem,
    queryMediaItems,
    ListObjectsV2Command,
    DeleteObjectCommand,
    deleteMediaItem,
  } = deps;

  const SHARED_IMAGE_PREFIX = "shared/images/";
  const SHARED_URL_EXPIRATION_SECONDS = 900;

  const splitFileName = (
    key = "",
    fallbackBaseName = "asset",
    fallbackExtension = "jpg"
  ) => {
    const rawName = String(key || "").split("/").pop() || "";
    const extensionIndex = rawName.lastIndexOf(".");
    if (extensionIndex > 0 && extensionIndex < rawName.length - 1) {
      return {
        baseName: rawName.slice(0, extensionIndex),
        extension: rawName.slice(extensionIndex + 1).toLowerCase(),
      };
    }
    return {
      baseName: rawName || fallbackBaseName,
      extension: fallbackExtension,
    };
  };

  const buildSharedKey = ({ sourceKey, sharedPrefix, defaultExtension }) => {
    const { baseName, extension } = splitFileName(
      sourceKey,
      "shared-asset",
      defaultExtension
    );
    const safeBaseName = buildSafeBaseName(baseName || "shared-asset");
    const resolvedExtension = extension || defaultExtension;
    return `${sharedPrefix}${safeBaseName}-${Date.now()}.${resolvedExtension}`;
  };

  const router = Router();

  router.post("/s3/image-upload-url", deps.requireUserMiddleware, async (req, res) => {
    const bucket = process.env.MEDIA_BUCKET;
    const userId = req.user?.sub;
    const fileName = req.body?.fileName || "upload";
    const contentType = req.body?.contentType || "application/octet-stream";

    if (!bucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const safeBase = buildSafeBaseName(fileName);
    const extension = contentType.includes("png") ? "png" : "jpg";
    const key = `${buildUserPrefix(userId)}images/uploads/${safeBase}-${Date.now()}.${extension}`;

    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      });
      const url = await getSignedUrl(s3Client, command, { expiresIn: 900 });
      res.json({ bucket, key, url });
    } catch (error) {
      res.status(500).json({
        message: "Failed to generate upload URL",
        error: error?.message || String(error),
      });
    }
  });

  router.post("/images/video-ready", deps.requireUserMiddleware, async (req, res) => {
    const bucket = process.env.MEDIA_BUCKET;
    const userId = req.user?.sub;
    const key = req.body?.key;

    if (!bucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!key || typeof key !== "string") {
      return res.status(400).json({ message: "key is required" });
    }
    try {
      ensureUserKey(key, userId);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const getResponse = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );
      const buffer = await streamToBuffer(getResponse.Body);
      const videoReadyKey = buildVideoReadyKey(key);
      let shouldCopy = false;
      let videoReadyBuffer = buffer;
      try {
        const image = await Jimp.read(buffer);
        if (image.bitmap.width === 1280 && image.bitmap.height === 720) {
          shouldCopy = true;
        } else {
          videoReadyBuffer = await toVideoReadyBuffer(buffer);
        }
      } catch (error) {
        console.warn("Failed to validate/convert uploaded image:", {
          message: error?.message || String(error),
        });
        shouldCopy = true;
      }

      if (shouldCopy) {
        await copyS3Object({
          bucket,
          sourceKey: key,
          destinationKey: videoReadyKey,
        });
      } else {
        await s3Client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: videoReadyKey,
            Body: videoReadyBuffer,
            ContentType: "image/jpeg",
          })
        );
      }

      await putMediaItem({
        userId,
        type: "IMG",
        key,
      });

      const url = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: videoReadyKey,
        }),
        { expiresIn: 900 }
      );

      res.json({ key, videoReadyKey, url });
    } catch (error) {
      res.status(500).json({
        message: "Failed to create video-ready image",
        error: error?.message || String(error),
      });
    }
  });

  router.post("/s3/images/delete", deps.requireUserMiddleware, async (req, res) => {
    const bucket = process.env.MEDIA_BUCKET;
    const key = req.body?.key;
    const userId = req.user?.sub;

    if (!bucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!key || typeof key !== "string") {
      return res.status(400).json({ message: "key is required" });
    }
    try {
      ensureUserKey(key, userId);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const videoReadyKey = buildVideoReadyKey(key);
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );
      if (videoReadyKey) {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: videoReadyKey,
          })
        );
      }
      await deleteMediaItem({ userId, type: "IMG", key });
      res.json({ key, deleted: true });
    } catch (error) {
      res.status(500).json({
        message: "Failed to delete image",
        error: error?.message || String(error),
      });
    }
  });

  router.get("/s3/images", deps.requireUserMiddleware, async (req, res) => {
    const bucket = process.env.MEDIA_BUCKET;
    const maxKeys = Number(req.query?.maxKeys) || 100;
    const urlExpirationSeconds = 900;
    const userId = req.user?.sub;

    if (!bucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const items = await queryMediaItems({ userId, type: "IMG" });
      let images = items
        .map((item) => ({
          key: item.key,
          createdAt: item.createdAt,
        }))
        .filter((item) => !item.key?.includes("/images/video-ready/"))
        .slice(0, Math.min(maxKeys, 1000));

      if (images.length === 0) {
        const userPrefix = buildUserPrefix(userId);
        const response = await s3Client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: `${userPrefix}images/`,
            MaxKeys: Math.min(maxKeys, 1000),
          })
        );
        images = (response.Contents || [])
          .map((item) => item.Key)
          .filter((key) => key && key !== `${userPrefix}images/`)
          .filter((key) => !key.includes("/images/video-ready/"))
          .sort((a, b) => a.localeCompare(b))
          .map((key) => ({ key }));

        await Promise.all(
          images.map((item) =>
            putMediaItem({ userId, type: "IMG", key: item.key })
          )
        );
      }

      const signed = await Promise.all(
        images.map(async (image) => {
          const command = new GetObjectCommand({
            Bucket: bucket,
            Key: image.key,
          });
          const url = await getSignedUrl(s3Client, command, {
            expiresIn: urlExpirationSeconds,
          });
          return { key: image.key, url };
        })
      );

      res.json({ bucket, images: signed });
    } catch (error) {
      res.status(500).json({
        message: "Failed to list images",
        error: error?.message || String(error),
      });
    }
  });

  router.post("/s3/images/share", deps.requireUserMiddleware, async (req, res) => {
    const bucket = process.env.MEDIA_BUCKET;
    const userId = req.user?.sub;
    const key = req.body?.key;

    if (!bucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!key || typeof key !== "string") {
      return res.status(400).json({ message: "key is required" });
    }
    try {
      ensureUserKey(key, userId);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const sharedKey = buildSharedKey({
        sourceKey: key,
        sharedPrefix: SHARED_IMAGE_PREFIX,
        defaultExtension: "jpg",
      });
      await copyS3Object({
        bucket,
        sourceKey: key,
        destinationKey: sharedKey,
      });

      const url = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: sharedKey,
        }),
        { expiresIn: SHARED_URL_EXPIRATION_SECONDS }
      );
      res.json({ key: sharedKey, url, shared: true });
    } catch (error) {
      res.status(500).json({
        message: "Failed to share image",
        error: error?.message || String(error),
      });
    }
  });

  return router;
};
