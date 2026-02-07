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
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const Replicate = require("replicate");
const Jimp = require("jimp");
const promptBackgrounds = require("./data/prompt-helper/backgrounds.json");
const promptPoses = require("./data/prompt-helper/poses.json");
const promptTraits = require("./data/prompt-helper/traits.json");
const promptFaceDetails = require("./data/prompt-helper/face-details.json");
const promptEyeDetails = require("./data/prompt-helper/eye-details.json");
const promptHairDetails = require("./data/prompt-helper/hair-details.json");
const promptEars = require("./data/prompt-helper/ears.json");
const promptTails = require("./data/prompt-helper/tails.json");
const promptHorns = require("./data/prompt-helper/horns.json");
const promptWings = require("./data/prompt-helper/wings.json");
const promptHairStyles = require("./data/prompt-helper/hair-styles.json");
const promptViewDistance = require("./data/prompt-helper/view-distance.json");
const promptAccessories = require("./data/prompt-helper/accessories.json");
const promptMarkings = require("./data/prompt-helper/markings.json");
const promptOutfits = require("./data/prompt-helper/outfits.json");
const promptStyles = require("./data/prompt-helper/styles.json");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const allowedOrigin = "*";
  res.header("Access-Control-Allow-Origin", allowedOrigin);
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
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
const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.AWS_REGION,
  })
);
const mediaTable = process.env.MEDIA_TABLE;
const promptHelperModelId =
  process.env.BEDROCK_PROMPT_HELPER_INFERENCE_PROFILE_ARN ||
  process.env.BEDROCK_PROMPT_HELPER_MODEL_ID ||
  process.env.BEDROCK_CLAUDE_MODEL_ID ||
  "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const storyModelId =
  process.env.BEDROCK_STORY_MODEL_ID || promptHelperModelId;
const DEFAULT_NEGATIVE_PROMPT =
  "low quality, worst quality, lowres, pixelated, jpeg artifacts, compression artifacts, blurry, out of focus, oversharpened, grainy, noisy, dithering, flat shading, muddy colors, bad anatomy, bad proportions, multiple characters, extra people, clone, twin, reflection, mirror, big eyes, wide eyes, sparkly eyes";


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
      negative_prompt: negativePrompt || DEFAULT_NEGATIVE_PROMPT,
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

const pickOption = (options = [], value = "", fallback = "") => {
  if (value && options.includes(value)) return value;
  if (fallback && options.includes(fallback)) return fallback;
  return options[0] || "";
};

const buildPresetPrompt = (character) => {
  const parts = [];
  const push = (value) => {
    if (value) parts.push(value);
  };

  // 1) Shot range
  push(character.viewDistance);
  // 2) Environment / background
  push(character.background);
  // 3) Character block
  if (character.name) {
    parts.push("1girl, solo");
    const weight =
      typeof character.weight === "number" ? character.weight : 1.4;
    parts.push(`(${character.name}:${weight})`);
  }
  push(character.signatureTraits);
  // 4) Focus
  push(character.eyeDetails);
  push(character.pose);
  // 5) Face + features
  push(character.faceDetails);
  push(character.hairDetails);
  push(character.ears);
  push(character.tails);
  push(character.horns);
  push(character.wings);
  push(character.hairStyles);
  push(character.accessories);
  push(character.markings);
  // 6) Clothes
  push(character.outfitMaterials);
  // 7) Visuals
  push(character.styleReference);

  return parts.filter(Boolean).join(", ");
};

const withPresetPrompt = (character) => {
  const prompt = buildPresetPrompt(character);
  return {
    ...character,
    identityPrompt: prompt,
    storyBasePrompt: prompt,
  };
};

const storyCharacters = [
  withPresetPrompt({
    id: "frieren",
    name: "Frieren from Beyond Journey's End",
    weight: 1.5,
    viewDistance: pickOption(promptViewDistance, "long shot"),
    background: pickOption(
      promptBackgrounds,
      "sandy beach at noon, blue sky, turquoise ocean dominate background"
    ),
    signatureTraits: pickOption(
      promptTraits,
      "official Frieren, recognizable character"
    ),
    eyeDetails: pickOption(promptEyeDetails, "eyes looking at the viewer"),
    faceDetails: pickOption(promptFaceDetails, "cute soft young face"),
    outfitMaterials: pickOption(
      promptOutfits,
      "wearing a cute two-piece bikini"
    ),
    styleReference: pickOption(
      promptStyles,
      "tasteful anime design, character more detailed than background, anime key visual art, gacha"
    ),
    storyNegativePrompt: DEFAULT_NEGATIVE_PROMPT,
  }),
];

const storyPresets = [
  {
    id: "frieren-road",
    name: "Frieren’s Road",
    synopsis:
      "A quiet journey across misty towns and open fields. Intimate conversations, reflective moments, and gentle adventure.",
    protagonistId: "frieren",
    worldPrompt:
      "fantasy countryside, soft winds, medieval villages, mossy stone roads, tranquil skies",
    stylePrompt:
      "anime cinematic illustration, soft pastel palette, luminous lighting, delicate line art, painterly shading",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    opening:
      "The road opens into a quiet valley, the wind carrying distant bells. Frieren walks ahead in thoughtful silence, then glances back with a small smile. “We can rest in the next village—or take the ridge and see the lakes at sunset. What feels right to you?”",
  },
  {
    id: "moonlit-tavern",
    name: "Moonlit Tavern",
    synopsis:
      "A cozy tavern at the edge of the kingdom. Warm lantern light, mysterious travelers, and a slowly unfolding quest.",
    protagonistId: "frieren",
    worldPrompt:
      "cozy tavern interior, candlelight glow, wooden beams, rain outside windows, warm ambience",
    stylePrompt:
      "anime cinematic illustration, warm amber lighting, soft grain, detailed textures, gentle bokeh",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    opening:
      "The tavern door creaks and the scent of rain drifts in. Frieren takes a seat by the hearth, brushing droplets from her cloak. “There’s a traveler here who knows the old ruins,” she says, eyes glinting in the firelight. “Do we listen, or keep moving?”",
  },
  {
    id: "celestial-ruins",
    name: "Celestial Ruins",
    synopsis:
      "Ancient sky-temples and starlit relics. The world feels older here, and the air hums with quiet magic.",
    protagonistId: "frieren",
    worldPrompt:
      "ancient ruins above the clouds, floating stone, starlit sky, glowing runes, ethereal atmosphere",
    stylePrompt:
      "anime cinematic illustration, high contrast moonlight, cool blue palette, ethereal glow, ultra-detailed",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    opening:
      "The staircase ends above the clouds, where ancient stones hum with starlight. Frieren pauses, listening to the wind. “These ruins are alive with memory,” she whispers. “Do we trace the runes, or search for the relic first?”",
  },
];

