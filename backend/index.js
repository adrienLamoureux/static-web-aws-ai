const express = require("express");
const {
  BedrockRuntimeClient,
  StartAsyncInvokeCommand,
  GetAsyncInvokeCommand,
} = require("@aws-sdk/client-bedrock-runtime");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const allowedOrigin = process.env.CORS_ORIGIN || "*";
  res.header("Access-Control-Allow-Origin", allowedOrigin);
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});

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

app.get("/s3/images", async (req, res) => {
  const bucket = process.env.MEDIA_BUCKET;
  const maxKeys = Number(req.query?.maxKeys) || 100;
  const urlExpirationSeconds = 900;

  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }

  try {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "images/",
        MaxKeys: Math.min(maxKeys, 1000),
      })
    );

    const keys = (response.Contents || [])
      .map((item) => item.Key)
      .filter((key) => key && key !== "images/")
      .sort((a, b) => a.localeCompare(b));

    const images = await Promise.all(
      keys.map(async (key) => {
        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        });
        const url = await getSignedUrl(s3Client, command, {
          expiresIn: urlExpirationSeconds,
        });
        return { key, url };
      })
    );

    res.json({ bucket, images });
  } catch (error) {
    res.status(500).json({
      message: "Failed to list images",
      error: error?.message || String(error),
    });
  }
});

app.get("/s3/video-url", async (req, res) => {
  const bucket = process.env.MEDIA_BUCKET;
  const prefix = req.query?.prefix;
  const urlExpirationSeconds = 900;

  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!prefix) {
    return res.status(400).json({ message: "prefix is required" });
  }
  if (!prefix.startsWith("videos/")) {
    return res
      .status(400)
      .json({ message: "prefix must start with videos/" });
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

app.get("/bedrock/nova-reel/job-status", async (req, res) => {
  const invocationArn = req.query?.invocationArn;
  if (!invocationArn) {
    return res.status(400).json({ message: "invocationArn is required" });
  }

  try {
    const command = new GetAsyncInvokeCommand({ invocationArn });
    const response = await bedrockClient.send(command);
    res.json(response);
  } catch (error) {
    res.status(500).json({
      message: "Failed to get job status",
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
