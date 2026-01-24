const express = require("express");
const {
  BedrockRuntimeClient,
  InvokeModelCommand,
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
const Replicate = require("replicate");
const crypto = require("crypto");
const Jimp = require("jimp");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const allowedOrigin = "*";
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
const replicateClient = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN || "",
});

const imageModelConfig = {
  titan: {
    modelId:
      process.env.BEDROCK_TITAN_IMAGE_MODEL_ID ||
      "amazon.titan-image-generator-v2:0",
    provider: "titan",
    sizes: [
      { width: 1024, height: 1024 },
    ],
  },
  // Stability option removed until AWS Marketplace subscription is enabled.
};

const replicateModelConfig = {
  animagine: {
    modelId:
      "aisha-ai-official/animagine-xl-v4-opt:cfd0f86fbcd03df45fca7ce83af9bb9c07850a3317303fe8dcf677038541db8a",
    sizes: [{ width: 1024, height: 1024 }],
    buildInput: ({
      prompt,
      negativePrompt,
      width,
      height,
      numOutputs,
      seed,
    }) => ({
      vae: "default",
      model: "Animagine-XL-v4-Opt",
      seed: seed ?? -1,
      steps: 30,
      width,
      height,
      prompt,
      cfg_scale: 5,
      clip_skip: 1,
      pag_scale: 1,
      scheduler: "Euler a",
      batch_size: numOutputs,
      negative_prompt: negativePrompt || "bad quality, bad anatomy, worst quality, low quality, low resolutions, extra fingers, blur, blurry, ugly, wrongs proportions, watermark, image artifacts, lowres, ugly, jpeg artifacts, deformed, noisy image",
      guidance_rescale: 1,
      prepend_preprompt: true,
    }),
  },
  proteus: {
    modelId:
      "datacte/proteus-v0.3:b28b79d725c8548b173b6a19ff9bffd16b9b80df5b18b8dc5cb9e1ee471bfa48",
    sizes: [{ width: 1024, height: 1024 }],
    buildInput: ({
      prompt,
      negativePrompt,
      width,
      height,
      numOutputs,
    }) => ({
      width,
      height,
      prompt,
      scheduler: "DPM++2MSDE",
      num_outputs: numOutputs,
      guidance_scale: 7.5,
      disable_safety_checker: true,
      apply_watermark: true,
      negative_prompt:
        negativePrompt ||
        "bad quality, bad anatomy, worst quality, low quality, low resolutions, extra fingers, blur, blurry, ugly, wrongs proportions, watermark, image artifacts, lowres, ugly, jpeg artifacts, deformed, noisy image",
      prompt_strength: 0.8,
      num_inference_steps: 30,
    }),
  },
};

const buildImageKey = ({ provider = "bedrock", index = 0 }) => {
  const safeProvider = provider.replace(/[^a-zA-Z0-9-_]/g, "");
  return `images/${safeProvider}/${Date.now()}-${safeProvider}-${index}.png`;
};

const buildVideoReadyKey = (sourceKey = "") => {
  const baseName = sourceKey.split("/").pop()?.replace(/\.[^.]+$/, "") || "image";
  const safeBase = baseName.replace(/[^a-zA-Z0-9._-]/g, "") || "image";
  const hash = crypto.createHash("sha1").update(sourceKey).digest("hex").slice(0, 8);
  return `images/video-ready/${safeBase}-${hash}.jpg`;
};

const toVideoReadyBuffer = async (buffer) => {
  const image = await Jimp.read(buffer);
  image.cover(1280, 720);
  image.quality(90);
  return image.getBufferAsync(Jimp.MIME_JPEG);
};

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const fetchImageBuffer = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const contentType =
    response.headers.get("content-type") || "image/png";
  return { buffer: Buffer.from(arrayBuffer), contentType };
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

app.get("/s3/videos", async (req, res) => {
  const bucket = process.env.MEDIA_BUCKET;
  const maxKeys = Number(req.query?.maxKeys) || 100;

  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }

  try {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "videos/",
        MaxKeys: Math.min(maxKeys, 1000),
      })
    );

    const videos = (response.Contents || [])
      .filter((item) => item.Key && item.Key !== "videos/")
      .filter((item) => item.Key?.endsWith(".mp4"))
      .map((item) => ({
        key: item.Key,
        lastModified: item.LastModified,
        size: item.Size,
      }))
      .sort((a, b) => {
        const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0;
        const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0;
        return bTime - aTime;
      });

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