const promptHelperDefaults = {
  backgrounds: promptBackgrounds,
  poses: promptPoses,
  traits: promptTraits,
  faceDetails: promptFaceDetails,
  eyeDetails: promptEyeDetails,
  hairDetails: promptHairDetails,
  ears: promptEars,
  tails: promptTails,
  horns: promptHorns,
  wings: promptWings,
  hairStyles: promptHairStyles,
  viewDistance: promptViewDistance,
  accessories: promptAccessories,
  markings: promptMarkings,
  outfits: promptOutfits,
  styles: promptStyles,
};

const buildCharacterPrompt = (character) => {
  if (!character) return "";
  return buildPresetPrompt(character);
};

const ensurePromptHelperOptions = async () => {
  const pk = buildPromptHelperPk();
  const existing = await queryBySkPrefix({
    pk,
    skPrefix: buildPromptHelperSk(""),
    limit: 50,
    scanForward: true,
  });
  const existingMap = new Map(
    existing.map((item) => [item.key || "", item])
  );
  const updates = Object.entries(promptHelperDefaults).filter(
    ([key, options]) => {
      const current = existingMap.get(key);
      if (!current || !Array.isArray(current.options)) return true;
      return JSON.stringify(current.options) !== JSON.stringify(options);
    }
  );
  if (updates.length) {
    await Promise.all(
      updates.map(([key, options]) =>
        dynamoClient.send(
          new PutCommand({
            TableName: mediaTable,
            Item: {
              pk,
              sk: buildPromptHelperSk(key),
              type: "PROMPT_HELPER_OPTIONS",
              key,
              options,
              createdAt: new Date().toISOString(),
            },
          })
        )
      )
    );
  }
  const refreshed = await queryBySkPrefix({
    pk,
    skPrefix: buildPromptHelperSk(""),
    limit: 50,
    scanForward: true,
  });
  return refreshed;
};

const ensureStoryCharacters = async () => {
  const pk = buildStoryCharacterPk();
  const existing = await queryBySkPrefix({
    pk,
    skPrefix: buildStoryCharacterSk(""),
    limit: 20,
    scanForward: true,
  });
  if (existing.length > 0) {
    const existingMap = new Map(
      existing.map((item) => [item.id || "", item])
    );
    const fieldsToCompare = [
      "name",
      "weight",
      "background",
      "pose",
      "signatureTraits",
      "faceDetails",
      "eyeDetails",
      "hairDetails",
      "ears",
      "tails",
      "horns",
      "wings",
      "hairStyles",
      "viewDistance",
      "accessories",
      "markings",
      "outfitMaterials",
      "styleReference",
      "identityPrompt",
      "storyBasePrompt",
      "storyNegativePrompt",
    ];
    const updates = storyCharacters.filter((character) => {
      const current = existingMap.get(character.id);
      if (!current) return false;
      return fieldsToCompare.some(
        (field) => (current[field] || "") !== (character[field] || "")
      );
    });
    if (updates.length) {
      await Promise.all(
        updates.map((character) =>
          dynamoClient.send(
            new PutCommand({
              TableName: mediaTable,
              Item: {
                pk,
                sk: buildStoryCharacterSk(character.id),
                type: "STORY_CHARACTER",
                ...character,
                createdAt: character.createdAt || new Date().toISOString(),
              },
            })
          )
        )
      );
      const refreshed = await queryBySkPrefix({
        pk,
        skPrefix: buildStoryCharacterSk(""),
        limit: 20,
        scanForward: true,
      });
      return refreshed;
    }
    return existing;
  }
  await Promise.all(
    storyCharacters.map((character) =>
      dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: {
            pk,
            sk: buildStoryCharacterSk(character.id),
            type: "STORY_CHARACTER",
            ...character,
            createdAt: new Date().toISOString(),
          },
        })
      )
    )
  );
  return storyCharacters.map((character) => ({
    pk,
    sk: buildStoryCharacterSk(character.id),
    type: "STORY_CHARACTER",
    ...character,
  }));
};

const ensureStoryPresets = async () => {
  const pk = buildStoryPresetPk();
  await ensureStoryCharacters();
  const existing = await queryBySkPrefix({
    pk,
    skPrefix: buildStoryPresetSk(""),
    limit: 5,
    scanForward: true,
  });
  if (existing.length > 0) {
    const existingMap = new Map(
      existing.map((item) => [item.id || "", item])
    );
    const updates = storyPresets.filter((preset) => {
      const current = existingMap.get(preset.id);
      return (
        current &&
        (!current.protagonistId ||
          current.protagonistId !== preset.protagonistId)
      );
    });
    if (updates.length) {
      await Promise.all(
        updates.map((preset) =>
          dynamoClient.send(
            new PutCommand({
              TableName: mediaTable,
              Item: {
                pk,
                sk: buildStoryPresetSk(preset.id),
                type: "STORY_PRESET",
                ...preset,
                createdAt: preset.createdAt || new Date().toISOString(),
              },
            })
          )
        )
      );
      const refreshed = await queryBySkPrefix({
        pk,
        skPrefix: buildStoryPresetSk(""),
        limit: 5,
        scanForward: true,
      });
      return refreshed;
    }
    return existing;
  }
  await Promise.all(
    storyPresets.map((preset) =>
      dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: {
            pk,
            sk: buildStoryPresetSk(preset.id),
            type: "STORY_PRESET",
            ...preset,
            createdAt: new Date().toISOString(),
          },
        })
      )
    )
  );
  return storyPresets.map((preset) => ({
    pk,
    sk: buildStoryPresetSk(preset.id),
    type: "STORY_PRESET",
    ...preset,
  }));
};

