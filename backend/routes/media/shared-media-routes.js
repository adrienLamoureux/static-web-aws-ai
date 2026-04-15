const { Router } = require("express");

module.exports = function registerSharedMediaRoutes(deps) {
  const {
    buildSafeBaseName,
    getSignedUrl,
    s3Client,
    GetObjectCommand,
    putMediaItem,
    queryMediaItems,
    ListObjectsV2Command,
    deleteMediaItem,
    resolveVideoPosterKey,
  } = deps;

  const SHARED_IMAGE_PREFIX = "shared/images/";
  const SHARED_VIDEO_PREFIX = "shared/videos/";
  const SHARED_IMAGE_FAVORITE_TYPE = "FAVIMG";
  const SHARED_LIST_MAX_KEYS_DEFAULT = 120;
  const SHARED_LIST_MAX_KEYS_LIMIT = 1000;
  const SHARED_URL_EXPIRATION_SECONDS = 900;
  const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

  const toSharedMaxKeys = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return SHARED_LIST_MAX_KEYS_DEFAULT;
    }
    return Math.min(Math.trunc(parsed), SHARED_LIST_MAX_KEYS_LIMIT);
  };

  const splitFileName = (key = "", fallbackBaseName = "asset", fallbackExtension = "jpg") => {
    const rawName =
      String(key || "")
        .split("/")
        .pop() || "";
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

  const toIsoString = (value) => {
    const dateValue = value ? new Date(value) : null;
    return dateValue && Number.isFinite(dateValue.getTime()) ? dateValue.toISOString() : "";
  };

  const isSharedImageKey = (key = "") =>
    typeof key === "string" && key.startsWith(SHARED_IMAGE_PREFIX);

  const isImageKey = (key = "") => {
    const { extension } = splitFileName(key, "", "");
    return IMAGE_EXTENSIONS.has(extension);
  };

  const router = Router();

  router.get("/s3/shared/images", async (req, res) => {
    const bucket = process.env.MEDIA_BUCKET;
    const maxKeys = toSharedMaxKeys(req.query?.maxKeys);

    if (!bucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }

    try {
      const response = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: SHARED_IMAGE_PREFIX,
          MaxKeys: maxKeys,
        })
      );
      const imageObjects = (response.Contents || [])
        .filter((item) => item.Key && item.Key !== SHARED_IMAGE_PREFIX)
        .filter((item) => isImageKey(item.Key))
        .sort((left, right) => {
          const leftTime = left.LastModified ? new Date(left.LastModified).getTime() : 0;
          const rightTime = right.LastModified ? new Date(right.LastModified).getTime() : 0;
          return rightTime - leftTime;
        })
        .slice(0, maxKeys);

      const images = await Promise.all(
        imageObjects.map(async (item) => {
          const key = item.Key;
          const url = await getSignedUrl(
            s3Client,
            new GetObjectCommand({
              Bucket: bucket,
              Key: key,
            }),
            { expiresIn: SHARED_URL_EXPIRATION_SECONDS }
          );
          return {
            key,
            url,
            lastModified: toIsoString(item.LastModified),
          };
        })
      );

      res.json({ bucket, images });
    } catch (error) {
      res.status(500).json({
        message: "Failed to list shared images",
        error: error?.message || String(error),
      });
    }
  });

  router.get("/s3/shared/images/favorites", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const items = await queryMediaItems({
        userId,
        type: SHARED_IMAGE_FAVORITE_TYPE,
      });
      const keys = items.map((item) => item.key).filter((key) => isSharedImageKey(key));
      res.json({ keys });
    } catch (error) {
      res.status(500).json({
        message: "Failed to load shared image favorites",
        error: error?.message || String(error),
      });
    }
  });

  router.post("/s3/shared/images/favorites", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const key = req.body?.key;
    const favorite = req.body?.favorite !== false;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!key || typeof key !== "string") {
      return res.status(400).json({ message: "key is required" });
    }
    if (!isSharedImageKey(key)) {
      return res.status(400).json({
        message: "key must start with shared/images/",
      });
    }

    try {
      if (favorite) {
        await putMediaItem({
          userId,
          type: SHARED_IMAGE_FAVORITE_TYPE,
          key,
        });
      } else {
        await deleteMediaItem({
          userId,
          type: SHARED_IMAGE_FAVORITE_TYPE,
          key,
        });
      }

      res.json({ key, favorite });
    } catch (error) {
      res.status(500).json({
        message: "Failed to update shared image favorite",
        error: error?.message || String(error),
      });
    }
  });

  router.get("/s3/shared/videos", async (req, res) => {
    const bucket = process.env.MEDIA_BUCKET;
    const maxKeys = toSharedMaxKeys(req.query?.maxKeys);
    const includeUrls = req.query?.includeUrls !== "false";
    const includePosters = req.query?.includePosters !== "false";

    if (!bucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }

    try {
      const response = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: SHARED_VIDEO_PREFIX,
          MaxKeys: maxKeys,
        })
      );
      const objects = response.Contents || [];
      const objectKeys = new Set(objects.map((item) => item.Key).filter(Boolean));
      const videos = objects
        .filter((item) => item.Key && item.Key !== SHARED_VIDEO_PREFIX)
        .filter((item) => item.Key?.endsWith(".mp4"))
        .sort((left, right) => {
          const leftTime = left.LastModified ? new Date(left.LastModified).getTime() : 0;
          const rightTime = right.LastModified ? new Date(right.LastModified).getTime() : 0;
          return rightTime - leftTime;
        })
        .slice(0, maxKeys)
        .map((item) => {
          const key = item.Key || "";
          return {
            key,
            posterKey: resolveVideoPosterKey(key, objectKeys),
            lastModified: toIsoString(item.LastModified),
          };
        });

      if (includeUrls || includePosters) {
        for (const video of videos) {
          if (includeUrls) {
            video.url = await getSignedUrl(
              s3Client,
              new GetObjectCommand({
                Bucket: bucket,
                Key: video.key,
              }),
              { expiresIn: SHARED_URL_EXPIRATION_SECONDS }
            );
          }
          if (includePosters && video.posterKey) {
            video.posterUrl = await getSignedUrl(
              s3Client,
              new GetObjectCommand({
                Bucket: bucket,
                Key: video.posterKey,
              }),
              { expiresIn: SHARED_URL_EXPIRATION_SECONDS }
            );
          }
        }
      }

      res.json({ bucket, videos });
    } catch (error) {
      res.status(500).json({
        message: "Failed to list shared videos",
        error: error?.message || String(error),
      });
    }
  });

  return router;
};
