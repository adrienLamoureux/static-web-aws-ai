module.exports = (app, deps) => {
  const {
    gradioSpaceConfig,
    DEFAULT_GRADIO_NEGATIVE_PROMPT,
    getGradioSpaceClient,
    resolveGradioImageBuffer,
    buildImageKey,
    buildImageBatchId,
    s3Client,
    PutObjectCommand,
    putMediaItem,
    getSignedUrl,
    GetObjectCommand,
  } = deps;

app.post("/gradio/image/generate", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const userId = req.user?.sub;
  const modelKey = req.body?.model || "wainsfw";
  const imageName = req.body?.imageName?.trim();
  const prompt = req.body?.prompt?.trim();
  const negativePrompt = req.body?.negativePrompt?.trim();
  const width = Number(req.body?.width);
  const height = Number(req.body?.height);
  const seed = req.body?.seed;
  const randomizeSeed = req.body?.randomizeSeed;
  const guidanceScale = Number(req.body?.guidanceScale);
  const numInferenceSteps = Number(req.body?.numInferenceSteps);
  const useNegativePrompt = req.body?.useNegativePrompt;
  const maxPromptLength = 900;

  console.log("Gradio image generate request:", {
    modelKey,
    imageName,
    promptLength: prompt?.length || 0,
    hasNegativePrompt: Boolean(negativePrompt),
    width,
    height,
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

  const modelConfig = gradioSpaceConfig[modelKey];
  if (!modelConfig) {
    return res.status(400).json({
      message: `Unsupported model selection: ${modelKey}`,
      allowed: Object.keys(gradioSpaceConfig),
    });
  }

  const resolvedWidth = Number.isFinite(width)
    ? width
    : modelConfig.defaultWidth;
  const resolvedHeight = Number.isFinite(height)
    ? height
    : modelConfig.defaultHeight;
  const resolvedGuidanceScale = Number.isFinite(guidanceScale)
    ? guidanceScale
    : modelConfig.guidanceScale;
  const resolvedSteps = Number.isFinite(numInferenceSteps)
    ? numInferenceSteps
    : modelConfig.numInferenceSteps;
  const resolvedSampler = modelConfig.sampler || "DPM++ 2M Karras";
  const resolvedAspectRatio =
    modelConfig.aspectRatio ||
    `${resolvedWidth} x ${resolvedHeight}`;
  const resolvedStylePreset = modelConfig.stylePreset || "(None)";
  const resolvedQualityTagsPreset = modelConfig.qualityTagsPreset || "(None)";
  const resolvedUseUpscaler =
    typeof modelConfig.useUpscaler === "boolean"
      ? modelConfig.useUpscaler
      : false;
  const resolvedUpscalerStrength = Number.isFinite(modelConfig.upscalerStrength)
    ? modelConfig.upscalerStrength
    : 0;
  const resolvedUpscaleBy = Number.isFinite(modelConfig.upscaleBy)
    ? modelConfig.upscaleBy
    : 1;
  const resolvedAddQualityTags =
    typeof modelConfig.addQualityTags === "boolean"
      ? modelConfig.addQualityTags
      : false;
  const resolvedUseNegativePrompt =
    typeof useNegativePrompt === "boolean"
      ? useNegativePrompt
      : Boolean(negativePrompt || DEFAULT_GRADIO_NEGATIVE_PROMPT);
  const resolvedNegativePrompt =
    negativePrompt ||
    (resolvedUseNegativePrompt ? DEFAULT_GRADIO_NEGATIVE_PROMPT : "");
  const shouldRandomizeSeed =
    typeof randomizeSeed === "boolean"
      ? randomizeSeed
      : !Number.isFinite(Number(seed));

  try {
    const hfToken =
      process.env.HUGGING_FACE_TOKEN || process.env.HUGGINGFACE_TOKEN;
    const client = await getGradioSpaceClient(
      modelConfig.spaceId,
      hfToken
    );
    const input = modelConfig.buildInput({
      prompt,
      negativePrompt: resolvedNegativePrompt,
      width: resolvedWidth,
      height: resolvedHeight,
      seed,
      randomizeSeed: shouldRandomizeSeed,
      guidanceScale: resolvedGuidanceScale,
      numInferenceSteps: resolvedSteps,
      sampler: resolvedSampler,
      aspectRatio: resolvedAspectRatio,
      stylePreset: resolvedStylePreset,
      qualityTagsPreset: resolvedQualityTagsPreset,
      useUpscaler: resolvedUseUpscaler,
      upscalerStrength: resolvedUpscalerStrength,
      upscaleBy: resolvedUpscaleBy,
      addQualityTags: resolvedAddQualityTags,
      useNegativePrompt: resolvedUseNegativePrompt,
    });
    const result = Array.isArray(input)
      ? await client.predict(modelConfig.apiName, input)
      : await client.predict(modelConfig.apiName, input);
    const resultData = result?.data ?? result;
    let imageOutput = resultData;
    let returnedSeed;
    if (Array.isArray(resultData)) {
      imageOutput = resultData[0];
      returnedSeed = resultData[1];
    }
    const resolvedImageOutput = Array.isArray(imageOutput)
      ? imageOutput[0]
      : imageOutput;
    const { buffer, contentType } =
      await resolveGradioImageBuffer(resolvedImageOutput);
    const key = buildImageKey({
      userId,
      provider: "huggingface",
      index: 0,
      baseName: imageName,
      batchId: buildImageBatchId(),
    });
    await s3Client.send(
      new PutObjectCommand({
        Bucket: mediaBucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || "image/png",
      })
    );
    await putMediaItem({
      userId,
      type: "IMG",
      key,
      extra: {
        prompt,
        negativePrompt: resolvedNegativePrompt || "",
        model: modelKey,
      },
    });
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: mediaBucket,
        Key: key,
      }),
      { expiresIn: 900 }
    );
    return res.json({
      modelId: modelConfig.spaceId,
      provider: "huggingface",
      seed: Number.isFinite(Number(returnedSeed))
        ? Number(returnedSeed)
        : Number.isFinite(Number(seed))
          ? Number(seed)
          : undefined,
      images: [{ key, url: signedUrl }],
    });
  } catch (error) {
    console.error("Gradio image generation error details:", {
      name: error?.name,
      message: error?.message,
      metadata: error?.$metadata,
      cause: error?.cause,
    });
    return res.status(500).json({
      message: "Gradio image generation failed",
      error: error?.message || String(error),
    });
  }
});

};