const safeJsonParse = (text = "") => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (err) {
      return null;
    }
  }
};

const parsePromptHelperResponse = (text = "") => {
  const parsed = safeJsonParse(text);
  if (parsed?.positivePrompt || parsed?.negativePrompt) {
    return {
      positive: parsed.positivePrompt?.trim() || "",
      negative: parsed.negativePrompt?.trim() || "",
    };
  }
  const positiveMatch = text.match(/POSITIVE:\s*([\s\S]*?)(?:\nNEGATIVE:|$)/i);
  const negativeMatch = text.match(/NEGATIVE:\s*([\s\S]*)/i);
  return {
    positive: positiveMatch?.[1]?.trim() || "",
    negative: negativeMatch?.[1]?.trim() || "",
  };
};

const parseSceneHelperResponse = (text = "") => {
  const parsed = safeJsonParse(text);
  if (parsed?.scenePrompt) {
    return {
      scenePrompt: parsed.scenePrompt?.trim() || "",
    };
  }
  const sceneMatch = text.match(/SCENE:\s*([\s\S]*?)(?:\n|$)/i);
  return {
    scenePrompt: sceneMatch?.[1]?.trim() || "",
  };
};

const sanitizeScenePrompt = (value = "") => {
  if (!value) return "";
  return value
    .replace(/close[- ]?up/gi, "")
    .replace(/extreme close[- ]?up/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const MAX_REPLICATE_PROMPT_TOKENS = 75;

const estimateTokenCount = (value = "") =>
  value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

const clampPromptTokens = (value = "", maxTokens = MAX_REPLICATE_PROMPT_TOKENS) => {
  if (!value) return "";
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  let tokenCount = 0;
  const kept = [];
  for (const part of parts) {
    const partTokens = part.split(/\s+/).filter(Boolean);
    if (tokenCount + partTokens.length > maxTokens) {
      break;
    }
    kept.push(part);
    tokenCount += partTokens.length;
  }
  if (kept.length) {
    return kept.join(", ");
  }
  const fallbackTokens = parts[0]?.split(/\s+/).filter(Boolean) || [];
  return fallbackTokens.slice(0, maxTokens).join(" ");
};

const buildSafeBaseName = (value = "") => {
  const safeValue = value.replace(/[^a-zA-Z0-9._-]/g, "").trim();
  return safeValue || "image";
};

const buildImageKey = ({
  userId = "",
  provider = "bedrock",
  index = 0,
  baseName = "",
  batchId = "",
}) => {
  const safeProvider = provider.replace(/[^a-zA-Z0-9-_]/g, "");
  const safeBase = buildSafeBaseName(baseName);
  const safeBatch = batchId.replace(/[^a-zA-Z0-9-_]/g, "");
  const prefix = userId ? buildUserPrefix(userId) : "";
  if (safeBatch) {
    return `${prefix}images/${safeProvider}/${safeBatch}/${safeBase}-${index}.png`;
  }
  return `${prefix}images/${safeProvider}/${safeBase}-${Date.now()}-${index}.png`;
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
  const prefixMatch = sourceKey.match(/^(users\/[^/]+\/)/);
  const prefix = prefixMatch ? prefixMatch[1] : "";
  return `${prefix}images/video-ready/${safeBase}.jpg`;
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

const decodeJwtPayload = (token = "") => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload, "base64").toString("utf-8");
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
};

const getUserFromRequest = (req) => {
  const claims =
    req.apiGateway?.event?.requestContext?.authorizer?.claims ||
    req.requestContext?.authorizer?.claims;
  if (claims?.sub) {
    return {
      sub: claims.sub,
      email: claims.email,
    };
  }
  const authHeader =
    req.headers?.authorization || req.headers?.Authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = decodeJwtPayload(token);
    if (payload?.sub) {
      return {
        sub: payload.sub,
        email: payload.email,
      };
    }
  }
  return null;
};

const buildUserPrefix = (userId = "") => `users/${userId}/`;

const ensureUserKey = (key = "", userId = "") => {
  const prefix = buildUserPrefix(userId);
  if (!key.startsWith(prefix)) {
    throw new Error("key must belong to the current user");
  }
};

const buildMediaPk = (userId = "") => `USER#${userId}`;
const buildMediaSk = (type = "IMG", key = "") => `${type}#${key}`;
const buildStoryPresetPk = () => "PRESET#STORY";
const buildStoryPresetSk = (presetId = "") => `PRESET#${presetId}`;
const buildStoryCharacterPk = () => "PRESET#CHARACTER";
const buildStoryCharacterSk = (characterId = "") => `CHARACTER#${characterId}`;
const buildPromptHelperPk = () => "PRESET#PROMPT_HELPER";
const buildPromptHelperSk = (key = "") => `OPTIONS#${key.toUpperCase()}`;
const buildStorySessionSk = (sessionId = "") => `SESSION#${sessionId}`;
const buildStoryMessageSk = (sessionId = "", timestamp = Date.now()) =>
  `SESSION#${sessionId}#MSG#${String(timestamp).padStart(13, "0")}`;
const buildStorySceneSk = (sessionId = "", sceneId = "") =>
  `SESSION#${sessionId}#SCENE#${sceneId}`;
const storyMessagePrefix = (sessionId = "") => `SESSION#${sessionId}#MSG#`;
const storyScenePrefix = (sessionId = "") => `SESSION#${sessionId}#SCENE#`;

const putMediaItem = async ({ userId, type, key, extra = {} }) => {
  if (!mediaTable || !userId || !key) return;
  const item = {
    pk: buildMediaPk(userId),
    sk: buildMediaSk(type, key),
    type,
    key,
    createdAt: new Date().toISOString(),
    ...extra,
  };
  await dynamoClient.send(
    new PutCommand({
      TableName: mediaTable,
      Item: item,
    })
  );
};

