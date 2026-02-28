module.exports = (app, deps) => {
  const {
    bedrockClient,
    GetAsyncInvokeCommand,
    buildUserPrefix,
    ensureUserKey,
    buildVideoOutputKey,
    s3Client,
    ListObjectsV2Command,
    CopyObjectCommand,
    DeleteObjectCommand,
    buildVideoPosterKeyFromPrefix,
    buildVideoPosterKeyFromVideoKey,
    copyS3Object,
    putMediaItem,
    buildSeedList,
    buildImageBatchId,
    imageModelConfig,
    delay,
    InvokeModelCommand,
    buildImageKey,
    PutObjectCommand,
    getSignedUrl,
    GetObjectCommand,
  } = deps;

app.get("/bedrock/nova-reel/job-status", async (req, res) => {
  const invocationArn = req.query?.invocationArn;
  const inputKey = req.query?.inputKey;
  const outputPrefix = req.query?.outputPrefix;
  const userId = req.user?.sub;
  if (!invocationArn) {
    return res.status(400).json({ message: "invocationArn is required" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const command = new GetAsyncInvokeCommand({ invocationArn });
    const response = await bedrockClient.send(command);
    if (
      response?.status === "Completed" &&
      inputKey &&
      outputPrefix &&
      outputPrefix.startsWith(buildUserPrefix(userId))
    ) {
      try {
        ensureUserKey(inputKey, userId);
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
      const outputKey = buildVideoOutputKey(inputKey, outputPrefix);
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: process.env.MEDIA_BUCKET,
          Prefix: outputPrefix,
          MaxKeys: 1000,
        })
      );
      const mp4Object = (listResponse.Contents || []).find(
        (item) => item.Key && item.Key.endsWith(".mp4")
      );
      if (mp4Object?.Key && mp4Object.Key !== outputKey) {
        const existing = await s3Client.send(
          new ListObjectsV2Command({
            Bucket: process.env.MEDIA_BUCKET,
            Prefix: outputKey,
            MaxKeys: 1,
          })
        );
        if (!existing.Contents?.length) {
          await s3Client.send(
            new CopyObjectCommand({
              Bucket: process.env.MEDIA_BUCKET,
              CopySource: `${process.env.MEDIA_BUCKET}/${mp4Object.Key}`,
              Key: outputKey,
              ContentType: "video/mp4",
              MetadataDirective: "REPLACE",
            })
          );
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.MEDIA_BUCKET,
              Key: mp4Object.Key,
            })
          );
        }
      }
      const posterKey = buildVideoPosterKeyFromPrefix(outputPrefix);
      const directPosterKey = buildVideoPosterKeyFromVideoKey(outputKey);
      if (posterKey && directPosterKey && posterKey !== directPosterKey) {
        try {
          await copyS3Object({
            bucket: process.env.MEDIA_BUCKET,
            sourceKey: posterKey,
            destinationKey: directPosterKey,
          });
        } catch (error) {
          console.warn("Failed to align video poster key:", {
            message: error?.message || String(error),
            posterKey,
            directPosterKey,
          });
        }
      }
      await putMediaItem({
        userId,
        type: "VID",
        key: outputKey,
        extra: { posterKey: directPosterKey || posterKey || "" },
      });
    }
    res.json(response);
  } catch (error) {
    res.status(500).json({
      message: "Failed to get job status",
      error: error?.message || String(error),
    });
  }
});

