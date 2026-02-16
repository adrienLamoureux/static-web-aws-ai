module.exports = (app, deps) => {
  const {
    ensureUserKey,
    replicateVideoConfig,
    fetchS3ImageBuffer,
    fetchImageBuffer,
    replicateClient,
    getReplicateOutputUrl,
    buildVideoOutputKey,
    s3Client,
    PutObjectCommand,
    buildVideoPosterKeyFromVideoKey,
    copyS3Object,
    putMediaItem,
    getSignedUrl,
    GetObjectCommand,
  } = deps;

app.post("/replicate/video/generate", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const userId = req.user?.sub;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const modelKey = req.body?.model || "wan-2.2-i2v-fast";
  const inputKey = req.body?.inputKey;
  const imageUrl = req.body?.imageUrl;
  const prompt = req.body?.prompt?.trim();
  const generateAudio = req.body?.generateAudio;

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
  if (!inputKey) {
    return res.status(400).json({ message: "inputKey is required" });
  }
  try {
    ensureUserKey(inputKey, userId);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  if (!prompt) {
    return res.status(400).json({ message: "prompt is required" });
  }

  const modelConfig = replicateVideoConfig[modelKey];
  if (!modelConfig) {
    return res.status(400).json({
      message: `Unsupported model selection: ${modelKey}`,
      allowed: Object.keys(replicateVideoConfig),
    });
  }
  if (modelConfig.requiresImage && !imageUrl && !inputKey) {
    return res.status(400).json({ message: "imageUrl or inputKey is required" });
  }
  let resolvedImageUrl = imageUrl;
  if (modelConfig.requiresImage) {
    let hasInlineImage = false;
    if (inputKey) {
      try {
        const { buffer, contentType } = await fetchS3ImageBuffer(
          mediaBucket,
          inputKey
        );
        resolvedImageUrl = `data:${contentType};base64,${buffer.toString(
          "base64"
        )}`;
        hasInlineImage = true;
      } catch (error) {
        console.warn("Failed to inline S3 image for Replicate:", {
          message: error?.message || String(error),
          inputKey,
        });
      }
    }
    if (!hasInlineImage && imageUrl) {
      try {
        const { buffer, contentType } = await fetchImageBuffer(imageUrl);
        resolvedImageUrl = `data:${contentType};base64,${buffer.toString(
          "base64"
        )}`;
        hasInlineImage = true;
      } catch (error) {
        console.warn("Failed to inline image for Replicate:", {
          message: error?.message || String(error),
        });
      }
    }
    if (!hasInlineImage) {
      return res.status(400).json({ message: "imageUrl is required" });
    }
  }
  const input = modelConfig.buildInput({
    imageUrl: resolvedImageUrl,
    prompt,
    generateAudio,
  });

  try {
    console.log("Replicate video generate invoke:", {
      modelId: modelConfig.modelId,
      inputKey,
    });
    const prediction = await replicateClient.predictions.create(
      {
        model: modelConfig.modelId,
        input,
      },
      {
        headers: {
          Prefer: "wait=60",
          "Cancel-After": "15m",
        },
      }
    );
    if (!prediction) {
      return res.status(500).json({
        message: "No prediction returned from Replicate",
      });
    }

    if (prediction.status === "succeeded") {
      const outputUrl = getReplicateOutputUrl(prediction.output);
      if (!outputUrl) {
        return res.status(500).json({
          message: "No video returned from Replicate",
          response: prediction,
        });
      }
      const { buffer, contentType } = await fetchImageBuffer(outputUrl);
      const outputKey = buildVideoOutputKey(inputKey, "videos/");
      await s3Client.send(
        new PutObjectCommand({
          Bucket: mediaBucket,
          Key: outputKey,
          Body: buffer,
          ContentType: contentType || "video/mp4",
        })
      );
      const posterKey = buildVideoPosterKeyFromVideoKey(outputKey);
      if (posterKey) {
        try {
          await copyS3Object({
            bucket: mediaBucket,
            sourceKey: inputKey,
            destinationKey: posterKey,
          });
        } catch (error) {
          console.warn("Failed to create video poster:", {
            message: error?.message || String(error),
            posterKey,
          });
        }
      }
      await putMediaItem({
        userId,
        type: "VID",
        key: outputKey,
        extra: { posterKey: posterKey || "" },
      });

      return res.json({
        modelId: modelConfig.modelId,
        provider: "replicate",
        outputKey,
        outputUrl,
        predictionId: prediction.id,
        status: prediction.status,
      });
    }

    res.json({
      modelId: modelConfig.modelId,
      provider: "replicate",
      predictionId: prediction.id,
      status: prediction.status,
    });
  } catch (error) {
    console.error("Replicate video generation error details:", {
      name: error?.name,
      message: error?.message,
      metadata: error?.$metadata,
      cause: error?.cause,
    });
    res.status(500).json({
      message: "Replicate video generation failed",
      error: error?.message || String(error),
    });
  }
});

app.get("/replicate/video/status", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const userId = req.user?.sub;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const predictionId = req.query?.predictionId;
  const inputKey = req.query?.inputKey;

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
  if (!inputKey) {
    return res.status(400).json({ message: "inputKey is required" });
  }
  try {
    ensureUserKey(inputKey, userId);
  } catch (error) {
    return res.status(400).json({ message: error.message });
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
    const outputUrl = getReplicateOutputUrl(prediction.output);
    if (!outputUrl) {
      return res.status(500).json({
        message: "No video returned from Replicate",
        response: prediction,
      });
    }
    const { buffer, contentType } = await fetchImageBuffer(outputUrl);
    const outputKey = buildVideoOutputKey(inputKey, "videos/");
    await s3Client.send(
      new PutObjectCommand({
        Bucket: mediaBucket,
        Key: outputKey,
        Body: buffer,
        ContentType: contentType || "video/mp4",
      })
    );
    const posterKey = buildVideoPosterKeyFromVideoKey(outputKey);
    if (posterKey) {
      try {
        await copyS3Object({
          bucket: mediaBucket,
          sourceKey: inputKey,
          destinationKey: posterKey,
        });
      } catch (error) {
        console.warn("Failed to create video poster:", {
          message: error?.message || String(error),
          posterKey,
        });
      }
    }
    await putMediaItem({
      userId,
      type: "VID",
      key: outputKey,
      extra: { posterKey: posterKey || "" },
    });
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: mediaBucket,
        Key: outputKey,
      }),
      { expiresIn: 900 }
    );

    res.json({
      predictionId,
      status: prediction.status,
      outputKey,
      outputUrl: signedUrl,
    });
  } catch (error) {
    console.error("Replicate video status error details:", {
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

};