const deleteMediaItem = async ({ userId, type, key }) => {
  if (!mediaTable || !userId || !key) return;
  await dynamoClient.send(
    new DeleteCommand({
      TableName: mediaTable,
      Key: {
        pk: buildMediaPk(userId),
        sk: buildMediaSk(type, key),
      },
    })
  );
};

const queryMediaItems = async ({ userId, type }) => {
  if (!mediaTable || !userId) return [];
  const response = await dynamoClient.send(
    new QueryCommand({
      TableName: mediaTable,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": buildMediaPk(userId),
        ":skPrefix": `${type}#`,
      },
      ScanIndexForward: false,
    })
  );
  return response.Items || [];
};

const getItem = async ({ pk, sk }) => {
  if (!mediaTable || !pk || !sk) return null;
  const response = await dynamoClient.send(
    new GetCommand({
      TableName: mediaTable,
      Key: { pk, sk },
    })
  );
  return response.Item || null;
};

const queryBySkPrefix = async ({
  pk,
  skPrefix,
  limit = 100,
  scanForward = true,
}) => {
  if (!mediaTable || !pk || !skPrefix) return [];
  const response = await dynamoClient.send(
    new QueryCommand({
      TableName: mediaTable,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":skPrefix": skPrefix,
      },
      ScanIndexForward: scanForward,
      Limit: limit,
    })
  );
  return response.Items || [];
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
  const inputPrefixMatch = inputKey.match(/^(users\/[^/]+\/)/);
  const userPrefix = inputPrefixMatch ? inputPrefixMatch[1] : "";
  const normalizedPrefix = outputPrefix.startsWith("users/")
    ? outputPrefix
    : `${userPrefix}${outputPrefix}`;
  return `${normalizedPrefix}${safeBase}.mp4`;
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
  if (!videoKey) return "";
  const marker = "/videos/";
  const markerIndex = videoKey.indexOf(marker);
  if (markerIndex === -1) return "";
  const lastSlash = videoKey.lastIndexOf("/");
  if (lastSlash <= markerIndex + marker.length - 1) {
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

app.use((req, res, next) => {
  if (req.method === "OPTIONS") return next();
  if (req.path === "/" || req.path === "/health") return next();
  const user = getUserFromRequest(req);
  if (!user?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  req.user = user;
  return next();
});

app.get("/", (req, res) => {
  res.json({ message: "Hello from Express API on AWS Lambda!" });
});

app.get("/health", (req, res) => {
  res.json({ message: `available` });
});

app.get("/hello/:name", (req, res) => {
  res.json({ message: `Hello, ${req.params.name}!` });
});

app.get("/prompt-helper/options", async (req, res) => {
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  try {
    const items = await ensurePromptHelperOptions();
    const optionMap = new Map(
      items.map((item) => [item.key || "", item.options || []])
    );
    const getOption = (key) =>
      Array.isArray(optionMap.get(key))
        ? optionMap.get(key)
        : promptHelperDefaults[key] || [];
    res.json({
      backgrounds: getOption("backgrounds"),
      poses: getOption("poses"),
      traits: getOption("traits"),
      faceDetails: getOption("faceDetails"),
      eyeDetails: getOption("eyeDetails"),
      hairDetails: getOption("hairDetails"),
      ears: getOption("ears"),
      tails: getOption("tails"),
      horns: getOption("horns"),
      wings: getOption("wings"),
      hairStyles: getOption("hairStyles"),
      viewDistance: getOption("viewDistance"),
      accessories: getOption("accessories"),
      markings: getOption("markings"),
      outfits: getOption("outfits"),
      styles: getOption("styles"),
      negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to load prompt helper options",
      error: error?.message || String(error),
    });
  }
});

app.post("/bedrock/prompt-helper", async (req, res) => {
  const background = req.body?.background?.trim();
  const character = req.body?.character?.trim();
  const pose = req.body?.pose?.trim();
  const signatureTraits = req.body?.signatureTraits?.trim();
  const faceDetails = req.body?.faceDetails?.trim();
  const eyeDetails = req.body?.eyeDetails?.trim();
  const hairDetails = req.body?.hairDetails?.trim();
  const ears = req.body?.ears?.trim();
  const tails = req.body?.tails?.trim();
  const horns = req.body?.horns?.trim();
  const wings = req.body?.wings?.trim();
  const hairStyles = req.body?.hairStyles?.trim();
  const viewDistance = req.body?.viewDistance?.trim();
  const accessories = req.body?.accessories?.trim();
  const markings = req.body?.markings?.trim();
  const outfitMaterials = req.body?.outfitMaterials?.trim();
  const styleReference = req.body?.styleReference?.trim();

  const hasSelection = Boolean(
      background ||
      character ||
      pose ||
      signatureTraits ||
      faceDetails ||
      eyeDetails ||
      hairDetails ||
      ears ||
      tails ||
      horns ||
      wings ||
      hairStyles ||
      viewDistance ||
      accessories ||
      markings ||
      outfitMaterials ||
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
    signatureTraits ? `Signature traits: ${signatureTraits}` : null,
    faceDetails ? `Face details: ${faceDetails}` : null,
    eyeDetails ? `Eye details: ${eyeDetails}` : null,
    hairDetails ? `Hair details: ${hairDetails}` : null,
    ears ? `Ears: ${ears}` : null,
    tails ? `Tail: ${tails}` : null,
    horns ? `Horns: ${horns}` : null,
    wings ? `Wings: ${wings}` : null,
    hairStyles ? `Hair style: ${hairStyles}` : null,
    viewDistance ? `View distance: ${viewDistance}` : null,
    accessories ? `Accessories: ${accessories}` : null,
    markings ? `Markings: ${markings}` : null,
    outfitMaterials ? `Outfit/materials: ${outfitMaterials}` : null,
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
    "Do not include the model preprompt tokens: masterpiece, high score, great score, absurdres.",
    "Do not include the model negative preprompt tokens: lowres, bad anatomy, bad hands, text, error, missing finger, extra digits, fewer digits, cropped, worst quality, low quality, low score, bad score, average score, signature, watermark, username, blurry, bad_fingers, extra_fingers, mutated_fingers, mutated_hands, six_fingers.",
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
  const userId = req.user?.sub;
  const fileName = req.body?.fileName || "upload";
  const contentType = req.body?.contentType || "application/octet-stream";

  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const safeBase = buildSafeBaseName(fileName);
  const extension = contentType.includes("png") ? "png" : "jpg";
  const key = `${buildUserPrefix(userId)}images/uploads/${safeBase}-${Date.now()}.${extension}`;

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

app.post("/images/video-ready", async (req, res) => {
  const bucket = process.env.MEDIA_BUCKET;
  const userId = req.user?.sub;
  const key = req.body?.key;

  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!key || typeof key !== "string") {
    return res.status(400).json({ message: "key is required" });
  }
  try {
    ensureUserKey(key, userId);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  try {
    const getResponse = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    const buffer = await streamToBuffer(getResponse.Body);
    const videoReadyKey = buildVideoReadyKey(key);
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
      console.warn("Failed to validate/convert uploaded image:", {
        message: error?.message || String(error),
      });
      shouldCopy = true;
    }

    if (shouldCopy) {
      await copyS3Object({
        bucket,
        sourceKey: key,
        destinationKey: videoReadyKey,
      });
    } else {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: videoReadyKey,
          Body: videoReadyBuffer,
          ContentType: "image/jpeg",
        })
      );
    }

    await putMediaItem({
      userId,
      type: "IMG",
      key,
    });

    const url = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: videoReadyKey,
      }),
      { expiresIn: 900 }
    );

    res.json({ key, videoReadyKey, url });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create video-ready image",
      error: error?.message || String(error),
    });
  }
});