app.post("/bedrock/image/generate", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const userId = req.user?.sub;
  const modelKey = req.body?.model || "titan";
  const imageName = req.body?.imageName?.trim();
  const prompt = req.body?.prompt?.trim();
  const negativePrompt = req.body?.negativePrompt?.trim();
  const maxPromptLength = 900;
  const width = Number(req.body?.width) || 1280;
  const height = Number(req.body?.height) || 720;
  const requestedImages = Number(req.body?.numImages) || 1;
  const numImages = Math.min(Math.max(requestedImages, 1), 2);
  const seed = req.body?.seed;
  const seeds = buildSeedList(numImages, seed);
  const batchId = buildImageBatchId();

  console.log("Bedrock image generate request:", {
    modelKey,
    imageName,
    promptLength: prompt?.length || 0,
    hasNegativePrompt: Boolean(negativePrompt),
    width,
    height,
    numImages,
    batchId,
  });

  if (!mediaBucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET must be set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!imageName) {
    return res.status(400).json({ message: "imageName is required" });
  }
  if (!prompt) {
    return res.status(400).json({ message: "prompt is required" });
  }
  if (prompt.length > maxPromptLength) {
    return res.status(400).json({
      message: `prompt must be ${maxPromptLength} characters or less`,
    });
  }
  if (negativePrompt && negativePrompt.length > maxPromptLength) {
    return res.status(400).json({
      message: `negativePrompt must be ${maxPromptLength} characters or less`,
    });
  }
  const modelConfig = imageModelConfig[modelKey];
  if (!modelConfig) {
    return res.status(400).json({
      message: `Unsupported model selection: ${modelKey}`,
      allowed: Object.keys(imageModelConfig),
    });
  }
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return res.status(400).json({ message: "width and height must be numbers" });
  }
  const sizeAllowed = modelConfig.sizes?.some(
    (size) => size.width === width && size.height === height
  );
  if (!sizeAllowed) {
    return res.status(400).json({
      message: `Unsupported size for ${modelConfig.provider}`,
      allowedSizes: modelConfig.sizes,
    });
  }

  try {
    const images = await Promise.all(
      seeds.map((currentSeed, index) =>
        (async () => {
          if (index > 0) {
            await delay(1000);
          }
          const requestBody =
            modelConfig.provider === "titan"
              ? {
                  taskType: "TEXT_IMAGE",
                  textToImageParams: {
                    text: prompt,
                    ...(negativePrompt ? { negativeText: negativePrompt } : {}),
                  },
                  imageGenerationConfig: {
                    numberOfImages: 1,
                    quality: "premium",
                    width,
                    height,
                    cfgScale: 8,
                    seed: currentSeed,
                  },
                }
              : {
                  text_prompts: [
                    { text: prompt },
                    ...(negativePrompt
                      ? [{ text: negativePrompt, weight: -1 }]
                      : []),
                  ],
                  cfg_scale: 7,
                  steps: 30,
                  width,
                  height,
                  seed: currentSeed,
                  samples: 1,
                };
          console.log("Bedrock image generate invoke:", {
            modelId: modelConfig.modelId,
            provider: modelConfig.provider,
            seed: currentSeed,
          });
          const command = new InvokeModelCommand({
            modelId: modelConfig.modelId,
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify(requestBody),
          });
          const response = await bedrockClient.send(command);
          console.log(
            "Bedrock image generate response metadata:",
            response?.$metadata
          );
          const responseBody = JSON.parse(
            new TextDecoder().decode(response.body)
          );

      const imagesBase64 =
        modelConfig.provider === "titan"
          ? responseBody?.images || []
          : (responseBody?.artifacts || [])
              .map((artifact) => artifact?.base64)
              .filter(Boolean);

          if (!imagesBase64.length) {
            console.log("Bedrock image generate empty response:", responseBody);
            throw new Error("No images returned from Bedrock");
          }

          const base64 = imagesBase64[0];
          const buffer = Buffer.from(base64, "base64");
          const key = buildImageKey({
            userId,
            provider: modelConfig.provider,
            index,
            baseName: imageName,
            batchId,
          });
          await s3Client.send(
            new PutObjectCommand({
              Bucket: mediaBucket,
              Key: key,
              Body: buffer,
              ContentType: "image/png",
            })
          );
          await putMediaItem({
            userId,
            type: "IMG",
            key,
            extra: {
              prompt,
              negativePrompt: negativePrompt || "",
              model: modelKey,
            },
          });
          const url = await getSignedUrl(
            s3Client,
            new GetObjectCommand({
              Bucket: mediaBucket,
              Key: key,
            }),
            { expiresIn: 900 }
          );
          return { key, url };
        })()
      )
    );

    res.json({
      modelId: modelConfig.modelId,
      provider: modelConfig.provider,
      batchId,
      notice: `Generating ${numImages} images with a staggered start. This can take a bit.`,
      images,
    });
  } catch (error) {
    console.error("Bedrock image generation error details:", {
      name: error?.name,
      message: error?.message,
      metadata: error?.$metadata,
      cause: error?.cause,
    });
    res.status(500).json({
      message: "Bedrock image generation failed",
      error: error?.message || String(error),
    });
  }
});

};
