module.exports = (app, deps) => {
  const {
    buildUserPrefix,
    ensureUserKey,
    s3Client,
    GetObjectCommand,
    streamToBuffer,
    Jimp,
    toVideoReadyBuffer,
    buildVideoReadyKey,
    PutObjectCommand,
    buildVideoPosterKeyFromPrefix,
    StartAsyncInvokeCommand,
    bedrockClient,
  } = deps;

app.post("/bedrock/nova-reel/image-to-video-s3", async (req, res) => {
  const prompt = req.body?.prompt || "A cinematic push-in on the scene.";
  const mediaBucket = process.env.MEDIA_BUCKET;
  const inputKey = req.body?.inputKey;
  const userId = req.user?.sub;
  const outputPrefix = `${buildUserPrefix(userId || "")}videos/${Date.now()}/`;
  const requestedModel = req.body?.model;

  if (!mediaBucket) {
    return res.status(500).json({
      message: "MEDIA_BUCKET must be set",
    });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!inputKey) {
    return res.status(400).json({ message: "inputKey is required" });
  }
  try {
    ensureUserKey(inputKey, userId);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  if (!outputPrefix.startsWith(buildUserPrefix(userId))) {
    return res.status(400).json({
      message: "outputPrefix must start with the user's prefix",
    });
  }

  const inputS3Uri = `s3://${mediaBucket}/${inputKey}`;
  // const inputS3Uri = "s3://staticwebawsaistack-mediabucketbcbb02ba-crjbe2oeh2eo/images/frieren.jpg"
  const outputS3Uri = `s3://${mediaBucket}/${outputPrefix}`;
  // const outputS3Uri = "s3://staticwebawsaistack-mediabucketbcbb02ba-crjbe2oeh2eo/videos/"
  const modelId =
    requestedModel === "nova-reel"
      ? "amazon.nova-reel-v1:1"
      : process.env.BEDROCK_MODEL_ID || "amazon.nova-reel-v1:1";
  const inputExtension = inputKey.split(".").pop()?.toLowerCase();
  let imageFormat = inputExtension === "jpg" ? "jpeg" : inputExtension;
  if (imageFormat !== "jpeg" && imageFormat !== "png") {
    return res.status(400).json({
      message: "inputKey must be a .jpg or .png image",
    });
  }
  const seed =
    req.body?.videoGenerationConfig?.seed ??
    Math.floor(Math.random() * 2147483647);
  const defaultVideoConfig = {
    durationSeconds: 6,
    fps: 24,
    dimension: "1280x720",
    seed,
  };
  const videoGenerationConfig = { ...defaultVideoConfig };
  let imageBase64;
  try {
    const imageResponse = await s3Client.send(
      new GetObjectCommand({
        Bucket: mediaBucket,
        Key: inputKey,
      })
    );
    const imageBuffer = await streamToBuffer(imageResponse.Body);
    let finalBuffer = imageBuffer;
    try {
      const image = await Jimp.read(imageBuffer);
      if (image.bitmap.width !== 1280 || image.bitmap.height !== 720) {
        finalBuffer = await toVideoReadyBuffer(imageBuffer);
        imageFormat = "jpeg";
        const videoReadyKey = buildVideoReadyKey(inputKey);
        await s3Client.send(
          new PutObjectCommand({
            Bucket: mediaBucket,
            Key: videoReadyKey,
            Body: finalBuffer,
            ContentType: "image/jpeg",
          })
        );
      }
    } catch (error) {
      console.warn("Failed to validate/convert input image:", {
        message: error?.message || String(error),
      });
    }
    imageBase64 = finalBuffer.toString("base64");
    const posterKey = buildVideoPosterKeyFromPrefix(outputPrefix);
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: mediaBucket,
          Key: posterKey,
          Body: finalBuffer,
          ContentType: imageFormat === "png" ? "image/png" : "image/jpeg",
        })
      );
    } catch (error) {
      console.warn("Failed to create video poster:", {
        message: error?.message || String(error),
        posterKey,
      });
    }
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load input image from S3",
      error: error?.message || String(error),
    });
  }
  const requestBody = {
    taskType: "TEXT_VIDEO",
    textToVideoParams: {
      text: prompt,
      images: [
        {
          format: imageFormat,
          source: {
            bytes: imageBase64,
          },
        },
      ],
    },
    videoGenerationConfig,
  };

  try {
    console.log("Bedrock image-to-video input:", {
      modelId,
      inputS3Uri,
      outputS3Uri,
      requestBody,
    });
    const command = new StartAsyncInvokeCommand({
      modelId,
      modelInput: requestBody,
      outputDataConfig: {
        s3OutputDataConfig: {
          s3Uri: outputS3Uri,
        },
      },
    });
    const response = await bedrockClient.send(command);

    res.json({
      modelId,
      inputS3Uri,
      outputS3Uri,
      outputPrefix,
      response,
    });
  } catch (error) {
    console.error("Bedrock image-to-video error details:", {
      name: error?.name,
      message: error?.message,
      metadata: error?.$metadata,
      cause: error?.cause,
    });
    res.status(500).json({
      message: "Bedrock image-to-video invoke failed",
      error: error?.message || String(error),
    });
  }
});

};
