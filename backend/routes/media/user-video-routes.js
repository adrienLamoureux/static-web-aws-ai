const { Router } = require("express");

module.exports = function registerUserVideoRoutes(deps) {
  const {
    buildUserPrefix,
    getSignedUrl,
    s3Client,
    GetObjectCommand,
    ensureUserKey,
    copyS3Object,
    putMediaItem,
    queryMediaItems,
    ListObjectsV2Command,
    DeleteObjectCommand,
    deleteMediaItem,
    buildVideoPosterKeyFromVideoKey,
    buildFolderPosterKeyFromVideoKey,
    resolveVideoPosterKey,
  } = deps;

  const SHARED_VIDEO_PREFIX = "shared/videos/";
  const SHARED_URL_EXPIRATION_SECONDS = 900;

  const splitFileName = (
    key = "",
    fallbackBaseName = "asset",
    fallbackExtension = "mp4"
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
    const { buildSafeBaseName } = deps;
    const safeBaseName = buildSafeBaseName(baseName || "shared-asset");
    const resolvedExtension = extension || defaultExtension;
    return `${sharedPrefix}${safeBaseName}-${Date.now()}.${resolvedExtension}`;
  };

  const router = Router();

  router.post("/s3/videos/delete", deps.requireUserMiddleware, async (req, res) => {
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
      const deleteTargets = new Set([key]);
      const directPosterKey = buildVideoPosterKeyFromVideoKey(key);
      if (directPosterKey) {
        deleteTargets.add(directPosterKey);
      }
      const folderPosterKey = buildFolderPosterKeyFromVideoKey(key);
      if (folderPosterKey) {
        deleteTargets.add(folderPosterKey);
      }
      await Promise.all(
        Array.from(deleteTargets).map((targetKey) =>
          s3Client.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: targetKey,
            })
          )
        )
      );
      await deleteMediaItem({ userId, type: "VID", key });
      res.json({
        key,
        deleted: true,
        deletedKeys: Array.from(deleteTargets),
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to delete video",
        error: error?.message || String(error),
      });
    }
  });

  router.post("/s3/videos/share", deps.requireUserMiddleware, async (req, res) => {
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
    if (!String(key).toLowerCase().endsWith(".mp4")) {
      return res.status(400).json({ message: "key must reference an mp4 video" });
    }
    try {
      ensureUserKey(key, userId);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const sharedKey = buildSharedKey({
        sourceKey: key,
        sharedPrefix: SHARED_VIDEO_PREFIX,
        defaultExtension: "mp4",
      });
      await copyS3Object({
        bucket,
        sourceKey: key,
        destinationKey: sharedKey,
      });

      const sharedPosterKey = buildVideoPosterKeyFromVideoKey(sharedKey);
      const posterCandidates = [
        buildVideoPosterKeyFromVideoKey(key),
        buildFolderPosterKeyFromVideoKey(key),
      ].filter(Boolean);
      let copiedPosterKey = "";
      for (const posterSourceKey of posterCandidates) {
        if (!sharedPosterKey) break;
        try {
          await copyS3Object({
            bucket,
            sourceKey: posterSourceKey,
            destinationKey: sharedPosterKey,
          });
          copiedPosterKey = sharedPosterKey;
          break;
        } catch (_error) {
          // Ignore missing poster candidates and continue.
        }
      }

      const url = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: sharedKey,
        }),
        { expiresIn: SHARED_URL_EXPIRATION_SECONDS }
      );
      const responsePayload = {
        key: sharedKey,
        url,
        shared: true,
      };
      if (copiedPosterKey) {
        responsePayload.posterKey = copiedPosterKey;
        responsePayload.posterUrl = await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: bucket,
            Key: copiedPosterKey,
          }),
          { expiresIn: SHARED_URL_EXPIRATION_SECONDS }
        );
      }
      res.json(responsePayload);
    } catch (error) {
      res.status(500).json({
        message: "Failed to share video",
        error: error?.message || String(error),
      });
    }
  });

  router.get("/s3/videos", deps.requireUserMiddleware, async (req, res) => {
    const bucket = process.env.MEDIA_BUCKET;
    const maxKeys = Number(req.query?.maxKeys) || 100;
    const includeUrls = req.query?.includeUrls === "true";
    const includePosters = req.query?.includePosters === "true";
    const urlExpirationSeconds = 900;
    const userId = req.user?.sub;

    if (!bucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const items = await queryMediaItems({ userId, type: "VID" });
      let videos = items
        .map((item) => ({
          key: item.key,
          posterKey: item.posterKey,
          createdAt: item.createdAt,
        }))
        .slice(0, Math.min(maxKeys, 1000));

      if (videos.length === 0) {
        const userPrefix = buildUserPrefix(userId);
        const response = await s3Client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: `${userPrefix}videos/`,
            MaxKeys: Math.min(maxKeys, 1000),
          })
        );
        const objects = response.Contents || [];
        const objectKeys = new Set(
          objects.map((item) => item.Key).filter(Boolean)
        );
        videos = objects
          .filter((item) => item.Key && item.Key !== `${userPrefix}videos/`)
          .filter((item) => item.Key?.endsWith(".mp4"))
          .filter((item) => !item.Key?.endsWith("/output.mp4"))
          .map((item) => {
            const key = item.Key || "";
            const posterKey = resolveVideoPosterKey(key, objectKeys);
            return { key, posterKey };
          });
        await Promise.all(
          videos.map((item) =>
            putMediaItem({
              userId,
              type: "VID",
              key: item.key,
              extra: { posterKey: item.posterKey || "" },
            })
          )
        );
      }

      if (includeUrls || includePosters) {
        for (const video of videos) {
          if (includeUrls) {
            const command = new GetObjectCommand({
              Bucket: bucket,
              Key: video.key,
            });
            video.url = await getSignedUrl(s3Client, command, {
              expiresIn: urlExpirationSeconds,
            });
          }
          if (includePosters && video.posterKey) {
            const posterCommand = new GetObjectCommand({
              Bucket: bucket,
              Key: video.posterKey,
            });
            video.posterUrl = await getSignedUrl(s3Client, posterCommand, {
              expiresIn: urlExpirationSeconds,
            });
          }
        }
      }

      res.json({ bucket, videos });
    } catch (error) {
      res.status(500).json({
        message: "Failed to list videos",
        error: error?.message || String(error),
      });
    }
  });

  router.get("/s3/video-url", deps.requireUserMiddleware, async (req, res) => {
    const bucket = process.env.MEDIA_BUCKET;
    const prefix = req.query?.prefix;
    const urlExpirationSeconds = 900;
    const userId = req.user?.sub;

    if (!bucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!prefix) {
      return res.status(400).json({ message: "prefix is required" });
    }
    const userPrefix = buildUserPrefix(userId);
    if (!prefix.startsWith(`${userPrefix}videos/`)) {
      return res.status(400).json({
        message: "prefix must start with the user's videos/",
      });
    }

    try {
      const response = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          MaxKeys: 1000,
        })
      );

      const objects = (response.Contents || [])
        .filter((item) => item.Key && item.Key !== prefix)
        .sort((a, b) => {
          const aTime = a.LastModified ? new Date(a.LastModified).getTime() : 0;
          const bTime = b.LastModified ? new Date(b.LastModified).getTime() : 0;
          return aTime - bTime;
        });

      if (objects.length === 0) {
        return res.status(404).json({ message: "No videos found" });
      }

      const outputMp4 =
        objects.find((item) => item.Key?.endsWith("/output.mp4")) ||
        objects.find((item) => item.Key?.endsWith(".mp4"));
      const latest = outputMp4 || objects[objects.length - 1];
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: latest.Key,
      });
      const url = await getSignedUrl(s3Client, command, {
        expiresIn: urlExpirationSeconds,
      });

      res.json({
        bucket,
        key: latest.Key,
        s3Uri: `s3://${bucket}/${latest.Key}`,
        url,
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to get video URL",
        error: error?.message || String(error),
      });
    }
  });

  return router;
};
