module.exports = (app, deps) => {
  const {
    replicateModelConfig,
    replicateClient,
    buildSeedList,
    buildImageBatchId,
    clampPromptTokens,
    MAX_REPLICATE_PROMPT_TOKENS,
    getReplicateOutputUrls,
    fetchImageBuffer,
    buildImageKey,
    s3Client,
    PutObjectCommand,
    putMediaItem,
    getSignedUrl,
    GetObjectCommand,
    delay,
    runReplicateWithRetry,
    getReplicateOutputUrl,
  } = deps;

app.post("/replicate/image/generate", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const userId = req.user?.sub;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const modelKey = req.body?.model || "animagine";
  const imageName = req.body?.imageName?.trim();
  const prompt = req.body?.prompt?.trim();
  const negativePrompt = req.body?.negativePrompt?.trim();
  const maxPromptLength = 900;
  const width = Number(req.body?.width) || 1024;
  const height = Number(req.body?.height) || 1024;
  const scheduler = req.body?.scheduler;
  const requestedImages = Number(req.body?.numImages) || 1;
  const isDiffScheduler = scheduler === "diff";
  const numImages = Math.min(
    Math.max(isDiffScheduler ? 2 : requestedImages, 1),
    2
  );
  const seed = req.body?.seed;
  const seeds = isDiffScheduler
    ? Array.from({ length: numImages }, () =>
        Number.isFinite(Number(seed))
          ? Number(seed)
          : Math.floor(Math.random() * 2147483647)
      )
    : buildSeedList(numImages, seed);
  const batchId = buildImageBatchId();

  console.log("Replicate image generate request:", {
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
  if (!apiToken) {
    return res
      .status(500)
      .json({ message: "REPLICATE_API_TOKEN must be set" });
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
  const trimmedPrompt = clampPromptTokens(prompt);
  const trimmedNegativePrompt = negativePrompt
    ? clampPromptTokens(negativePrompt)
    : undefined;
  const promptWasTrimmed = trimmedPrompt.trim() !== prompt.trim();
  const negativeWasTrimmed =
    Boolean(negativePrompt) &&
    trimmedNegativePrompt?.trim() !== negativePrompt.trim();
  const promptNotice = [
    promptWasTrimmed
      ? `Positive prompt trimmed to ${MAX_REPLICATE_PROMPT_TOKENS} tokens for Replicate.`
      : null,
    negativeWasTrimmed
      ? `Negative prompt trimmed to ${MAX_REPLICATE_PROMPT_TOKENS} tokens for Replicate.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
  const modelConfig = replicateModelConfig[modelKey];
  if (!modelConfig) {
    return res.status(400).json({
      message: `Unsupported model selection: ${modelKey}`,
      allowed: Object.keys(replicateModelConfig),
    });
  }
  if (!modelConfig.modelId) {
    return res.status(500).json({
      message: `Replicate modelId is not configured for ${modelKey}`,
    });
  }
  const sizeAllowed = modelConfig.sizes?.some(
    (size) => size.width === width && size.height === height
  );
  if (!sizeAllowed) {
    return res.status(400).json({
      message: `Unsupported size for ${modelKey}`,
      allowedSizes: modelConfig.sizes,
    });
  }
  if (scheduler && scheduler !== "diff" && modelConfig.schedulers) {
    const schedulerAllowed = modelConfig.schedulers.includes(scheduler);
    if (!schedulerAllowed) {
      return res.status(400).json({
        message: `Unsupported scheduler for ${modelKey}`,
        allowedSchedulers: modelConfig.schedulers,
      });
    }
  }

  try {
    if (modelConfig.usePredictions) {
      const resolvedSeed = Number.isFinite(Number(seed))
        ? Number(seed)
        : undefined;
      const input = modelConfig.buildInput({
        prompt: trimmedPrompt,
        negativePrompt: trimmedNegativePrompt,
        width,
        height,
        numOutputs: numImages,
        seed: resolvedSeed,
        scheduler,
      });
      console.log("Replicate image prediction create:", {
        modelId: modelConfig.modelId,
        batchId,
      });
      const prediction = await replicateClient.predictions.create(
        {
          model: modelConfig.modelId,
          input,
        },
        {
          headers: {
            Prefer: "wait=5",
            "Cancel-After": "10m",
          },
        }
      );
      if (!prediction) {
        return res.status(500).json({
          message: "No prediction returned from Replicate",
        });
      }
      if (prediction.status !== "succeeded") {
        return res.json({
          modelId: modelConfig.modelId,
          provider: "replicate",
          predictionId: prediction.id,
          status: prediction.status,
          batchId,
          notice: [
            "Replicate is generating the image. We'll keep checking.",
            promptNotice,
          ]
            .filter(Boolean)
            .join(" "),
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
        outputUrls.slice(0, numImages).map(async (url, index) => {
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
      return res.json({
        modelId: modelConfig.modelId,
        provider: "replicate",
        batchId,
        notice: promptNotice,
        images,
      });
    }

    const images = await Promise.all(
      seeds.map((currentSeed, index) =>
        (async () => {
          if (index > 0) {
            await delay(index * 1000);
          }
          const resolvedScheduler = isDiffScheduler
            ? modelConfig.schedulers?.[index % modelConfig.schedulers.length]
            : scheduler;
          const input = modelConfig.buildInput({
            prompt: trimmedPrompt,
            negativePrompt: trimmedNegativePrompt,
            width,
            height,
            numOutputs: 1,
            seed: currentSeed,
            scheduler: resolvedScheduler,
          });
          console.log("Replicate image generate invoke:", {
            modelId: modelConfig.modelId,
            seed: currentSeed,
            scheduler: resolvedScheduler,
          });
          const output = await runReplicateWithRetry(
            modelConfig.modelId,
            input,
            3
          );
          const outputItems = Array.isArray(output) ? output : [output];
          const url = outputItems.map(getReplicateOutputUrl).find(Boolean);
          if (!url) {
            throw new Error("No images returned from Replicate");
          }
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
        })()
      )
    );

    res.json({
      modelId: modelConfig.modelId,
      provider: "replicate",
      batchId,
      notice: [
        `Generating ${numImages} images with a staggered start. This can take a bit.`,
        promptNotice,
      ]
        .filter(Boolean)
        .join(" "),
      images,
    });
  } catch (error) {
    console.error("Replicate image generation error details:", {
      name: error?.name,
      message: error?.message,
      metadata: error?.$metadata,
      cause: error?.cause,
    });
    res.status(500).json({
      message: "Replicate image generation failed",
      error: error?.message || String(error),
    });
  }
});

};
