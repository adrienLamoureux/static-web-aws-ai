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
  CopyObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const Replicate = require("replicate");
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
const promptHelperModelId =
  process.env.BEDROCK_PROMPT_HELPER_INFERENCE_PROFILE_ARN ||
  process.env.BEDROCK_PROMPT_HELPER_MODEL_ID ||
  process.env.BEDROCK_CLAUDE_MODEL_ID ||
  "us.anthropic.claude-haiku-4-5-20251001-v1:0";


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
    sizes: [
      { width: 1280, height: 720 },
      { width: 1024, height: 1024 },
      { width: 768, height: 1024 },
    ],
    schedulers: ["Euler a", "DPM++ 2M Karras"],
    buildInput: ({
      prompt,
      negativePrompt,
      width,
      height,
      numOutputs,
      seed,
      scheduler,
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
      scheduler: scheduler || "Euler a",
      batch_size: numOutputs,
      negative_prompt: negativePrompt || "bad quality, bad anatomy, worst quality, low quality, low resolutions, extra fingers, blur, blurry, ugly, wrongs proportions, watermark, image artifacts, lowres, ugly, jpeg artifacts, deformed, noisy image",
      guidance_rescale: 1,
      prepend_preprompt: true,
    }),
  },
  "seedream-4.5": {
    modelId: "bytedance/seedream-4.5",
    sizes: [
      { width: 2048, height: 2048 },
      { width: 2048, height: 1152 },
    ],
    buildInput: ({ prompt, width, height, numOutputs }) => {
      const aspectRatio =
        width === 2048 && height === 1152
          ? "16:9"
          : "1:1";
      return {
        size: "4K",
        width,
        height,
        prompt,
        max_images: numOutputs,
        image_input: [],
        aspect_ratio: aspectRatio,
        sequential_image_generation: "disabled",
      };
    },
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

const buildSafeBaseName = (value = "") => {
  const safeValue = value.replace(/[^a-zA-Z0-9._-]/g, "").trim();
  return safeValue || "image";
};

const buildImageKey = ({
  provider = "bedrock",
  index = 0,
  baseName = "",
  batchId = "",
}) => {
  const safeProvider = provider.replace(/[^a-zA-Z0-9-_]/g, "");
  const safeBase = buildSafeBaseName(baseName);
  const safeBatch = batchId.replace(/[^a-zA-Z0-9-_]/g, "");
  if (safeBatch) {
    return `images/${safeProvider}/${safeBatch}/${safeBase}-${index}.png`;
  }
  return `images/${safeProvider}/${safeBase}-${Date.now()}-${index}.png`;
};

const buildImageBatchId = () =>
  `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildSeedList = (count, seed) => {
  const baseSeed = Number.isFinite(Number(seed))
    ? Number(seed)
    : Math.floor(Math.random() * 2147483647);
  return Array.from({ length: count }, (_, index) => baseSeed + index);
};

const buildVideoReadyKey = (sourceKey = "") => {
  const baseName = sourceKey.split("/").pop()?.replace(/\.[^.]+$/, "") || "image";
  const safeBase = buildSafeBaseName(baseName);
  return `images/video-ready/${safeBase}.jpg`;
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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const extractRetryAfterSeconds = (errorMessage = "") => {
  const match = errorMessage.match(/retry_after\":\s*(\d+)/i);
  if (match?.[1]) {
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }
  return null;
};

const runReplicateWithRetry = async (modelId, input, maxAttempts = 3) => {
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      return await replicateClient.run(modelId, { input });
    } catch (error) {
      attempt += 1;
      const message = error?.message || String(error);
      const retryAfterSeconds = extractRetryAfterSeconds(message);
      if (attempt >= maxAttempts || retryAfterSeconds == null) {
        throw error;
      }
      await delay(Math.max(retryAfterSeconds * 1000, 1000));
    }
  }
  return null;
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

const fetchS3ImageBuffer = async (bucket, key) => {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
  const buffer = await streamToBuffer(response.Body);
  const contentType = response.ContentType || "image/jpeg";
  return { buffer, contentType };
};

const buildVideoOutputKey = (inputKey = "", outputPrefix = "videos/") => {
  const baseName = inputKey.split("/").pop()?.replace(/\.[^.]+$/, "") || "video";
  const safeBase = buildSafeBaseName(baseName);
  return `${outputPrefix}${safeBase}.mp4`;
};

const encodeS3Key = (key = "") =>
  encodeURIComponent(key).replace(/%2F/g, "/");

const buildVideoPosterKeyFromVideoKey = (videoKey = "") => {
  if (!videoKey) return "";
  if (videoKey.endsWith("/output.mp4")) {
    return videoKey.replace(/\/output\.mp4$/, "/poster.jpg");
  }
  if (videoKey.endsWith(".mp4")) {
    return videoKey.replace(/\.mp4$/, ".jpg");
  }
  return "";
};

const buildVideoPosterKeyFromPrefix = (outputPrefix = "videos/") => {
  const safePrefix = outputPrefix.endsWith("/")
    ? outputPrefix
    : `${outputPrefix}/`;
  return `${safePrefix}poster.jpg`;
};

const buildFolderPosterKeyFromVideoKey = (videoKey = "") => {
  const prefix = "videos/";
  if (!videoKey.startsWith(prefix)) return "";
  const lastSlash = videoKey.lastIndexOf("/");
  if (lastSlash <= prefix.length - 1) {
    return "";
  }
  return `${videoKey.slice(0, lastSlash + 1)}poster.jpg`;
};

const resolveVideoPosterKey = (videoKey = "", objectKeys = new Set()) => {
  if (!videoKey) return "";
  const directKey = buildVideoPosterKeyFromVideoKey(videoKey);
  if (directKey && objectKeys.has(directKey)) {
    return directKey;
  }
  const lastSlash = videoKey.lastIndexOf("/");
  if (lastSlash >= 0) {
    const fallbackKey = `${videoKey.slice(0, lastSlash + 1)}poster.jpg`;
    if (objectKeys.has(fallbackKey)) {
      return fallbackKey;
    }
  }
  return "";
};

const copyS3Object = async ({ bucket, sourceKey, destinationKey }) => {
  if (!bucket || !sourceKey || !destinationKey) return;
  const copySource = `${bucket}/${encodeS3Key(sourceKey)}`;
  await s3Client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: copySource,
      Key: destinationKey,
    })
  );
};

const getReplicateOutputUrl = (output) => {
  if (!output) return null;
  if (Array.isArray(output)) {
    for (const item of output) {
      const url = getReplicateOutputUrl(item);
      if (url) return url;
    }
    return null;
  }
  if (typeof output === "string") return output;
  if (typeof output.url === "function") return output.url();
  if (typeof output.url === "string") return output.url;
  return null;
};

const replicateVideoConfig = {
  "wan-2.2-i2v-fast": {
    modelId: "wan-video/wan-2.2-i2v-fast",
    requiresImage: true,
    buildInput: ({ imageUrl, prompt }) => ({
      image: imageUrl,
      prompt,
      go_fast: true,
      num_frames: 81,
      resolution: "480p",
      sample_shift: 12,
      frames_per_second: 16,
      interpolate_output: false,
      lora_scale_transformer: 1,
      lora_scale_transformer_2: 1,
      disable_safety_checker: true,
    }),
  },
  "veo-3.1-fast": {
    modelId: "google/veo-3.1-fast",
    requiresImage: true,
    buildInput: ({ imageUrl, prompt, generateAudio }) => ({
      image: imageUrl,
      prompt,
      duration: 8,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: generateAudio ?? true,
      last_frame: imageUrl,
    }),
  },
  "kling-v2.6": {
    modelId: "kwaivgi/kling-v2.6",
    requiresImage: true,
    buildInput: ({ prompt, imageUrl, generateAudio }) => ({
      prompt,
      start_image: imageUrl,
      duration: 5,
      aspect_ratio: "16:9",
      generate_audio: generateAudio ?? true,
      negative_prompt: "",
    }),
  },
  "seedance-1.5-pro": {
    modelId: "bytedance/seedance-1.5-pro",
    requiresImage: false,
    buildInput: ({ prompt, generateAudio }) => ({
      fps: 24,
      prompt,
      duration: 5,
      resolution: "480p",
      aspect_ratio: "16:9",
      camera_fixed: false,
      generate_audio: generateAudio ?? false,
    }),
  },
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

app.post("/bedrock/prompt-helper", async (req, res) => {
  const background = req.body?.background?.trim();
  const character = req.body?.character?.trim();
  const pose = req.body?.pose?.trim();
  const archetype = req.body?.archetype?.trim();
  const signatureTraits = req.body?.signatureTraits?.trim();
  const faceDetails = req.body?.faceDetails?.trim();
  const eyeDetails = req.body?.eyeDetails?.trim();
  const hairDetails = req.body?.hairDetails?.trim();
  const expression = req.body?.expression?.trim();
  const outfitMaterials = req.body?.outfitMaterials?.trim();
  const colorPalette = req.body?.colorPalette?.trim();
  const styleReference = req.body?.styleReference?.trim();

  const hasSelection = Boolean(
    background ||
      character ||
      pose ||
      archetype ||
      signatureTraits ||
      faceDetails ||
      eyeDetails ||
      hairDetails ||
      expression ||
      outfitMaterials ||
      colorPalette ||
      styleReference
  );
  if (!hasSelection) {
    return res.status(400).json({
      message: "At least one selection is required.",
    });
  }

  const selectionLines = [
    background ? `Background: ${background}` : null,
    character ? `Character: ${character}` : null,
    pose ? `Pose: ${pose}` : null,
    archetype ? `Archetype: ${archetype}` : null,
    signatureTraits ? `Signature traits: ${signatureTraits}` : null,
    faceDetails ? `Face details: ${faceDetails}` : null,
    eyeDetails ? `Eye details: ${eyeDetails}` : null,
    hairDetails ? `Hair details: ${hairDetails}` : null,
    expression ? `Expression: ${expression}` : null,
    outfitMaterials ? `Outfit/materials: ${outfitMaterials}` : null,
    colorPalette ? `Color palette: ${colorPalette}` : null,
    styleReference ? `Style reference: ${styleReference}` : null,
  ].filter(Boolean);

  const userPrompt = [
    "Create two outputs for AI image generation.",
    "1) A compact positive prompt under 650 characters.",
    "2) A concise negative prompt under 200 characters.",
    "Avoid bullet lists or quotes. Use comma-separated keywords/phrases.",
    "Depict a single character only; do not introduce additional characters or companions.",
    "Treat all provided traits as belonging to the same single character.",
    "Use short, punchy phrases; avoid full sentences.",
    "Start the positive prompt with: masterpiece, best quality, amazing quality, very aesthetic, ultra-detailed.",
    "Do not use bracketed placeholders or section headers.",
    "Start with the character name and core identity.",
    "Include these phrases verbatim early in the prompt: anime cinematic illustration; faithful anime character design; accurate facial features; consistent identity.",
    "Follow this order of information after the character identity:",
    "camera & framing, character placement, pose & body dynamics, outfit/material/color fidelity, hair/fabric motion, action/interaction, effects (controlled), background type, environment details, depth/lighting, art quality & style, image clarity & coherence.",
    "For named characters, explicitly call out facial details first (eye color/shape, face structure, expression) and hair color/style.",
    "Use the following selections when present:",
    selectionLines.join("\n"),
    "Keep it as a single comma-separated line with those sections implied by order.",
    "Return in this exact format:",
    "POSITIVE: <text>",
    "NEGATIVE: <text>",
    
  ].join("\n");

  try {
    const command = new InvokeModelCommand({
      modelId: promptHelperModelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 300,
        temperature: 0.2,
        system:
          "You write concise, expressive positive prompts for AI image generation.",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: userPrompt }],
          },
        ],
      }),
    });
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body)
    );
    const responseText = (responseBody?.content || [])
      .map((item) => item?.text)
      .filter(Boolean)
      .join("")
      .trim();

    if (!responseText) {
      return res.status(500).json({
        message: "Prompt helper returned an empty response.",
        response: responseBody,
      });
    }

    const positiveMatch = responseText.match(/POSITIVE:\s*(.*)/i);
    const negativeMatch = responseText.match(/NEGATIVE:\s*(.*)/i);
    const positivePrompt = positiveMatch?.[1]?.trim() || "";
    const negativePrompt = negativeMatch?.[1]?.trim() || "";
    const singleCharacterNegative =
      "multiple characters, crowd, group, duo, twins, background characters, extra people, two people";

    if (!positivePrompt) {
      return res.status(500).json({
        message: "Prompt helper did not return a positive prompt.",
        response: responseBody,
      });
    }
    res.json({
      prompt: positivePrompt,
      negativePrompt: [
        negativePrompt,
        singleCharacterNegative,
      ]
        .filter(Boolean)
        .join(", "),
      modelId: promptHelperModelId,
    });
  } catch (error) {
    console.error("Prompt helper error details:", {
      name: error?.name,
      message: error?.message,
      metadata: error?.$metadata,
      cause: error?.cause,
    });
    res.status(500).json({
      message: "Prompt helper request failed",
      error: error?.message || String(error),
    });
  }
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

app.post("/s3/images/delete", async (req, res) => {
  const bucket = process.env.MEDIA_BUCKET;
  const key = req.body?.key;

  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!key || typeof key !== "string") {
    return res.status(400).json({ message: "key is required" });
  }
  if (!key.startsWith("images/")) {
    return res.status(400).json({ message: "key must start with images/" });
  }

  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    res.json({ key, deleted: true });
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete image",
      error: error?.message || String(error),
    });
  }
});

app.post("/s3/videos/delete", async (req, res) => {
  const bucket = process.env.MEDIA_BUCKET;
  const key = req.body?.key;

  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!key || typeof key !== "string") {
    return res.status(400).json({ message: "key is required" });
  }
  if (!key.startsWith("videos/")) {
    return res.status(400).json({ message: "key must start with videos/" });
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

app.get("/s3/videos", async (req, res) => {
  const bucket = process.env.MEDIA_BUCKET;
  const maxKeys = Number(req.query?.maxKeys) || 100;
  const includeUrls = req.query?.includeUrls === "true";
  const includePosters = req.query?.includePosters === "true";
  const urlExpirationSeconds = 900;

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

    const objects = response.Contents || [];
    const objectKeys = new Set(
      objects.map((item) => item.Key).filter(Boolean)
    );

    const videos = objects
      .filter((item) => item.Key && item.Key !== "videos/")
      .filter((item) => item.Key?.endsWith(".mp4"))
      .filter((item) => !item.Key?.endsWith("/output.mp4"))
      .map((item) => {
        const key = item.Key || "";
        const posterKey = resolveVideoPosterKey(key, objectKeys);
        return {
          key,
          fileName: key.split("/").pop() || key,
          lastModified: item.LastModified,
          size: item.Size,
          posterKey,
        };
      })
      .sort((a, b) => {
        const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0;
        const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0;
        return bTime - aTime;
      });

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
  const inputKey = req.query?.inputKey;
  const outputPrefix = req.query?.outputPrefix;
  if (!invocationArn) {
    return res.status(400).json({ message: "invocationArn is required" });
  }

  try {
    const command = new GetAsyncInvokeCommand({ invocationArn });
    const response = await bedrockClient.send(command);
    if (
      response?.status === "Completed" &&
      inputKey &&
      outputPrefix &&
      outputPrefix.startsWith("videos/")
    ) {
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
  const modelKey = req.body?.model || "titan";
  const imageName = req.body?.imageName?.trim();
  const prompt = req.body?.prompt?.trim();
  const negativePrompt = req.body?.negativePrompt?.trim();
  const maxPromptLength = 900;
  const width = Number(req.body?.width) || 1280;
  const height = Number(req.body?.height) || 720;
  const requestedImages = Number(req.body?.numImages) || 2;
  const numImages = Math.min(Math.max(requestedImages, 1), 3);
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

app.post("/replicate/image/generate", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const modelKey = req.body?.model || "animagine";
  const imageName = req.body?.imageName?.trim();
  const prompt = req.body?.prompt?.trim();
  const negativePrompt = req.body?.negativePrompt?.trim();
  const maxPromptLength = 900;
  const width = Number(req.body?.width) || 1024;
  const height = Number(req.body?.height) || 1024;
  const scheduler = req.body?.scheduler;
  const requestedImages = Number(req.body?.numImages) || 2;
  const isDiffScheduler = scheduler === "diff";
  const numImages = Math.min(
    Math.max(isDiffScheduler ? 2 : requestedImages, 1),
    3
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
            prompt,
            negativePrompt,
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
      notice: `Generating ${numImages} images with a staggered start. This can take a bit.`,
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

app.post("/images/select", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const selectedKey = req.body?.key;

  if (!mediaBucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET must be set" });
  }
  if (!selectedKey || typeof selectedKey !== "string") {
    return res.status(400).json({ message: "key is required" });
  }
  if (!selectedKey.startsWith("images/")) {
    return res.status(400).json({ message: "key must start with images/" });
  }

  const keyParts = selectedKey.split("/");
  if (keyParts.length < 4) {
    return res.status(400).json({
      message: "key must include a batch folder",
    });
  }
  const batchPrefix = `${keyParts.slice(0, 3).join("/")}/`;

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

app.post("/replicate/video/generate", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const modelKey = req.body?.model || "wan-2.2-i2v-fast";
  const inputKey = req.body?.inputKey;
  const imageUrl = req.body?.imageUrl;
  const prompt = req.body?.prompt?.trim();
  const generateAudio = req.body?.generateAudio;

  if (!mediaBucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET must be set" });
  }
  if (!apiToken) {
    return res
      .status(500)
      .json({ message: "REPLICATE_API_TOKEN must be set" });
  }
  if (!inputKey) {
    return res.status(400).json({ message: "inputKey is required" });
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
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const predictionId = req.query?.predictionId;
  const inputKey = req.query?.inputKey;

  if (!mediaBucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET must be set" });
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

app.post("/bedrock/nova-reel/image-to-video-s3", async (req, res) => {
  const prompt = req.body?.prompt || "A cinematic push-in on the scene.";
  const mediaBucket = process.env.MEDIA_BUCKET;
  const inputKey = req.body?.inputKey;
  const outputPrefix =
    req.body?.outputPrefix || req.body?.outputKey || "videos/";
  const requestedModel = req.body?.model;

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