app.get("/s3/images", async (req, res) => {
  const bucket = process.env.MEDIA_BUCKET;
  const maxKeys = Number(req.query?.maxKeys) || 100;
  const urlExpirationSeconds = 900;
  const userId = req.user?.sub;

  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const items = await queryMediaItems({ userId, type: "IMG" });
    let images = items
      .map((item) => ({
        key: item.key,
        createdAt: item.createdAt,
      }))
      .filter((item) => !item.key?.includes("/images/video-ready/"))
      .slice(0, Math.min(maxKeys, 1000));

    if (images.length === 0) {
      const userPrefix = buildUserPrefix(userId);
      const response = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: `${userPrefix}images/`,
          MaxKeys: Math.min(maxKeys, 1000),
        })
      );
      images = (response.Contents || [])
        .map((item) => item.Key)
        .filter((key) => key && key !== `${userPrefix}images/`)
        .filter((key) => !key.includes("/images/video-ready/"))
        .sort((a, b) => a.localeCompare(b))
        .map((key) => ({ key }));

      await Promise.all(
        images.map((item) =>
          putMediaItem({ userId, type: "IMG", key: item.key })
        )
      );
    }

    const signed = await Promise.all(
      images.map(async (image) => {
        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: image.key,
        });
        const url = await getSignedUrl(s3Client, command, {
          expiresIn: urlExpirationSeconds,
        });
        return { key: image.key, url };
      })
    );

    res.json({ bucket, images: signed });
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
  const userId = req.user?.sub;

  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!key || typeof key !== "string") {
    return res.status(400).json({ message: "key is required" });
  }
  try {
    ensureUserKey(key, userId);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  try {
    const videoReadyKey = buildVideoReadyKey(key);
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    if (videoReadyKey) {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: videoReadyKey,
        })
      );
    }
    await deleteMediaItem({ userId, type: "IMG", key });
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
  const userId = req.user?.sub;

  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!key || typeof key !== "string") {
    return res.status(400).json({ message: "key is required" });
  }
  try {
    ensureUserKey(key, userId);
  } catch (error) {
    return res.status(400).json({ message: error.message });
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
    await deleteMediaItem({ userId, type: "VID", key });
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
  const userId = req.user?.sub;

  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const items = await queryMediaItems({ userId, type: "VID" });
    let videos = items
      .map((item) => ({
        key: item.key,
        posterKey: item.posterKey,
        createdAt: item.createdAt,
      }))
      .slice(0, Math.min(maxKeys, 1000));

    if (videos.length === 0) {
      const userPrefix = buildUserPrefix(userId);
      const response = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: `${userPrefix}videos/`,
          MaxKeys: Math.min(maxKeys, 1000),
        })
      );
      const objects = response.Contents || [];
      const objectKeys = new Set(
        objects.map((item) => item.Key).filter(Boolean)
      );
      videos = objects
        .filter((item) => item.Key && item.Key !== `${userPrefix}videos/`)
        .filter((item) => item.Key?.endsWith(".mp4"))
        .filter((item) => !item.Key?.endsWith("/output.mp4"))
        .map((item) => {
          const key = item.Key || "";
          const posterKey = resolveVideoPosterKey(key, objectKeys);
          return { key, posterKey };
        });
      await Promise.all(
        videos.map((item) =>
          putMediaItem({
            userId,
            type: "VID",
            key: item.key,
            extra: { posterKey: item.posterKey || "" },
          })
        )
      );
    }

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
  const userId = req.user?.sub;

  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!prefix) {
    return res.status(400).json({ message: "prefix is required" });
  }
  const userPrefix = buildUserPrefix(userId);
  if (!prefix.startsWith(`${userPrefix}videos/`)) {
    return res.status(400).json({
      message: "prefix must start with the user's videos/",
    });
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
          await putMediaItem({ userId, type: "IMG", key });
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

app.get("/story/presets", async (req, res) => {
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  try {
    const presets = await ensureStoryPresets();
    const characters = await ensureStoryCharacters();
    const characterMap = new Map(
      characters.map((character) => [character.id, character])
    );
    res.json({
      presets: presets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        synopsis: preset.synopsis,
        protagonistName:
          characterMap.get(preset.protagonistId || "")?.name ||
          preset.protagonistName ||
          "",
        stylePrompt: preset.stylePrompt,
        opening: preset.opening,
      })),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to load story presets",
      error: error?.message || String(error),
    });
  }
});

