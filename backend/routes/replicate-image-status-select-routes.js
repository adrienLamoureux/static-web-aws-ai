module.exports = (app, deps) => {
  const {
    replicateClient,
    getReplicateOutputUrls,
    fetchImageBuffer,
    buildImageKey,
    s3Client,
    PutObjectCommand,
    putMediaItem,
    getSignedUrl,
    GetObjectCommand,
    ensureUserKey,
    streamToBuffer,
    buildVideoReadyKey,
    Jimp,
    toVideoReadyBuffer,
    copyS3Object,
    ListObjectsV2Command,
    DeleteObjectCommand,
    deleteMediaItem,
  } = deps;

app.get("/replicate/image/status", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const userId = req.user?.sub;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const predictionId = req.query?.predictionId;
  const imageName = req.query?.imageName;
  const batchId = req.query?.batchId;

  if (!mediaBucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET must be set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!apiToken) {
    return res
      .status(500)
      .json({ message: "REPLICATE_API_TOKEN must be set" });
  }
  if (!predictionId) {
    return res.status(400).json({ message: "predictionId is required" });
  }
  if (!imageName) {
    return res.status(400).json({ message: "imageName is required" });
  }
  if (!batchId) {
    return res.status(400).json({ message: "batchId is required" });
  }

  try {
    const prediction = await replicateClient.predictions.get(predictionId);
    if (!prediction) {
      return res.status(500).json({
        message: "Prediction not found",
      });
    }
    if (prediction.status !== "succeeded") {
      return res.json({
        predictionId,
        status: prediction.status,
      });
    }
    const outputUrls = getReplicateOutputUrls(prediction.output);
    if (!outputUrls.length) {
      return res.status(500).json({
        message: "No images returned from Replicate",
        response: prediction,
      });
    }

    const images = await Promise.all(
      outputUrls.map(async (url, index) => {
        const { buffer, contentType } = await fetchImageBuffer(url);
        const key = buildImageKey({
          userId,
          provider: "replicate",
          index,
          baseName: imageName,
          batchId,
        });
        await s3Client.send(
          new PutObjectCommand({
            Bucket: mediaBucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
          })
        );
        await putMediaItem({ userId, type: "IMG", key });
        const signedUrl = await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: mediaBucket,
            Key: key,
          }),
          { expiresIn: 900 }
        );
        return { key, url: signedUrl };
      })
    );

    res.json({
      predictionId,
      status: prediction.status,
      batchId,
      images,
    });
  } catch (error) {
    console.error("Replicate image status error details:", {
      name: error?.name,
      message: error?.message,
      metadata: error?.$metadata,
      cause: error?.cause,
    });
    res.status(500).json({
      message: "Failed to get Replicate prediction status",
      error: error?.message || String(error),
    });
  }
});

app.post("/images/select", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const selectedKey = req.body?.key;
  const userId = req.user?.sub;

  if (!mediaBucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET must be set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!selectedKey || typeof selectedKey !== "string") {
    return res.status(400).json({ message: "key is required" });
  }
  try {
    ensureUserKey(selectedKey, userId);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  const keyParts = selectedKey.split("/");
  const imagesIndex = keyParts.indexOf("images");
  if (imagesIndex === -1 || keyParts.length < imagesIndex + 3) {
    return res.status(400).json({
      message: "key must include a batch folder",
    });
  }
  const batchPrefix = `${keyParts.slice(0, imagesIndex + 3).join("/")}/`;

  try {
    const getResponse = await s3Client.send(
      new GetObjectCommand({
        Bucket: mediaBucket,
        Key: selectedKey,
      })
    );
    const buffer = await streamToBuffer(getResponse.Body);
    const videoReadyKey = buildVideoReadyKey(selectedKey);
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
      console.warn("Failed to validate/convert selected image:", {
        message: error?.message || String(error),
      });
      shouldCopy = true;
    }

    if (shouldCopy) {
      await copyS3Object({
        bucket: mediaBucket,
        sourceKey: selectedKey,
        destinationKey: videoReadyKey,
      });
    } else {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: mediaBucket,
          Key: videoReadyKey,
          Body: videoReadyBuffer,
          ContentType: "image/jpeg",
        })
      );
    }

    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: mediaBucket,
        Prefix: batchPrefix,
        MaxKeys: 1000,
      })
    );
    const deleteKeys = (listResponse.Contents || [])
      .map((item) => item.Key)
      .filter((key) => key && key !== selectedKey);

    for (const key of deleteKeys) {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: mediaBucket,
          Key: key,
        })
      );
    }

    await putMediaItem({ userId, type: "IMG", key: selectedKey });
    for (const key of deleteKeys) {
      await deleteMediaItem({ userId, type: "IMG", key });
    }

    res.json({
      selectedKey,
      videoReadyKey,
      deletedKeys: deleteKeys,
    });
  } catch (error) {
    console.error("Image selection error details:", {
      name: error?.name,
      message: error?.message,
      metadata: error?.$metadata,
      cause: error?.cause,
    });
    res.status(500).json({
      message: "Image selection failed",
      error: error?.message || String(error),
    });
  }
});

};