app.post("/bedrock/image/generate", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const modelKey = req.body?.model || "titan";
  const prompt = req.body?.prompt?.trim();
  const negativePrompt = req.body?.negativePrompt?.trim();
  const maxPromptLength = 512;
  const width = Number(req.body?.width) || 1280;
  const height = Number(req.body?.height) || 720;
  const numImages = Math.min(Math.max(Number(req.body?.numImages) || 1, 1), 4);
  const seed =
    req.body?.seed ?? Math.floor(Math.random() * 2147483647);

  console.log("Bedrock image generate request:", {
    modelKey,
    promptLength: prompt?.length || 0,
    hasNegativePrompt: Boolean(negativePrompt),
    width,
    height,
    numImages,
    seed,
  });

  if (!mediaBucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET must be set" });
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

  let requestBody;
  if (modelConfig.provider === "titan") {
    requestBody = {
      taskType: "TEXT_IMAGE",
      textToImageParams: {
        text: prompt,
        ...(negativePrompt ? { negativeText: negativePrompt } : {}),
      },
      imageGenerationConfig: {
        numberOfImages: numImages,
        quality: "premium",
        width,
        height,
        cfgScale: 8,
        seed,
      },
    };
  } else {
    requestBody = {
      text_prompts: [
        { text: prompt },
        ...(negativePrompt ? [{ text: negativePrompt, weight: -1 }] : []),
      ],
      cfg_scale: 7,
      steps: 30,
      width,
      height,
      seed,
      samples: numImages,
    };
  }

  try {
    console.log("Bedrock image generate invoke:", {
      modelId: modelConfig.modelId,
      provider: modelConfig.provider,
    });
    const command = new InvokeModelCommand({
      modelId: modelConfig.modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(requestBody),
    });
    const response = await bedrockClient.send(command);
    console.log("Bedrock image generate response metadata:", response?.$metadata);
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
      return res.status(500).json({
        message: "No images returned from Bedrock",
        response: responseBody,
      });
    }

    const images = [];
    for (let index = 0; index < imagesBase64.length; index += 1) {
      const base64 = imagesBase64[index];
      const buffer = Buffer.from(base64, "base64");
      const key = buildImageKey({
        provider: modelConfig.provider,
        index,
      });
      await s3Client.send(
        new PutObjectCommand({
          Bucket: mediaBucket,
          Key: key,
          Body: buffer,
          ContentType: "image/png",
        })
      );
      const url = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: mediaBucket,
          Key: key,
        }),
        { expiresIn: 900 }
      );
      const videoReadyKey = buildVideoReadyKey(key);
      const videoReadyBuffer = await toVideoReadyBuffer(buffer);
      await s3Client.send(
        new PutObjectCommand({
          Bucket: mediaBucket,
          Key: videoReadyKey,
          Body: videoReadyBuffer,
          ContentType: "image/jpeg",
        })
      );
      images.push({ key, url, videoReadyKey });
    }

    res.json({
      modelId: modelConfig.modelId,
      provider: modelConfig.provider,
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

app.post("/replicate/image/generate", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const modelKey = req.body?.model || "animagine";
  const prompt = req.body?.prompt?.trim();
  const negativePrompt = req.body?.negativePrompt?.trim();
  const width = Number(req.body?.width) || 1024;
  const height = Number(req.body?.height) || 1024;
  const numImages = Math.min(Math.max(Number(req.body?.numImages) || 1, 1), 4);
  const seed = req.body?.seed;

  console.log("Replicate image generate request:", {
    modelKey,
    promptLength: prompt?.length || 0,
    hasNegativePrompt: Boolean(negativePrompt),
    width,
    height,
    numImages,
  });

  if (!mediaBucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET must be set" });
  }
  if (!apiToken) {
    return res
      .status(500)
      .json({ message: "REPLICATE_API_TOKEN must be set" });
  }
  if (!prompt) {
    return res.status(400).json({ message: "prompt is required" });
  }
  const modelConfig = replicateModelConfig[modelKey];
  if (!modelConfig) {
    return res.status(400).json({
      message: `Unsupported model selection: ${modelKey}`,
      allowed: Object.keys(replicateModelConfig),
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

  try {
    const input = modelConfig.buildInput({
      prompt,
      negativePrompt,
      width,
      height,
      numOutputs: numImages,
      seed,
    });
    console.log("Replicate image generate invoke:", {
      modelId: modelConfig.modelId,
    });
    const output = await replicateClient.run(modelConfig.modelId, { input });
    const outputItems = Array.isArray(output) ? output : [output];
    const urls = outputItems
      .map((item) => {
        if (!item) return null;
        if (typeof item === "string") return item;
        if (typeof item.url === "function") return item.url();
        if (typeof item.url === "string") return item.url;
        return null;
      })
      .filter(Boolean);

    if (!urls.length) {
      return res.status(500).json({
        message: "No images returned from Replicate",
        response: output,
      });
    }

    const images = [];
    for (let index = 0; index < urls.length; index += 1) {
      const url = urls[index];
      const { buffer, contentType } = await fetchImageBuffer(url);
      const key = buildImageKey({
        provider: "replicate",
        index,
      });
      await s3Client.send(
        new PutObjectCommand({
          Bucket: mediaBucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        })
      );
      const signedUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: mediaBucket,
          Key: key,
        }),
        { expiresIn: 900 }
      );
      const videoReadyKey = buildVideoReadyKey(key);
      const videoReadyBuffer = await toVideoReadyBuffer(buffer);
      await s3Client.send(
        new PutObjectCommand({
          Bucket: mediaBucket,
          Key: videoReadyKey,
          Body: videoReadyBuffer,
          ContentType: "image/jpeg",
        })
      );
      images.push({ key, url: signedUrl, videoReadyKey });
    }

    res.json({
      modelId: modelConfig.modelId,
      provider: "replicate",
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