app.get("/story/characters", async (req, res) => {
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  try {
    const characters = await ensureStoryCharacters();
    res.json({
      characters: characters.map((character) => ({
        id: character.id,
        name: character.name,
        weight: character.weight,
        signatureTraits: character.signatureTraits,
        faceDetails: character.faceDetails,
        eyeDetails: character.eyeDetails,
        hairDetails: character.hairDetails,
        ears: character.ears,
        tails: character.tails,
        horns: character.horns,
        wings: character.wings,
        hairStyles: character.hairStyles,
        viewDistance: character.viewDistance,
        accessories: character.accessories,
        markings: character.markings,
        background: character.background,
        pose: character.pose,
        outfitMaterials: character.outfitMaterials,
        styleReference: character.styleReference,
        identityPrompt: character.identityPrompt,
        storyBasePrompt: character.storyBasePrompt,
        storyNegativePrompt: character.storyNegativePrompt,
      })),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to load story characters",
      error: error?.message || String(error),
    });
  }
});

app.get("/story/sessions", async (req, res) => {
  const userId = req.user?.sub;
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const items = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: "SESSION#",
      limit: 50,
      scanForward: false,
    });
    const sessions = items.map((item) => ({
      id: item.sessionId,
      title: item.title,
      presetId: item.presetId,
      protagonistName: item.protagonistName,
      synopsis: item.synopsis,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      turnCount: item.turnCount || 0,
      sceneCount: item.sceneCount || 0,
    }));
    res.json({ sessions });
  } catch (error) {
    res.status(500).json({
      message: "Failed to list story sessions",
      error: error?.message || String(error),
    });
  }
});

app.post("/story/sessions", async (req, res) => {
  const userId = req.user?.sub;
  const presetId = req.body?.presetId;
  const title = req.body?.title?.trim();
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!presetId) {
    return res.status(400).json({ message: "presetId is required" });
  }

  try {
    const presets = await ensureStoryPresets();
    const characters = await ensureStoryCharacters();
    const characterMap = new Map(
      characters.map((character) => [character.id, character])
    );
    const preset =
      presets.find((item) => item.id === presetId) ||
      storyPresets.find((item) => item.id === presetId);
    if (!preset) {
      return res.status(400).json({ message: "Invalid presetId" });
    }
    const resolvedProtagonistId =
      preset.protagonistId ||
      (preset.protagonistName?.toLowerCase().includes("frieren")
        ? "frieren"
        : "");
    const character = characterMap.get(resolvedProtagonistId) || null;
    const protagonistPrompt =
      preset.protagonistPrompt || character?.identityPrompt || buildCharacterPrompt(character);
    const protagonistName =
      character?.name || preset.protagonistName || "Protagonist";

    const sessionId = `story-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const now = new Date().toISOString();
    const sessionItem = {
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
      type: "STORY_SESSION",
      sessionId,
      title: title || preset.name,
      presetId: preset.id,
      synopsis: preset.synopsis,
      protagonistId: resolvedProtagonistId || character?.id || "",
      protagonistName,
      protagonistPrompt,
      worldPrompt: preset.worldPrompt,
      stylePrompt: preset.stylePrompt,
      negativePrompt: preset.negativePrompt,
      opening: preset.opening,
      summary: "",
      turnCount: 0,
      sceneCount: 1,
      lastIllustrationTurn: 0,
      createdAt: now,
      updatedAt: now,
    };

    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: sessionItem,
      })
    );

    const openingMessage = {
      pk: buildMediaPk(userId),
      sk: buildStoryMessageSk(sessionId, Date.now()),
      type: "STORY_MESSAGE",
      sessionId,
      role: "assistant",
      content: preset.opening,
      createdAt: now,
    };

    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: openingMessage,
      })
    );

    const openingSceneId = `opening-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const openingScenePrompt = [
      "establishing shot, environment visible, balanced composition",
      preset.worldPrompt,
    ]
      .filter(Boolean)
      .join(", ");
    const openingScene = {
      pk: buildMediaPk(userId),
      sk: buildStorySceneSk(sessionId, openingSceneId),
      type: "STORY_SCENE",
      sessionId,
      sceneId: openingSceneId,
      title: "Opening scene",
      description: preset.opening,
      prompt: openingScenePrompt,
      status: "pending",
      createdAt: now,
    };

    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: openingScene,
      })
    );

    res.json({
      session: {
        id: sessionId,
        title: sessionItem.title,
        presetId: sessionItem.presetId,
        protagonistName: sessionItem.protagonistName,
        synopsis: sessionItem.synopsis,
        createdAt: now,
        updatedAt: now,
        turnCount: 0,
        sceneCount: 1,
      },
      messages: [
        {
          role: "assistant",
          content: preset.opening,
          createdAt: now,
        },
      ],
      scenes: [
        {
          sceneId: openingSceneId,
          title: "Opening scene",
          description: preset.opening,
          prompt: openingScenePrompt,
          status: "pending",
          createdAt: now,
        },
      ],
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create story session",
      error: error?.message || String(error),
    });
  }
});

