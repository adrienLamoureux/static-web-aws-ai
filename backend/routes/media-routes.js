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
    getItem,
    buildMediaPk,
    buildMediaSk,
    buildVideoPosterKeyFromVideoKey,
    buildFolderPosterKeyFromVideoKey,
    resolveVideoPosterKey,
  } = deps;

  const setMediaFavorite = async ({ userId, type, key, favorite }) => {
    const existing = await getItem({
      pk: buildMediaPk(userId),
      sk: buildMediaSk(type, key),
    });
    if (!existing) {
      return null;
    }
    const nowIso = new Date().toISOString();
    const existingExtra = { ...existing };
    delete existingExtra.pk;
    delete existingExtra.sk;
    delete existingExtra.type;
    delete existingExtra.key;
    await putMediaItem({
      userId,
      type,
      key,
      extra: {
        ...existingExtra,
        favorite: Boolean(favorite),
        createdAt: existing.createdAt || nowIso,
        updatedAt: nowIso,
      },
    });
    return {
      key,
      favorite: Boolean(favorite),
      updatedAt: nowIso,
    };
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
        favorite: Boolean(item.favorite),
        prompt: typeof item.prompt === "string" ? item.prompt : "",
        negativePrompt:
          typeof item.negativePrompt === "string" ? item.negativePrompt : "",
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
        .map((key) => ({
          key,
          favorite: false,
          prompt: "",
          negativePrompt: "",
        }));

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
        return {
          key: image.key,
          url,
          favorite: Boolean(image.favorite),
          prompt: image.prompt || "",
          negativePrompt: image.negativePrompt || "",
        };
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

app.post("/s3/images/favorite", async (req, res) => {
  const key = req.body?.key;
  const userId = req.user?.sub;
  const favorite =
    typeof req.body?.favorite === "boolean" ? req.body.favorite : true;

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
    const updated = await setMediaFavorite({
      userId,
      type: "IMG",
      key,
      favorite,
    });
    if (!updated) {
      return res.status(404).json({ message: "Image not found" });
    }
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update image favorite",
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

app.post("/s3/videos/favorite", async (req, res) => {
  const key = req.body?.key;
  const userId = req.user?.sub;
  const favorite =
    typeof req.body?.favorite === "boolean" ? req.body.favorite : true;

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
    const updated = await setMediaFavorite({
      userId,
      type: "VID",
      key,
      favorite,
    });
    if (!updated) {
      return res.status(404).json({ message: "Video not found" });
    }
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update video favorite",
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
        favorite: Boolean(item.favorite),
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
          return { key, posterKey, favorite: false };
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
