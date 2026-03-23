module.exports = (app, deps) => {
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
    buildVideoPosterKeyFromVideoKey,
    buildFolderPosterKeyFromVideoKey,
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

const toIsoString = (value) => {
  const dateValue = value ? new Date(value) : null;
  return dateValue && Number.isFinite(dateValue.getTime())
    ? dateValue.toISOString()
    : "";
};

const isSharedImageKey = (key = "") =>
  typeof key === "string" && key.startsWith(SHARED_IMAGE_PREFIX);

const isImageKey = (key = "") => {
  const { extension } = splitFileName(key, "", "");
  return IMAGE_EXTENSIONS.has(extension);
};

app.post("/s3/image-upload-url", async (req, res) => {
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

app.post("/images/video-ready", async (req, res) => {
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

app.post("/s3/images/share", async (req, res) => {
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

app.get("/s3/images", async (req, res) => {
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

app.post("/s3/images/delete", async (req, res) => {
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

app.get("/s3/shared/images", async (req, res) => {
  const bucket = process.env.MEDIA_BUCKET;
  const userId = req.user?.sub;
  const maxKeys = toSharedMaxKeys(req.query?.maxKeys);

  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
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
        const leftTime = left.LastModified
          ? new Date(left.LastModified).getTime()
          : 0;
        const rightTime = right.LastModified
          ? new Date(right.LastModified).getTime()
          : 0;
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

app.get("/s3/shared/images/favorites", async (req, res) => {
  const userId = req.user?.sub;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const items = await queryMediaItems({
      userId,
      type: SHARED_IMAGE_FAVORITE_TYPE,
    });
    const keys = items
      .map((item) => item.key)
      .filter((key) => isSharedImageKey(key));
    res.json({ keys });
  } catch (error) {
    res.status(500).json({
      message: "Failed to load shared image favorites",
      error: error?.message || String(error),
    });
  }
});

app.post("/s3/shared/images/favorites", async (req, res) => {
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

app.post("/s3/videos/delete", async (req, res) => {
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

app.post("/s3/videos/share", async (req, res) => {
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

app.get("/s3/videos", async (req, res) => {
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

app.get("/s3/shared/videos", async (req, res) => {
  const bucket = process.env.MEDIA_BUCKET;
  const userId = req.user?.sub;
  const maxKeys = toSharedMaxKeys(req.query?.maxKeys);
  const includeUrls = req.query?.includeUrls !== "false";
  const includePosters = req.query?.includePosters !== "false";

  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
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
    const objectKeys = new Set(
      objects.map((item) => item.Key).filter(Boolean)
    );
    const videos = objects
      .filter((item) => item.Key && item.Key !== SHARED_VIDEO_PREFIX)
      .filter((item) => item.Key?.endsWith(".mp4"))
      .sort((left, right) => {
        const leftTime = left.LastModified
          ? new Date(left.LastModified).getTime()
          : 0;
        const rightTime = right.LastModified
          ? new Date(right.LastModified).getTime()
          : 0;
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

app.get("/s3/video-url", async (req, res) => {
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

};