app.get("/story/sessions/:id", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  const bucket = process.env.MEDIA_BUCKET;
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!sessionId) {
    return res.status(400).json({ message: "sessionId is required" });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }

    const messages = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: storyMessagePrefix(sessionId),
      limit: 200,
      scanForward: true,
    });
    const scenes = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: storyScenePrefix(sessionId),
      limit: 50,
      scanForward: true,
    });

    const signedScenes = await Promise.all(
      scenes.map(async (scene) => {
        if (!scene.imageKey) return scene;
        const url = await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: bucket,
            Key: scene.imageKey,
          }),
          { expiresIn: 900 }
        );
        return { ...scene, imageUrl: url };
      })
    );

    res.json({
      session: {
        id: sessionItem.sessionId,
        title: sessionItem.title,
        presetId: sessionItem.presetId,
        protagonistName: sessionItem.protagonistName,
        synopsis: sessionItem.synopsis,
        createdAt: sessionItem.createdAt,
        updatedAt: sessionItem.updatedAt,
        turnCount: sessionItem.turnCount || 0,
        sceneCount: sessionItem.sceneCount || 0,
      },
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })),
      scenes: signedScenes.map((scene) => ({
        sceneId: scene.sceneId,
        title: scene.title,
        description: scene.description,
        prompt: scene.prompt,
        status: scene.status,
        imageKey: scene.imageKey,
        imageUrl: scene.imageUrl,
        promptPositive: scene.promptPositive,
        promptNegative: scene.promptNegative,
        createdAt: scene.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to load story session",
      error: error?.message || String(error),
    });
  }
});

app.post("/story/sessions/:id/message", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  const content = req.body?.content?.trim();
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!sessionId) {
    return res.status(400).json({ message: "sessionId is required" });
  }
  if (!content) {
    return res.status(400).json({ message: "content is required" });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }

    const now = new Date().toISOString();
    const newTurnCount = (sessionItem.turnCount || 0) + 1;
    const lastIllustrationTurn = sessionItem.lastIllustrationTurn || 0;
    const userMessageItem = {
      pk: buildMediaPk(userId),
      sk: buildStoryMessageSk(sessionId, Date.now()),
      type: "STORY_MESSAGE",
      sessionId,
      role: "user",
      content,
      createdAt: now,
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: userMessageItem,
      })
    );

    const recentMessages = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: storyMessagePrefix(sessionId),
      limit: 12,
      scanForward: false,
    });
    const orderedMessages = recentMessages.reverse();

    const systemPrompt = [
      "You are a narrative director for an interactive anime adventure.",
      `Protagonist: ${sessionItem.protagonistName}.`,
      "The protagonist must remain the same character in every scene.",
      "Keep continuity with the story summary and prior dialogue.",
      "Respond in 2-4 short paragraphs, then end with a question to the player.",
      "When a meaningful scene beat occurs, mark it as a sceneBeat.",
      "Return ONLY valid JSON with keys:",
      "reply (string), summary (string), sceneBeat (boolean), sceneTitle (string), sceneDescription (string), scenePrompt (string).",
      "scenePrompt should focus on visual details of the moment (environment, action, mood) and be concise.",
      "scenePrompt should include framing guidance: medium shot or full body, environment visible, no close-ups.",
      `Story summary: ${sessionItem.summary || "New story."}`,
      `World: ${sessionItem.worldPrompt}`,
      `Style: ${sessionItem.stylePrompt}`,
    ].join("\n");

    const messagePayload = orderedMessages.map((message) => ({
      role: message.role,
      content: [{ type: "text", text: message.content }],
    }));

    const command = new InvokeModelCommand({
      modelId: storyModelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 600,
        temperature: 0.7,
        system: systemPrompt,
        messages: messagePayload,
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

    const parsed = safeJsonParse(responseText) || {};
    const replyText = parsed.reply || responseText || "The story continues.";
    const nextSummary =
      typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary.trim()
        : sessionItem.summary || "";
    const sceneBeat = Boolean(parsed.sceneBeat);
    const sceneTitle = parsed.sceneTitle?.trim() || "";
    const sceneDescription = parsed.sceneDescription?.trim() || "";
    const scenePrompt = parsed.scenePrompt?.trim() || "";

    const assistantMessageItem = {
      pk: buildMediaPk(userId),
      sk: buildStoryMessageSk(sessionId, Date.now() + 1),
      type: "STORY_MESSAGE",
      sessionId,
      role: "assistant",
      content: replyText,
      createdAt: new Date().toISOString(),
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: assistantMessageItem,
      })
    );

    let scene = null;
    let nextSceneCount = sessionItem.sceneCount || 0;
    const shouldIllustrate =
      sceneBeat &&
      scenePrompt &&
      newTurnCount - lastIllustrationTurn >= 3;

    if (shouldIllustrate) {
      const sceneId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const sceneItem = {
        pk: buildMediaPk(userId),
        sk: buildStorySceneSk(sessionId, sceneId),
        type: "STORY_SCENE",
        sessionId,
        sceneId,
        title: sceneTitle,
        description: sceneDescription,
        prompt: scenePrompt,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: sceneItem,
        })
      );
      nextSceneCount += 1;
      scene = {
        sceneId,
        title: sceneTitle,
        description: sceneDescription,
        prompt: scenePrompt,
        status: "pending",
      };
    }

    const updatedSession = {
      ...sessionItem,
      summary: nextSummary,
      turnCount: newTurnCount,
      sceneCount: nextSceneCount,
      lastIllustrationTurn: shouldIllustrate
        ? newTurnCount
        : lastIllustrationTurn,
      updatedAt: new Date().toISOString(),
    };

    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: updatedSession,
      })
    );

    res.json({
      sessionId,
      turnCount: newTurnCount,
      assistant: {
        role: "assistant",
        content: replyText,
      },
      scene,
    });
  } catch (error) {
    console.error("Story message error:", {
      message: error?.message || String(error),
    });
    res.status(500).json({
      message: "Failed to process story message",
      error: error?.message || String(error),
    });
  }
});

