const express = require("express");
const {
  BedrockRuntimeClient,
  StartAsyncInvokeCommand,
} = require("@aws-sdk/client-bedrock-runtime");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
app.use(express.json());

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || process.env.AWS_REGION,
});
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

app.get("/", (req, res) => {
  res.json({ message: "Hello from Express API on AWS Lambda!" });
});

app.get("/health", (req, res) => {
  res.json({ message: `available` });
});

app.get("/hello/:name", (req, res) => {
  res.json({ message: `Hello, ${req.params.name}!` });
});

app.post("/s3/image-upload-url", async (req, res) => {
  const bucket = process.env.MEDIA_BUCKET;
  const key = req.body?.key;
  const contentType = req.body?.contentType || "application/octet-stream";

  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!key) {
    return res.status(400).json({ message: "key is required" });
  }
  if (!key.startsWith("images/")) {
    return res
      .status(400)
      .json({ message: "key must start with images/" });
  }

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

app.post("/bedrock/nova-reel/image-to-video-s3", async (req, res) => {
  const prompt = req.body?.prompt || "A cinematic push-in on the scene.";
  const mediaBucket = process.env.MEDIA_BUCKET;
  const inputKey = req.body?.inputKey;
  const outputPrefix =
    req.body?.outputPrefix || req.body?.outputKey || "videos/";

  if (!mediaBucket) {
    return res.status(500).json({
      message: "MEDIA_BUCKET must be set",
    });
  }
  if (!inputKey) {
    return res.status(400).json({ message: "inputKey is required" });
  }
  if (!inputKey.startsWith("images/")) {
    return res
      .status(400)
      .json({ message: "inputKey must start with images/" });
  }
  if (!outputPrefix.startsWith("videos/")) {
    return res
      .status(400)
      .json({ message: "outputPrefix must start with videos/" });
  }

  const inputS3Uri = `s3://${mediaBucket}/${inputKey}`;
  // const inputS3Uri = "s3://staticwebawsaistack-mediabucketbcbb02ba-crjbe2oeh2eo/images/frieren.jpg"
  const outputS3Uri = `s3://${mediaBucket}/${outputPrefix}`;
  // const outputS3Uri = "s3://staticwebawsaistack-mediabucketbcbb02ba-crjbe2oeh2eo/videos/"
  const modelId =
    process.env.BEDROCK_MODEL_ID || "amazon.nova-reel-v1:1";
  const inputExtension = inputKey.split(".").pop()?.toLowerCase();
  const imageFormat = inputExtension === "jpg" ? "jpeg" : inputExtension;
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
    imageBase64 = imageBuffer.toString("base64");
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

module.exports = app;