app.post("/story/sessions/:id/illustrations", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  const sceneId = req.body?.sceneId;
  const regenerate = Boolean(req.body?.regenerate);
  const bucket = process.env.MEDIA_BUCKET;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const debug = req.query?.debug === "true";
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!apiToken) {
    return res
      .status(500)
      .json({ message: "REPLICATE_API_TOKEN must be set" });
  }
  if (!sessionId || !sceneId) {
    return res.status(400).json({ message: "sessionId and sceneId are required" });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }

    const sceneItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySceneSk(sessionId, sceneId),
    });
    if (!sceneItem) {
      return res.status(404).json({ message: "Scene not found" });
    }
    if (sceneItem.status === "completed" && sceneItem.imageKey && !regenerate) {
      const url = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: sceneItem.imageKey,
        }),
        { expiresIn: 900 }
      );
      return res.json({ sceneId, imageKey: sceneItem.imageKey, imageUrl: url });
    }

    const characters = await ensureStoryCharacters();
    const characterMap = new Map(
      characters.map((character) => [character.id, character])
    );
    const resolvedProtagonistId =
      sessionItem.protagonistId ||
      (sessionItem.protagonistName?.toLowerCase().includes("frieren")
        ? "frieren"
        : "");
    const characterItem = resolvedProtagonistId
      ? await getItem({
          pk: buildStoryCharacterPk(),
          sk: buildStoryCharacterSk(resolvedProtagonistId),
        })
      : null;
    const fallbackCharacter =
      characterMap.get(resolvedProtagonistId || "") || null;
    const resolvedCharacter =
      characterItem || fallbackCharacter || characters[0] || null;

    if (
      resolvedCharacter?.identityPrompt &&
      sessionItem.protagonistPrompt !== resolvedCharacter.identityPrompt
    ) {
      const updatedSession = {
        ...sessionItem,
        protagonistPrompt: resolvedCharacter.identityPrompt,
        protagonistName:
          resolvedCharacter.name || sessionItem.protagonistName,
        protagonistId: resolvedProtagonistId || resolvedCharacter.id || "",
        updatedAt: new Date().toISOString(),
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: updatedSession,
        })
      );
      sessionItem.protagonistPrompt = updatedSession.protagonistPrompt;
      sessionItem.protagonistName = updatedSession.protagonistName;
    }

    const recentMessages = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: storyMessagePrefix(sessionId),
      limit: 6,
      scanForward: false,
    });
    const lastAssistant = recentMessages.find(
      (message) => message.role === "assistant"
    );
    const contextLine = lastAssistant?.content
      ? `Latest scene context: ${lastAssistant.content}`
      : "";
    const summaryLine = sessionItem.summary
      ? `Story summary: ${sessionItem.summary}`
      : "";
    let cleanScenePrompt = sanitizeScenePrompt(sceneItem.prompt || "");
    if (cleanScenePrompt) {
      cleanScenePrompt = cleanScenePrompt
        .replace(/frieren/gi, "")
        .replace(/elf/gi, "")
        .replace(/mage/gi, "")
        .replace(/academy uniform/gi, "")
        .replace(/emerald eyes/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    const protagonistLine = sessionItem.protagonistPrompt?.includes(
      sessionItem.protagonistName
    )
      ? sessionItem.protagonistPrompt
      : `${sessionItem.protagonistName}, ${sessionItem.protagonistPrompt}`;

    const identityBlock =
      resolvedCharacter?.identityPrompt ||
      sessionItem.protagonistPrompt ||
      protagonistLine;
    const basePrompt =
      resolvedCharacter?.storyBasePrompt ||
      resolvedCharacter?.identityPrompt ||
      identityBlock;

    const positivePrompt = basePrompt;

    const negativePrompt =
      resolvedCharacter?.storyNegativePrompt ||
      sessionItem.negativePrompt ||
      DEFAULT_NEGATIVE_PROMPT;
    const trimmedPositivePrompt = clampPromptTokens(positivePrompt);
    const trimmedNegativePrompt = clampPromptTokens(negativePrompt);
    const promptWasTrimmed = trimmedPositivePrompt.trim() !== positivePrompt.trim();
    const negativeWasTrimmed =
      trimmedNegativePrompt.trim() !== negativePrompt.trim();

    const modelConfig = replicateModelConfig.animagine;
    const [seed] = buildSeedList(1);
    const input = modelConfig.buildInput({
      prompt: trimmedPositivePrompt,
      negativePrompt: trimmedNegativePrompt,
      width: 1024,
      height: 1024,
      numOutputs: 1,
      seed,
      scheduler: "Euler a",
    });
    const output = await runReplicateWithRetry(modelConfig.modelId, input, 3);
    const outputItems = Array.isArray(output) ? output : [output];
    const imageUrl = outputItems.map(getReplicateOutputUrl).find(Boolean);
    if (!imageUrl) {
      return res.status(500).json({ message: "No image returned from Replicate" });
    }

    const { buffer, contentType } = await fetchImageBuffer(imageUrl);
    const imageKey =
      sceneItem.imageKey ||
      `${buildUserPrefix(userId)}stories/${sessionId}/scenes/${sceneId}.png`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: imageKey,
        Body: buffer,
        ContentType: contentType || "image/png",
      })
    );

    const updatedScene = {
      ...sceneItem,
      imageKey,
      status: "completed",
      promptPositive: trimmedPositivePrompt,
      promptNegative: trimmedNegativePrompt,
      updatedAt: new Date().toISOString(),
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: updatedScene,
      })
    );

    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: imageKey,
      }),
      { expiresIn: 900 }
    );

    res.json({
      sceneId,
      imageKey,
      imageUrl: signedUrl,
      ...(debug
        ? {
            prompt: {
              positive: trimmedPositivePrompt,
              negative: trimmedNegativePrompt,
            },
            identity: identityBlock,
            replicate: {
              modelId: modelConfig.modelId,
              input,
              ...(promptWasTrimmed || negativeWasTrimmed
                ? {
                    notice: [
                      promptWasTrimmed
                        ? `Positive prompt trimmed to ${MAX_REPLICATE_PROMPT_TOKENS} tokens for Replicate.`
                        : null,
                      negativeWasTrimmed
                        ? `Negative prompt trimmed to ${MAX_REPLICATE_PROMPT_TOKENS} tokens for Replicate.`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" "),
                  }
                : {}),
            },
          }
        : {}),
    });
  } catch (error) {
    console.error("Story illustration error:", {
      message: error?.message || String(error),
    });
    res.status(500).json({
      message: "Failed to generate illustration",
      error: error?.message || String(error),
    });
  }
});

module.exports = app;
