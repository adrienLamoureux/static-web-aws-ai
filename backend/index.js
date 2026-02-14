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
const promptBreastSizes = require("./data/prompt-helper/breast-sizes.json");
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
  "low quality, worst quality, lowres, pixelated, jpeg artifacts, compression artifacts, blurry, blurry face, out of focus, oversharpened, grainy, noisy, dithering, flat shading, muddy colors, bad anatomy, bad proportions, tiny face, distant face, multiple characters, extra people, clone, twin, reflection, mirror, big eyes, wide eyes, sparkly eyes";
const DEFAULT_GRADIO_NEGATIVE_PROMPT =
  "lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]";


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
    usePredictions: false,
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
      vae: "Animagine-XL-v4-Opt",
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
    usePredictions: true,
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
  "wai-nsfw-illustrious-v12": {
    modelId:
      process.env.REPLICATE_WAI_NSFW_ILLUSTRIOUS_V12_MODEL_ID || "aisha-ai-official/wai-nsfw-illustrious-v12:0fc0fa9885b284901a6f9c0b4d67701fd7647d157b88371427d63f8089ce140e",
    usePredictions: true,
    sizes: [
      { width: 1280, height: 720 },
      { width: 1024, height: 1024 },
      { width: 768, height: 1024 },
    ],
    buildInput: ({
      prompt,
      negativePrompt,
      width,
      height,
      numOutputs,
      seed,
      scheduler,
    }) => ({
      batch_size: numOutputs,
      cfg_scale: 7,
      clip_skip: 2,
      guidance_rescale: 1,
      height,
      model: "WAI-NSFW-Illustrious-SDXL-v12",
      negative_prompt: negativePrompt || DEFAULT_NEGATIVE_PROMPT,
      pag_scale: 0,
      prepend_preprompt: true,
      prompt,
      scheduler: scheduler || "Euler a",
      seed: seed ?? -1,
      steps: 30,
      vae: "WAI-NSFW-Illustrious-SDXL-v12",
      width,
    }),
  },
  "anillustrious-v4": {
    modelId:
      process.env.REPLICATE_ANILLUSTRIOUS_V4_MODEL_ID ||
      "aisha-ai-official/anillustrious-v4:80441e2c32a55f2fcf9b77fa0a74c6c86ad7deac51eed722b9faedb253265cb4",
    usePredictions: true,
    sizes: [
      { width: 1280, height: 720 },
      { width: 1024, height: 1024 },
      { width: 768, height: 1024 },
    ],
    buildInput: ({
      prompt,
      negativePrompt,
      width,
      height,
      numOutputs,
      seed,
      scheduler,
    }) => ({
      vae: "NeptuniaXL-VAE-ContrastSaturation",
      seed: seed ?? -1,
      model: "Anillustrious-v4",
      steps: 30,
      width,
      height,
      prompt,
      refiner: false,
      upscale: "x4",
      cfg_scale: 7,
      clip_skip: 2,
      pag_scale: 0,
      scheduler: scheduler || "Euler",
      adetailer_face: false,
      adetailer_hand: false,
      refiner_prompt: "",
      negative_prompt: negativePrompt || DEFAULT_NEGATIVE_PROMPT,
      adetailer_person: false,
      guidance_rescale: 1,
      refiner_strength: 0.8,
      prepend_preprompt: true,
      prompt_conjunction: true,
      adetailer_face_prompt: "",
      adetailer_hand_prompt: "",
      adetailer_person_prompt: "",
      negative_prompt_conjunction: false,
      adetailer_face_negative_prompt: "",
      adetailer_hand_negative_prompt: "",
      adetailer_person_negative_prompt: "",
      batch_size: numOutputs,
    }),
  },
};

const gradioSpaceConfig = {
  wainsfw: {
    spaceId: "Menyu/wainsfw",
    apiName: "/infer",
    defaultWidth: 832,
    defaultHeight: 1216,
    guidanceScale: 7,
    numInferenceSteps: 28,
    buildInput: ({
      prompt,
      negativePrompt,
      width,
      height,
      seed,
      randomizeSeed,
      guidanceScale,
      numInferenceSteps,
      useNegativePrompt,
    }) => ({
      prompt,
      negative_prompt: negativePrompt,
      use_negative_prompt: useNegativePrompt,
      seed: Number.isFinite(Number(seed)) ? Number(seed) : 0,
      width,
      height,
      guidance_scale: guidanceScale,
      num_inference_steps: numInferenceSteps,
      randomize_seed: randomizeSeed,
    }),
  },
  "animagine-xl-3.1": {
    spaceId: "Asahina2K/animagine-xl-3.1",
    apiName: "/run",
    defaultWidth: 1024,
    defaultHeight: 1024,
    guidanceScale: 7,
    numInferenceSteps: 28,
    sampler: "DPM++ 2M Karras",
    aspectRatio: "1024 x 1024",
    stylePreset: "(None)",
    qualityTagsPreset: "(None)",
    useUpscaler: false,
    upscalerStrength: 0,
    upscaleBy: 1,
    addQualityTags: false,
    buildInput: ({
      prompt,
      negativePrompt,
      width,
      height,
      seed,
      randomizeSeed,
      guidanceScale,
      numInferenceSteps,
      sampler,
      aspectRatio,
      stylePreset,
      qualityTagsPreset,
      useUpscaler,
      upscalerStrength,
      upscaleBy,
      addQualityTags,
    }) => {
      const resolvedSeed = Number.isFinite(Number(seed))
        ? Number(seed)
        : randomizeSeed
          ? Math.floor(Math.random() * 2147483647)
          : 0;
      return [
        prompt,
        negativePrompt,
        resolvedSeed,
        width,
        height,
        guidanceScale,
        numInferenceSteps,
        sampler,
        aspectRatio,
        stylePreset,
        qualityTagsPreset,
        useUpscaler,
        upscalerStrength,
        upscaleBy,
        addQualityTags,
      ];
    },
  },
};

let gradioClientPromise;
const loadGradioClient = async () => {
  if (!gradioClientPromise) {
    gradioClientPromise = import("@gradio/client");
  }
  const module = await gradioClientPromise;
  return module.Client;
};

const gradioClientCache = new Map();
const getGradioSpaceClient = async (spaceId, token) => {
  const cacheKey = `${spaceId}:${token ? "token" : "anon"}`;
  if (gradioClientCache.has(cacheKey)) {
    return gradioClientCache.get(cacheKey);
  }
  const Client = await loadGradioClient();
  const client = token
    ? await Client.connect(spaceId, { hf_token: token })
    : await Client.connect(spaceId);
  gradioClientCache.set(cacheKey, client);
  return client;
};

const pickOption = (options = [], value = "", fallback = "") => {
  if (value && options.includes(value)) return value;
  if (fallback && options.includes(fallback)) return fallback;
  return options[0] || "";
};

const STORY_LOREBOOK_VERSION = 1;
const STORY_STATE_VERSION = 1;

const clampNumber = (value, min, max) => {
  if (typeof value !== "number" || Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
};

const normalizeStringArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
};

const uniqueStringArray = (value) => {
  const seen = new Set();
  return normalizeStringArray(value).filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const deepMerge = (base, override) => {
  if (override === undefined || override === null) return base;
  if (Array.isArray(base) || Array.isArray(override)) {
    return Array.isArray(override) ? override : base;
  }
  if (
    typeof base !== "object" ||
    base === null ||
    typeof override !== "object" ||
    override === null
  ) {
    return override;
  }
  const next = { ...base };
  Object.keys(override).forEach((key) => {
    next[key] = deepMerge(base[key], override[key]);
  });
  return next;
};

const buildDefaultLorebook = (preset = {}, protagonistName = "Protagonist") => {
  const base = {
    version: STORY_LOREBOOK_VERSION,
    overview: {
      title: preset.name || "Untitled Story",
      synopsis: preset.synopsis || "",
      tone: "quiet, reflective, character-driven",
      themes: ["memory", "journey", "choice"],
    },
    initialScene: {
      locationId: "starting-point",
      locationName: "Starting point",
      description: preset.worldPrompt || preset.opening || "",
      timeOfDay: "late afternoon",
      weather: "clear",
      mood: "calm",
      direction: "forward",
      tags: ["journey", "quiet"],
      nearby: [],
      npcsPresent: [],
    },
    directions: ["north", "south", "east", "west", "uphill", "downhill"],
    locations: [],
    npcs: [],
    goals: {
      primary: "Continue the journey",
      secondary: [],
      longTerm: "Uncover the deeper meaning behind the quest",
    },
    rules: {
      initiative: {
        baseRate: 0.45,
        minTurnsBetween: 1,
        maxTurnsBetween: 3,
        protagonistBias: 1.6,
      },
      eventSelection: {
        cooldownTurns: 2,
        recentLimit: 4,
        allowRepeat: false,
        fallbackEventId: "quiet-beat",
      },
    },
    events: [
      {
        id: "quiet-beat",
        title: "A quiet beat",
        type: "quiet",
        baseWeight: 1,
        tags: ["quiet", "reflection"],
        initiative: "protagonist",
        prompt: {
          beat: `${protagonistName} notices a small detail in the environment and shares a quiet observation.`,
          focus: "environment detail + character reflection",
          sensory: "soft wind, distant sounds",
          hooks: ["invite a response from the player"],
        },
        effects: {
          metricsDelta: { tension: -0.05, mystery: 0.03 },
        },
      },
    ],
  };

  if (preset.id === "frieren-road") {
    return deepMerge(base, {
      overview: {
        tone: "gentle, wistful, contemplative",
        themes: ["journey", "memory", "quiet companionship"],
      },
      initialScene: {
        locationId: "road-valley",
        locationName: "Misty valley road",
        description:
          "A soft mist settles over a winding road, with distant bells and open fields.",
        timeOfDay: "late afternoon",
        weather: "mist",
        mood: "quiet",
        direction: "northbound",
        tags: ["travel", "quiet", "countryside"],
        nearby: ["ridge-overlook", "village-outer"],
      },
      locations: [
        {
          id: "road-valley",
          name: "Misty valley road",
          description: "A winding path through open fields and low hills.",
          tags: ["travel", "open", "quiet"],
          neighbors: ["ridge-overlook", "village-outer"],
        },
        {
          id: "ridge-overlook",
          name: "Ridge overlook",
          description: "A high path with a view of lakes and distant mountains.",
          tags: ["scenic", "windy", "quiet"],
          neighbors: ["road-valley"],
        },
        {
          id: "village-outer",
          name: "Village outskirts",
          description: "Stone roads, lanterns, and soft smoke from chimneys.",
          tags: ["settlement", "warm", "safe"],
          neighbors: ["road-valley"],
        },
      ],
      npcs: [
        {
          id: "traveler",
          name: "Traveling merchant",
          role: "wayfarer",
          disposition: "cautious but friendly",
          tags: ["road", "rumors"],
          goals: ["trade", "share rumors"],
        },
        {
          id: "elder",
          name: "Village elder",
          role: "guide",
          disposition: "warm, deliberate",
          tags: ["village", "knowledge"],
          goals: ["warn travelers", "protect village"],
        },
      ],
      goals: {
        primary: "Reach the next village before nightfall",
        secondary: ["Decide on the ridge or village path"],
        longTerm: "Trace the echoes of ancient magic across the countryside",
      },
      events: [
        {
          id: "road-choice",
          title: "A fork in the road",
          type: "choice",
          baseWeight: 1.2,
          tags: ["travel", "choice", "quiet"],
          initiative: "protagonist",
          when: { locationIds: ["road-valley"], sceneTagsAny: ["travel"] },
          prompt: {
            beat:
              "The road splits toward a ridge and a village, inviting a calm decision.",
            focus: "path choice + landscape",
            sensory: "distant bells, soft wind",
            hooks: ["ridge view", "village lights"],
          },
          effects: {
            flags: { add: ["path-choice"] },
            goals: { activeAdd: ["Choose the route forward"] },
            metricsDelta: { progress: 0.05 },
          },
        },
        {
          id: "passing-traveler",
          title: "A passing traveler",
          type: "npc",
          baseWeight: 0.9,
          tags: ["npc", "rumor", "travel"],
          initiative: "npc",
          when: { locationIds: ["road-valley", "village-outer"] },
          prompt: {
            beat:
              "A traveler crosses paths and offers a small rumor about nearby ruins.",
            focus: "npc encounter + hint",
            sensory: "footsteps on stone, muted chatter",
            hooks: ["rumor", "direction hint"],
          },
          effects: {
            npcs: { presentAdd: ["traveler"] },
            flags: { add: ["rumor-ruins"] },
            metricsDelta: { mystery: 0.08 },
          },
        },
        {
          id: "weather-shift",
          title: "Weather shifts",
          type: "environment",
          baseWeight: 0.8,
          tags: ["environment", "travel"],
          initiative: "environment",
          prompt: {
            beat: "The mist thickens, changing the mood and visibility.",
            focus: "environment shift",
            sensory: "cool damp air, muted sounds",
            hooks: ["slower pace", "closer voices"],
          },
          effects: {
            scene: { weather: "thick mist", tagsAdd: ["mist"] },
            metricsDelta: { tension: 0.05 },
          },
        },
        {
          id: "quiet-memory",
          title: "A quiet memory",
          type: "reflection",
          baseWeight: 0.95,
          tags: ["quiet", "reflection", "memory"],
          initiative: "protagonist",
          when: { sceneTagsAny: ["quiet", "countryside"] },
          prompt: {
            beat:
              `${protagonistName} shares a small memory tied to the landscape.`,
            focus: "character reflection",
            sensory: "soft light, distant birds",
            hooks: ["memory link", "gentle question"],
          },
          effects: {
            metricsDelta: { mystery: 0.04, tension: -0.03 },
          },
        },
        {
          id: "ruin-hint",
          title: "A hint of ruins",
          type: "discovery",
          baseWeight: 0.85,
          tags: ["discovery", "mystery"],
          initiative: "protagonist",
          when: { flagsAny: ["rumor-ruins"] },
          prompt: {
            beat:
              "A distant silhouette or carved stone hints at ancient ruins nearby.",
            focus: "discovery + environment",
            sensory: "faint glow, stone texture",
            hooks: ["investigation", "detour"],
          },
          effects: {
            goals: { activeAdd: ["Investigate the ruins"] },
            metricsDelta: { mystery: 0.1 },
          },
        },
      ],
    });
  }

  if (preset.id === "moonlit-tavern") {
    return deepMerge(base, {
      overview: {
        tone: "warm, intimate, slowly unfolding",
        themes: ["rumor", "comfort", "choice"],
      },
      initialScene: {
        locationId: "tavern-hall",
        locationName: "Moonlit tavern",
        description:
          "A warm tavern glow contrasts with rain-soaked windows and muted chatter.",
        timeOfDay: "night",
        weather: "rain",
        mood: "cozy",
        direction: "inward",
        tags: ["interior", "warm", "rain"],
        nearby: ["tavern-backroom", "rainy-alley"],
      },
      locations: [
        {
          id: "tavern-hall",
          name: "Tavern hall",
          description: "Lantern light, wooden beams, hushed conversations.",
          tags: ["interior", "warm"],
          neighbors: ["tavern-backroom", "rainy-alley"],
        },
        {
          id: "tavern-backroom",
          name: "Backroom",
          description: "A quieter space with hidden whispers and secrets.",
          tags: ["interior", "secret"],
          neighbors: ["tavern-hall"],
        },
        {
          id: "rainy-alley",
          name: "Rainy alley",
          description: "Wet stone, dripping eaves, and shadowed corners.",
          tags: ["exterior", "rain", "urban"],
          neighbors: ["tavern-hall"],
        },
      ],
      npcs: [
        {
          id: "traveler",
          name: "Mysterious traveler",
          role: "informant",
          disposition: "guarded",
          tags: ["rumor", "quest"],
          goals: ["test trust", "share clue"],
        },
        {
          id: "bartender",
          name: "Bartender",
          role: "host",
          disposition: "steady, observant",
          tags: ["tavern", "local"],
          goals: ["keep peace", "share local lore"],
        },
      ],
      goals: {
        primary: "Learn about the old ruins from the traveler",
        secondary: ["Decide whether to trust the rumor"],
        longTerm: "Unlock the hidden quest tied to the ruins",
      },
      events: [
        {
          id: "whispered-rumor",
          title: "Whispered rumor",
          type: "npc",
          baseWeight: 1.05,
          tags: ["npc", "rumor", "mystery"],
          initiative: "npc",
          when: { locationIds: ["tavern-hall", "tavern-backroom"] },
          prompt: {
            beat:
              "A traveler shares a rumor about the ruins, testing the mood.",
            focus: "npc encounter + clue",
            sensory: "low voices, clinking cups",
            hooks: ["cryptic hint", "request"],
          },
          effects: {
            npcs: { presentAdd: ["traveler"] },
            flags: { add: ["rumor-ruins"] },
            metricsDelta: { mystery: 0.1 },
          },
        },
        {
          id: "lantern-flicker",
          title: "Lanterns flicker",
          type: "environment",
          baseWeight: 0.85,
          tags: ["environment", "quiet"],
          initiative: "environment",
          prompt: {
            beat:
              "The lanterns flicker, adding a hush to the tavern's warmth.",
            focus: "environment shift",
            sensory: "warm glow, rain tapping glass",
            hooks: ["subtle tension", "closer conversation"],
          },
          effects: {
            scene: { mood: "intimate" },
            metricsDelta: { tension: 0.04 },
          },
        },
        {
          id: "sealed-letter",
          title: "A sealed letter",
          type: "discovery",
          baseWeight: 0.9,
          tags: ["discovery", "mystery"],
          initiative: "protagonist",
          when: { sceneTagsAny: ["interior", "warm"] },
          prompt: {
            beat:
              `${protagonistName} notices a sealed letter tied to the ruins.`,
            focus: "discovery + prop",
            sensory: "wax seal, old parchment",
            hooks: ["investigation", "decision"],
          },
          effects: {
            flags: { add: ["letter-found"] },
            goals: { activeAdd: ["Decipher the letter"] },
            metricsDelta: { mystery: 0.08 },
          },
        },
        {
          id: "backroom-invite",
          title: "Backroom invitation",
          type: "choice",
          baseWeight: 0.95,
          tags: ["choice", "npc"],
          initiative: "npc",
          when: { flagsAny: ["rumor-ruins"] },
          prompt: {
            beat: "An invitation to the backroom suggests a private talk.",
            focus: "npc request + decision",
            sensory: "muffled voices, warm shadows",
            hooks: ["trust", "risk"],
          },
          effects: {
            goals: { activeAdd: ["Decide on the backroom meeting"] },
            metricsDelta: { tension: 0.06 },
          },
        },
      ],
    });
  }

  if (preset.id === "celestial-ruins") {
    return deepMerge(base, {
      overview: {
        tone: "ethereal, ancient, quietly tense",
        themes: ["mystery", "wonder", "ancient power"],
      },
      initialScene: {
        locationId: "ruins-entrance",
        locationName: "Celestial ruins",
        description:
          "Ancient stones float above the clouds, glowing with starlit runes.",
        timeOfDay: "night",
        weather: "clear",
        mood: "awe",
        direction: "upward",
        tags: ["ancient", "mystic", "high-altitude"],
        nearby: ["ruins-hall", "starlit-platform"],
      },
      locations: [
        {
          id: "ruins-entrance",
          name: "Ruins entrance",
          description: "A broad stairway carved with glowing runes.",
          tags: ["ancient", "mystic"],
          neighbors: ["ruins-hall"],
        },
        {
          id: "ruins-hall",
          name: "Ruins hall",
          description: "Echoing chambers with suspended stone bridges.",
          tags: ["ancient", "echo"],
          neighbors: ["ruins-entrance", "starlit-platform"],
        },
        {
          id: "starlit-platform",
          name: "Starlit platform",
          description: "An open platform bathed in pale starlight.",
          tags: ["open", "mystic"],
          neighbors: ["ruins-hall"],
        },
      ],
      npcs: [
        {
          id: "sentinel",
          name: "Silent sentinel",
          role: "guardian spirit",
          disposition: "watchful",
          tags: ["ancient", "guardian"],
          goals: ["test worthiness", "protect relic"],
        },
      ],
      goals: {
        primary: "Trace the runes and locate the relic",
        secondary: ["Understand the ruins' purpose"],
        longTerm: "Recover the ancient relic safely",
      },
      events: [
        {
          id: "runic-pulse",
          title: "Runic pulse",
          type: "environment",
          baseWeight: 1.05,
          tags: ["environment", "mystery", "ancient"],
          initiative: "environment",
          prompt: {
            beat:
              "The runes pulse with light, hinting at a hidden path or pattern.",
            focus: "environment shift + mystery",
            sensory: "cold light, humming stones",
            hooks: ["investigate pattern", "touch the runes"],
          },
          effects: {
            metricsDelta: { mystery: 0.1 },
          },
        },
        {
          id: "echoing-voice",
          title: "Echoing voice",
          type: "npc",
          baseWeight: 0.9,
          tags: ["npc", "ancient", "warning"],
          initiative: "npc",
          prompt: {
            beat:
              "A disembodied voice offers a warning about the relic's cost.",
            focus: "npc encounter + warning",
            sensory: "echoing whispers, distant chimes",
            hooks: ["risk", "resolve"],
          },
          effects: {
            npcs: { presentAdd: ["sentinel"] },
            metricsDelta: { tension: 0.08 },
          },
        },
        {
          id: "fractured-stair",
          title: "Fractured stair",
          type: "conflict",
          baseWeight: 0.85,
          tags: ["conflict", "danger"],
          initiative: "environment",
          when: { locationIds: ["ruins-hall", "starlit-platform"] },
          prompt: {
            beat:
              "A stone stair fractures, forcing careful movement or quick action.",
            focus: "hazard + movement",
            sensory: "cracking stone, falling dust",
            hooks: ["leap", "stabilize"],
          },
          effects: {
            metricsDelta: { tension: 0.12, urgency: 0.08 },
          },
        },
        {
          id: "starlit-relic",
          title: "Starlit relic",
          type: "discovery",
          baseWeight: 0.95,
          tags: ["discovery", "goal", "mystery"],
          initiative: "protagonist",
          when: { sceneTagsAny: ["mystic", "open"] },
          prompt: {
            beat:
              `${protagonistName} notices a relic glinting under starlight.`,
            focus: "discovery + relic",
            sensory: "cold light, metallic shimmer",
            hooks: ["approach", "inspect"],
          },
          effects: {
            goals: { activeAdd: ["Secure the relic"] },
            metricsDelta: { mystery: 0.08, progress: 0.1 },
          },
        },
      ],
    });
  }

  return base;
};

const resolveStoryLorebook = (preset = {}, protagonistName = "Protagonist") => {
  const base = buildDefaultLorebook(preset, protagonistName);
  if (!preset?.lorebook) return base;
  return deepMerge(base, preset.lorebook);
};

const buildInitialStoryState = (lorebook = {}) => {
  const scene = lorebook.initialScene || {};
  const goals = lorebook.goals || {};
  return {
    version: STORY_STATE_VERSION,
    scene: {
      locationId: scene.locationId || "starting-point",
      locationName: scene.locationName || "Starting point",
      description: scene.description || "",
      timeOfDay: scene.timeOfDay || "late afternoon",
      weather: scene.weather || "clear",
      mood: scene.mood || "calm",
      direction: scene.direction || "forward",
      tags: uniqueStringArray(scene.tags || []),
      nearby: uniqueStringArray(scene.nearby || []),
    },
    metrics: {
      tension: clampNumber(scene.tension ?? lorebook?.initialMetrics?.tension ?? 0.2, 0, 1),
      mystery: clampNumber(scene.mystery ?? lorebook?.initialMetrics?.mystery ?? 0.35, 0, 1),
      urgency: clampNumber(scene.urgency ?? lorebook?.initialMetrics?.urgency ?? 0.2, 0, 1),
      progress: clampNumber(scene.progress ?? lorebook?.initialMetrics?.progress ?? 0.1, 0, 1),
      fatigue: clampNumber(scene.fatigue ?? lorebook?.initialMetrics?.fatigue ?? 0.1, 0, 1),
    },
    goals: {
      active: uniqueStringArray([
        goals.primary,
        ...(goals.secondary || []),
      ]),
      completed: [],
    },
    flags: [],
    npcs: {
      present: uniqueStringArray(scene.npcsPresent || []),
    },
    meta: {
      turn: 0,
      lastEventId: "",
      recentEvents: [],
      turnsSinceInitiative: 0,
    },
  };
};

const applyStateDelta = (state = {}, delta = {}) => {
  if (!delta || typeof delta !== "object") return state;
  const next = {
    ...state,
    scene: { ...(state.scene || {}) },
    metrics: { ...(state.metrics || {}) },
    goals: { ...(state.goals || {}) },
    flags: uniqueStringArray(state.flags || []),
    npcs: { ...(state.npcs || {}) },
    meta: { ...(state.meta || {}) },
  };

  const sceneDelta = delta.scene || {};
  if (typeof sceneDelta.locationId === "string") next.scene.locationId = sceneDelta.locationId;
  if (typeof sceneDelta.locationName === "string") next.scene.locationName = sceneDelta.locationName;
  if (typeof sceneDelta.description === "string") next.scene.description = sceneDelta.description;
  if (typeof sceneDelta.timeOfDay === "string") next.scene.timeOfDay = sceneDelta.timeOfDay;
  if (typeof sceneDelta.weather === "string") next.scene.weather = sceneDelta.weather;
  if (typeof sceneDelta.mood === "string") next.scene.mood = sceneDelta.mood;
  if (typeof sceneDelta.direction === "string") next.scene.direction = sceneDelta.direction;

  const currentTags = uniqueStringArray(next.scene.tags || []);
  const addTags = normalizeStringArray(sceneDelta.tagsAdd || []);
  const removeTags = new Set(normalizeStringArray(sceneDelta.tagsRemove || []));
  next.scene.tags = uniqueStringArray(
    currentTags
      .filter((tag) => !removeTags.has(tag))
      .concat(addTags)
  );

  const currentNearby = uniqueStringArray(next.scene.nearby || []);
  const addNearby = normalizeStringArray(sceneDelta.nearbyAdd || []);
  const removeNearby = new Set(normalizeStringArray(sceneDelta.nearbyRemove || []));
  next.scene.nearby = uniqueStringArray(
    currentNearby
      .filter((item) => !removeNearby.has(item))
      .concat(addNearby)
  );

  const metricsDelta = delta.metricsDelta || {};
  const metricsSet = delta.metrics || {};
  ["tension", "mystery", "urgency", "progress", "fatigue"].forEach((key) => {
    const baseValue =
      typeof next.metrics[key] === "number" ? next.metrics[key] : 0;
    if (typeof metricsDelta[key] === "number") {
      next.metrics[key] = clampNumber(baseValue + metricsDelta[key], 0, 1);
    }
    if (typeof metricsSet[key] === "number") {
      next.metrics[key] = clampNumber(metricsSet[key], 0, 1);
    }
  });

  const goalsDelta = delta.goals || {};
  const activeGoals = uniqueStringArray(next.goals.active || []);
  const completedGoals = uniqueStringArray(next.goals.completed || []);
  const addGoals = normalizeStringArray(goalsDelta.activeAdd || []);
  const removeGoals = new Set(normalizeStringArray(goalsDelta.activeRemove || []));
  const completeGoals = normalizeStringArray(goalsDelta.completedAdd || []);
  next.goals.active = uniqueStringArray(
    activeGoals
      .filter((goal) => !removeGoals.has(goal))
      .concat(addGoals)
      .filter((goal) => !completeGoals.includes(goal))
  );
  next.goals.completed = uniqueStringArray(
    completedGoals.concat(completeGoals)
  );

  const flagsDelta = delta.flags || {};
  const flagsAdd = normalizeStringArray(flagsDelta.add || []);
  const flagsRemove = new Set(normalizeStringArray(flagsDelta.remove || []));
  next.flags = uniqueStringArray(
    next.flags
      .filter((flag) => !flagsRemove.has(flag))
      .concat(flagsAdd)
  );

  const npcsDelta = delta.npcs || {};
  const presentNpcs = uniqueStringArray(next.npcs.present || []);
  const npcsAdd = normalizeStringArray(npcsDelta.presentAdd || []);
  const npcsRemove = new Set(normalizeStringArray(npcsDelta.presentRemove || []));
  next.npcs.present = uniqueStringArray(
    presentNpcs
      .filter((npc) => !npcsRemove.has(npc))
      .concat(npcsAdd)
  );

  return next;
};

const TAG_METRIC_BIASES = {
  quiet: { tension: -0.6, urgency: -0.3 },
  reflection: { fatigue: 0.5, tension: -0.2 },
  conflict: { tension: 0.7, urgency: 0.4 },
  danger: { tension: 0.6, urgency: 0.5 },
  discovery: { mystery: 0.6 },
  mystery: { mystery: 0.5 },
  travel: { progress: -0.4 },
  goal: { progress: -0.5, urgency: 0.3 },
};

const applyMetricBias = (weight, metrics = {}, bias = {}) => {
  let adjusted = weight;
  Object.entries(bias).forEach(([metric, factor]) => {
    const value =
      typeof metrics[metric] === "number"
        ? clampNumber(metrics[metric], 0, 1)
        : 0.5;
    const delta = (value - 0.5) * factor;
    adjusted *= 1 + delta;
  });
  return adjusted;
};

const metricInRange = (value, range) => {
  if (range === undefined || range === null) return true;
  if (typeof range === "number") return value >= range;
  if (typeof range !== "object") return true;
  if (typeof range.min === "number" && value < range.min) return false;
  if (typeof range.max === "number" && value > range.max) return false;
  return true;
};

const matchesAll = (needles = [], haystack = []) =>
  normalizeStringArray(needles).every((item) =>
    haystack.includes(item)
  );

const matchesAny = (needles = [], haystack = []) =>
  normalizeStringArray(needles).some((item) =>
    haystack.includes(item)
  );

const computeEventWeight = (event = {}, state = {}, selection = {}) => {
  const baseWeight =
    typeof event.baseWeight === "number" ? event.baseWeight : 1;
  if (baseWeight <= 0) return 0;

  const scene = state.scene || {};
  const metrics = state.metrics || {};
  const flags = uniqueStringArray(state.flags || []);
  const npcsPresent = uniqueStringArray(state.npcs?.present || []);
  const tags = uniqueStringArray(scene.tags || []);

  const when = event.when || {};
  if (
    Array.isArray(when.locationIds) &&
    when.locationIds.length > 0 &&
    !when.locationIds.includes(scene.locationId)
  ) {
    return 0;
  }
  if (
    Array.isArray(when.timeOfDay) &&
    when.timeOfDay.length > 0 &&
    !when.timeOfDay.includes(scene.timeOfDay)
  ) {
    return 0;
  }
  if (
    Array.isArray(when.weather) &&
    when.weather.length > 0 &&
    !when.weather.includes(scene.weather)
  ) {
    return 0;
  }
  if (
    Array.isArray(when.mood) &&
    when.mood.length > 0 &&
    !when.mood.includes(scene.mood)
  ) {
    return 0;
  }
  if (Array.isArray(when.sceneTagsAll) && when.sceneTagsAll.length > 0) {
    if (!matchesAll(when.sceneTagsAll, tags)) return 0;
  }
  if (Array.isArray(when.sceneTagsAny) && when.sceneTagsAny.length > 0) {
    if (!matchesAny(when.sceneTagsAny, tags)) return 0;
  }
  if (Array.isArray(when.flagsAll) && when.flagsAll.length > 0) {
    if (!matchesAll(when.flagsAll, flags)) return 0;
  }
  if (Array.isArray(when.flagsAny) && when.flagsAny.length > 0) {
    if (!matchesAny(when.flagsAny, flags)) return 0;
  }
  if (Array.isArray(when.npcsPresentAll) && when.npcsPresentAll.length > 0) {
    if (!matchesAll(when.npcsPresentAll, npcsPresent)) return 0;
  }
  if (Array.isArray(when.npcsPresentAny) && when.npcsPresentAny.length > 0) {
    if (!matchesAny(when.npcsPresentAny, npcsPresent)) return 0;
  }

  const metricsWhen = when.metrics || {};
  const metricKeys = Object.keys(metricsWhen);
  for (const key of metricKeys) {
    const value =
      typeof metrics[key] === "number" ? metrics[key] : 0;
    if (!metricInRange(value, metricsWhen[key])) return 0;
  }

  let weight = baseWeight;
  const eventTags = normalizeStringArray(event.tags || []);
  eventTags.forEach((tag) => {
    if (TAG_METRIC_BIASES[tag]) {
      weight = applyMetricBias(weight, metrics, TAG_METRIC_BIASES[tag]);
    }
  });

  const recentIds = selection.recentIds || [];
  const cooldownTurns =
    typeof event.cooldownTurns === "number"
      ? event.cooldownTurns
      : selection.cooldownTurns;
  const allowRepeat = selection.allowRepeat;
  if (recentIds.includes(event.id)) {
    if (!allowRepeat && cooldownTurns > 0) return 0;
    weight *= 0.2;
  }

  const initiativeFocus = selection.initiativeFocus;
  if (initiativeFocus) {
    if (event.initiative === "protagonist") {
      const bias =
        typeof selection.protagonistBias === "number"
          ? selection.protagonistBias
          : 1.4;
      weight *= bias;
    } else {
      weight *= 0.7;
    }
  }

  return Math.max(weight, 0);
};

const pickWeighted = (items = []) => {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1] || null;
};

const buildDirectorCue = (event) => {
  if (!event) return null;
  return {
    eventId: event.id,
    title: event.title,
    type: event.type,
    initiative: event.initiative,
    beat: event.prompt?.beat || "",
    focus: event.prompt?.focus || "",
    sensory: event.prompt?.sensory || "",
    hooks: event.prompt?.hooks || [],
  };
};

const selectStoryEvent = (lorebook = {}, storyState = {}, turnCount = 0) => {
  const events = Array.isArray(lorebook.events) ? lorebook.events : [];
  if (!events.length) {
    return { event: null, cue: null, initiativeFocus: false };
  }

  const policy = lorebook.rules?.eventSelection || {};
  const initiative = lorebook.rules?.initiative || {};
  const cooldownTurns =
    typeof policy.cooldownTurns === "number" ? policy.cooldownTurns : 2;
  const recentLimit =
    typeof policy.recentLimit === "number" ? policy.recentLimit : 4;
  const allowRepeat = Boolean(policy.allowRepeat);

  const recentEvents = Array.isArray(storyState?.meta?.recentEvents)
    ? storyState.meta.recentEvents
    : [];
  const recentIds = recentEvents
    .filter((item) =>
      typeof item?.turn === "number"
        ? turnCount - item.turn <= cooldownTurns
        : true
    )
    .map((item) => item.id)
    .filter(Boolean);

  const turnsSinceInitiative =
    typeof storyState?.meta?.turnsSinceInitiative === "number"
      ? storyState.meta.turnsSinceInitiative
      : 0;
  const minTurnsBetween =
    typeof initiative.minTurnsBetween === "number"
      ? initiative.minTurnsBetween
      : 1;
  const maxTurnsBetween =
    typeof initiative.maxTurnsBetween === "number"
      ? initiative.maxTurnsBetween
      : 3;
  const baseRate =
    typeof initiative.baseRate === "number" ? initiative.baseRate : 0.4;
  const protagonistBias =
    typeof initiative.protagonistBias === "number"
      ? initiative.protagonistBias
      : 1.4;
  const forceInitiative = turnsSinceInitiative >= maxTurnsBetween;
  const encourageInitiative =
    turnsSinceInitiative >= minTurnsBetween && Math.random() < baseRate;
  const initiativeFocus = forceInitiative || encourageInitiative;

  const weighted = events
    .map((event) => ({
      event,
      weight: computeEventWeight(event, storyState, {
        recentIds,
        cooldownTurns,
        allowRepeat,
        initiativeFocus,
        protagonistBias,
      }),
    }))
    .filter((item) => item.weight > 0);

  const picked =
    pickWeighted(weighted) ||
    events.find((event) => event.id === policy.fallbackEventId) ||
    events[0];
  const cue = buildDirectorCue(picked);
  return {
    event: picked,
    cue,
    initiativeFocus,
    recentLimit,
  };
};

const updateStoryMeta = (state = {}, event = null, turnCount = 0, recentLimit = 4) => {
  const next = {
    ...(state.meta || {}),
  };
  next.turn = turnCount;
  next.lastEventId = event?.id || "";
  const recentEvents = Array.isArray(state.meta?.recentEvents)
    ? state.meta.recentEvents.slice()
    : [];
  if (event?.id) {
    recentEvents.push({ id: event.id, turn: turnCount });
  }
  if (recentEvents.length > recentLimit) {
    next.recentEvents = recentEvents.slice(recentEvents.length - recentLimit);
  } else {
    next.recentEvents = recentEvents;
  }
  const turnsSinceInitiative =
    typeof state.meta?.turnsSinceInitiative === "number"
      ? state.meta.turnsSinceInitiative
      : 0;
  next.turnsSinceInitiative =
    event?.initiative === "protagonist" ? 0 : turnsSinceInitiative + 1;
  return next;
};

const normalizeNarrativeText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const tokenizeNarrativeText = (value = "") =>
  normalizeNarrativeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

const buildLocationKeywordSet = (location = {}) => {
  const raw = [
    location.id,
    location.name,
    location.description,
    ...(Array.isArray(location.tags) ? location.tags : []),
  ]
    .filter(Boolean)
    .join(" ");
  return Array.from(new Set(tokenizeNarrativeText(raw)));
};

const inferLocationFromText = ({
  text = "",
  lorebook = {},
  currentLocationId = "",
}) => {
  const normalized = normalizeNarrativeText(text);
  if (!normalized) return null;
  const tokenSet = new Set(tokenizeNarrativeText(normalized));
  const locations = Array.isArray(lorebook?.locations) ? lorebook.locations : [];
  if (!locations.length) return null;

  const hasInnCue = /\b(inn|innkeeper|room|upstairs|hearth|counter|tavern)\b/.test(
    normalized
  );
  const hasVillageCue = /\b(village|town)\b/.test(normalized);
  const hasRidgeCue = /\b(ridge|cliff|overlook)\b/.test(normalized);
  const hasRoadCue = /\b(road|path|valley|trail)\b/.test(normalized);

  let best = null;
  locations.forEach((location) => {
    const keywords = buildLocationKeywordSet(location);
    let score = 0;
    const locationName = normalizeNarrativeText(location.name || "");
    const locationId = normalizeNarrativeText((location.id || "").replace(/-/g, " "));
    if (locationName && normalized.includes(locationName)) score += 4;
    if (locationId && normalized.includes(locationId)) score += 3;
    keywords.forEach((keyword) => {
      if (tokenSet.has(keyword)) score += 1;
    });

    const locationText = normalizeNarrativeText(
      `${location.id || ""} ${location.name || ""} ${(location.tags || []).join(" ")}`
    );
    if (hasInnCue && /\b(village|town|settlement|warm|inn|tavern)\b/.test(locationText)) {
      score += 3;
    }
    if (hasVillageCue && /\b(village|town|settlement)\b/.test(locationText)) {
      score += 2;
    }
    if (hasRidgeCue && /\b(ridge|overlook|scenic)\b/.test(locationText)) {
      score += 2;
    }
    if (hasRoadCue && /\b(road|valley|travel|path)\b/.test(locationText)) {
      score += 2;
    }
    if (currentLocationId && location.id === currentLocationId) {
      score -= 0.5;
    }

    if (!best || score > best.score) {
      best = {
        id: location.id,
        name: location.name,
        description: location.description,
        tags: uniqueStringArray(location.tags || []),
        neighbors: uniqueStringArray(location.neighbors || []),
        score,
      };
    }
  });

  if (!best || best.score < 2) return null;
  return best;
};

const inferInteriorSceneFromText = (text = "") => {
  const normalized = normalizeNarrativeText(text);
  if (!normalized) return null;
  const hasInnCue = /\b(inn|innkeeper|tavern|common room|counter|stool|hearth|fire|flames|room|upstairs|woodsmoke)\b/.test(
    normalized
  );
  if (!hasInnCue) return null;

  if (/\b(room|upstairs|bed|window)\b/.test(normalized)) {
    return {
      description:
        "Modest inn room interior, wooden walls, warm lamplight, simple beds and a small window.",
      mood: "warm",
      tagsAdd: ["interior", "settlement", "warm", "safe", "rest"],
      weather: "",
    };
  }

  return {
    description:
      "Cozy inn common room, wooden tables, hearth firelight, warm lantern glow and drifting woodsmoke.",
    mood: "warm",
    tagsAdd: ["interior", "settlement", "warm", "safe", "hearth"],
    weather: "",
  };
};

const inferTimeOfDayFromText = (text = "", current = "") => {
  const normalized = normalizeNarrativeText(text);
  if (!normalized) return current || "";
  if (
    /\b(tomorrow|later|next)\b/.test(normalized) &&
    /\b(morning|night|evening|dusk|afternoon)\b/.test(normalized)
  ) {
    return current || "";
  }
  if (
    /\bin the morning\b/.test(normalized) &&
    !/\b(this morning|morning light|it is morning|at morning)\b/.test(normalized)
  ) {
    return current || "";
  }
  if (/\b(midnight|late night|night)\b/.test(normalized)) return "night";
  if (/\b(evening|dusk|sunset|darkening)\b/.test(normalized)) return "dusk";
  if (/\b(morning|sunrise|dawn)\b/.test(normalized)) return "morning";
  if (/\b(noon|midday)\b/.test(normalized)) return "midday";
  if (/\b(afternoon)\b/.test(normalized)) return "afternoon";
  return current || "";
};

const inferWeatherFromText = (text = "", current = "") => {
  const normalized = normalizeNarrativeText(text);
  if (!normalized) return current || "";
  if (/\b(storm|thunder)\b/.test(normalized)) return "storm";
  if (/\b(rain|rainy|drizzle)\b/.test(normalized)) return "rain";
  if (/\b(snow|snowy)\b/.test(normalized)) return "snow";
  if (/\b(fog|mist|haze)\b/.test(normalized)) return "mist";
  if (/\b(clear|sunny|bright)\b/.test(normalized)) return "clear";
  return current || "";
};

const inferMoodFromText = (text = "", current = "") => {
  const normalized = normalizeNarrativeText(text);
  if (!normalized) return current || "";
  if (/\b(safe|warm|welcoming|cozy|rest)\b/.test(normalized)) return "warm";
  if (/\b(suspicious|danger|tense|watched)\b/.test(normalized)) return "tense";
  if (/\b(quiet|calm)\b/.test(normalized)) return "quiet";
  return current || "";
};

const inferSceneTagsFromText = (text = "") => {
  const normalized = normalizeNarrativeText(text);
  if (!normalized) return [];
  const tags = [];
  if (/\b(inn|tavern|village|town|room)\b/.test(normalized)) {
    tags.push("settlement", "warm", "safe");
  }
  if (/\b(ridge|overlook)\b/.test(normalized)) {
    tags.push("scenic", "windy");
  }
  if (/\b(road|path|trail|journey|travel)\b/.test(normalized)) {
    tags.push("travel");
  }
  return uniqueStringArray(tags);
};

const inferSeparationFlags = (userText = "", assistantText = "") => {
  const combined = normalizeNarrativeText(`${userText} ${assistantText}`);
  const user = normalizeNarrativeText(userText);
  const add = [];
  const remove = [];
  if (
    /\b(leave you|you stay|i ll wait|see you in the room|without me)\b/.test(
      user
    )
  ) {
    add.push("player-separated");
  }
  if (
    /\b(find your room|rejoin|back together|you both|meet you|arrive together)\b/.test(
      combined
    )
  ) {
    remove.push("player-separated");
  }
  return {
    add: uniqueStringArray(add),
    remove: uniqueStringArray(remove),
  };
};

const inferStateDeltaFromText = ({
  userText = "",
  assistantText = "",
  lorebook = {},
  storyState = {},
}) => {
  const combinedText = `${userText} ${assistantText}`.trim();
  if (!combinedText) return {};
  const currentScene = storyState.scene || {};
  const sceneDelta = {};
  const inferredLocation = inferLocationFromText({
    text: combinedText,
    lorebook,
    currentLocationId: currentScene.locationId || "",
  });

  if (inferredLocation) {
    const isLocationChange = inferredLocation.id !== currentScene.locationId;
    if (isLocationChange) {
      sceneDelta.locationId = inferredLocation.id;
      sceneDelta.locationName = inferredLocation.name;
      sceneDelta.description = inferredLocation.description;
      sceneDelta.tagsAdd = inferredLocation.tags;
      sceneDelta.nearbyAdd = inferredLocation.neighbors;
      sceneDelta.nearbyRemove = uniqueStringArray(currentScene.nearby || []);
    }
  }

  const inferredInterior = inferInteriorSceneFromText(combinedText);
  if (inferredInterior) {
    sceneDelta.description =
      sceneDelta.description || inferredInterior.description;
    sceneDelta.mood = sceneDelta.mood || inferredInterior.mood;
    sceneDelta.tagsAdd = uniqueStringArray([
      ...(sceneDelta.tagsAdd || []),
      ...(inferredInterior.tagsAdd || []),
    ]);
  }

  const inferredTime = inferTimeOfDayFromText(combinedText, currentScene.timeOfDay);
  if (inferredTime && inferredTime !== currentScene.timeOfDay) {
    sceneDelta.timeOfDay = inferredTime;
  }

  const inferredWeather = inferWeatherFromText(combinedText, currentScene.weather);
  if (inferredWeather && inferredWeather !== currentScene.weather) {
    sceneDelta.weather = inferredWeather;
  }

  const inferredMood = inferMoodFromText(combinedText, currentScene.mood);
  if (!sceneDelta.mood && inferredMood && inferredMood !== currentScene.mood) {
    sceneDelta.mood = inferredMood;
  }

  const inferredTags = inferSceneTagsFromText(combinedText);
  if (inferredTags.length > 0) {
    sceneDelta.tagsAdd = uniqueStringArray([...(sceneDelta.tagsAdd || []), ...inferredTags]);
  }

  const separationFlags = inferSeparationFlags(userText, assistantText);
  const delta = {};
  if (Object.keys(sceneDelta).length > 0) {
    delta.scene = sceneDelta;
  }
  if (separationFlags.add.length > 0 || separationFlags.remove.length > 0) {
    delta.flags = {};
    if (separationFlags.add.length > 0) delta.flags.add = separationFlags.add;
    if (separationFlags.remove.length > 0) delta.flags.remove = separationFlags.remove;
  }
  return delta;
};

const mergeStateDeltaWithInference = (stateDelta = {}, inferredDelta = {}) => {
  const merged = stateDelta && typeof stateDelta === "object" ? { ...stateDelta } : {};
  if (!inferredDelta || typeof inferredDelta !== "object") return merged;

  if (inferredDelta.scene) {
    merged.scene = merged.scene && typeof merged.scene === "object" ? { ...merged.scene } : {};
    const sceneFields = [
      "locationId",
      "locationName",
      "description",
      "timeOfDay",
      "weather",
      "mood",
      "direction",
    ];
    sceneFields.forEach((field) => {
      if (!merged.scene[field] && inferredDelta.scene[field]) {
        merged.scene[field] = inferredDelta.scene[field];
      }
    });
    merged.scene.tagsAdd = uniqueStringArray([
      ...(merged.scene.tagsAdd || []),
      ...(inferredDelta.scene.tagsAdd || []),
    ]);
    merged.scene.tagsRemove = uniqueStringArray([
      ...(merged.scene.tagsRemove || []),
      ...(inferredDelta.scene.tagsRemove || []),
    ]);
    merged.scene.nearbyAdd = uniqueStringArray([
      ...(merged.scene.nearbyAdd || []),
      ...(inferredDelta.scene.nearbyAdd || []),
    ]);
    merged.scene.nearbyRemove = uniqueStringArray([
      ...(merged.scene.nearbyRemove || []),
      ...(inferredDelta.scene.nearbyRemove || []),
    ]);
  }

  if (inferredDelta.flags) {
    merged.flags = merged.flags && typeof merged.flags === "object" ? { ...merged.flags } : {};
    merged.flags.add = uniqueStringArray([
      ...(merged.flags.add || []),
      ...(inferredDelta.flags.add || []),
    ]);
    merged.flags.remove = uniqueStringArray([
      ...(merged.flags.remove || []),
      ...(inferredDelta.flags.remove || []),
    ]);
  }

  return merged;
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
    push(character.outfitMaterials);
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
  push(character.breastSize);
  push(character.ears);
  push(character.tails);
  push(character.horns);
  push(character.wings);
  push(character.hairStyles);
  push(character.accessories);
  push(character.markings);
  // 6) Clothes
  if (!character.name) {
    push(character.outfitMaterials);
  }
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
    viewDistance: "medium shot",
    background: "",
    signatureTraits: "official Frieren",
    eyeDetails: "",
    faceDetails: "",
    hairDetails: "",
    breastSize: "",
    ears: "",
    tails: "",
    horns: "",
    wings: "",
    hairStyles: "",
    accessories: "",
    markings: "",
    pose: "",
    outfitMaterials: "",
    styleReference: "tasteful anime design, character more detailed than background",
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
  breastSizes: promptBreastSizes,
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
      "breastSize",
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

const extractJsonStringField = (text = "", field = "") => {
  if (!text || !field) return "";
  const fieldToken = `"${field}"`;
  const fieldIndex = text.indexOf(fieldToken);
  if (fieldIndex === -1) return "";
  const colonIndex = text.indexOf(":", fieldIndex + fieldToken.length);
  if (colonIndex === -1) return "";
  let start = colonIndex + 1;
  while (start < text.length && /\s/.test(text[start])) start += 1;
  if (text[start] !== "\"") return "";
  let i = start + 1;
  let escaped = false;
  for (; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      const raw = text.slice(start, i + 1);
      try {
        return JSON.parse(raw);
      } catch (err) {
        return "";
      }
    }
  }
  return "";
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
  const cleaned = value
    .replace(/establishing shot/gi, "")
    .replace(/extreme wide/gi, "")
    .replace(/ultra wide/gi, "")
    .replace(/medium[- ]?long shot/gi, "")
    .replace(/environment visible/gi, "")
    .replace(/balanced composition/gi, "")
    .replace(/\bwide shot\b/gi, "")
    .replace(/\blong shot\b/gi, "")
    .replace(/close[- ]?up/gi, "")
    .replace(/extreme close[- ]?up/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (cleaned.includes("?")) {
    return cleaned.split("?")[0].trim();
  }
  return cleaned;
};

const normalizePromptFragment = (value = "") =>
  value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const ENVIRONMENT_HINTS = [
  "background",
  "environment",
  "interior",
  "exterior",
  "landscape",
  "sky",
  "sunset",
  "sunrise",
  "cloud",
  "forest",
  "woods",
  "mountain",
  "beach",
  "ocean",
  "sea",
  "lake",
  "river",
  "ruins",
  "temple",
  "castle",
  "village",
  "town",
  "street",
  "alley",
  "tavern",
  "room",
  "hall",
  "garden",
  "field",
  "snow",
  "rain",
  "storm",
  "fog",
  "mist",
];

const splitPromptFragments = (value = "") =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

const isEnvironmentFragment = (fragment = "") => {
  const normalized = fragment.toLowerCase();
  return ENVIRONMENT_HINTS.some((hint) => normalized.includes(hint));
};

const extractSceneContextFragments = (scenePrompt = "") => {
  const parts = splitPromptFragments(scenePrompt);
  const environment = [];
  const action = [];
  parts.forEach((part) => {
    if (isEnvironmentFragment(part)) {
      environment.push(part);
    } else {
      action.push(part);
    }
  });
  return { environment, action };
};

const dedupeFragments = (parts = []) => {
  const seen = new Set();
  return parts.filter((part) => {
    const normalized = String(part || "").trim();
    if (!normalized) return false;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildSceneFragmentsFromStoryState = (storyState = {}, worldPrompt = "") => {
  const scene = storyState?.scene || {};
  const environment = dedupeFragments([
    scene.locationName,
    scene.description,
    scene.weather,
    scene.timeOfDay,
    scene.mood,
    worldPrompt,
  ]);
  const action = dedupeFragments([
    scene.direction ? `moving ${scene.direction}` : "",
    scene.mood ? `mood ${scene.mood}` : "",
  ]);
  return {
    environment,
    action,
    prompt: dedupeFragments([...environment, ...action]).join(", "),
  };
};

const extractContextualSceneFragments = (text = "") => {
  const normalized = normalizeNarrativeText(text);
  if (!normalized) {
    return { environment: [], action: [] };
  }
  const environment = [];
  const action = [];

  if (/\b(inn|tavern|innkeeper|common room|counter|stool|wooden table)\b/.test(normalized)) {
    environment.push("cozy inn common room", "wooden interior", "warm lantern light");
  }
  if (/\b(hearth|fire|flame|firelight|woodsmoke)\b/.test(normalized)) {
    environment.push("hearth firelight", "soft warm glow");
    action.push("seated near the hearth", "watching the flames");
  }
  if (/\b(room|upstairs|bed|window)\b/.test(normalized)) {
    environment.push("modest inn room interior", "warm lamplight");
    action.push("resting in an inn room");
  }
  if (/\b(road|path|valley|trail)\b/.test(normalized)) {
    environment.push("stone road", "misty path");
  }
  if (/\b(village|town|lantern)\b/.test(normalized)) {
    environment.push("village lights", "settlement edge");
  }
  if (/\b(tea|teacup|cup)\b/.test(normalized)) {
    action.push("holding a teacup");
  }
  if (/\b(sit|seated|sits|stool|table)\b/.test(normalized)) {
    action.push("seated posture");
  }
  if (/\b(glance|gaze|watching|looking)\b/.test(normalized)) {
    action.push("attentive gaze");
  }

  return {
    environment: dedupeFragments(environment),
    action: dedupeFragments(action),
  };
};

const INTERIOR_SCENE_HINTS = [
  "inn",
  "tavern",
  "room",
  "interior",
  "hearth",
  "fire",
  "flame",
  "lantern",
  "lamplight",
  "wooden",
  "table",
  "bed",
  "window",
];

const EXTERIOR_SCENE_HINTS = [
  "road",
  "valley",
  "village outskirts",
  "countryside",
  "field",
  "mountain",
  "sky",
  "village",
];

const META_SCENE_HINTS = [
  "morning",
  "afternoon",
  "dusk",
  "night",
  "mood",
  "moving",
  "northbound",
  "southbound",
  "eastbound",
  "westbound",
];

const isFragmentWithHints = (fragment = "", hints = []) => {
  const normalized = normalizeNarrativeText(fragment);
  return hints.some((hint) => normalized.includes(hint));
};

const buildCompactSceneContext = ({
  environment = [],
  action = [],
  maxEnvironment = 6,
  maxAction = 1,
}) => {
  const env = dedupeFragments(environment)
    .map((fragment) => normalizePromptFragment(fragment))
    .filter(Boolean)
    .filter((fragment) => fragment.length <= 90);
  const act = dedupeFragments(action)
    .map((fragment) => normalizePromptFragment(fragment))
    .filter(Boolean)
    .filter((fragment) => fragment.length <= 70);

  const hasInteriorCue = env.some((fragment) =>
    isFragmentWithHints(fragment, INTERIOR_SCENE_HINTS)
  );

  const filteredEnvironment = env.filter((fragment) => {
    const isMeta = isFragmentWithHints(fragment, META_SCENE_HINTS);
    if (isMeta) return false;
    if (hasInteriorCue && isFragmentWithHints(fragment, EXTERIOR_SCENE_HINTS)) {
      return false;
    }
    return true;
  });

  const filteredAction = act.filter((fragment) => {
    const isMeta = isFragmentWithHints(fragment, META_SCENE_HINTS);
    if (isMeta) return false;
    if (
      hasInteriorCue &&
      isFragmentWithHints(fragment, ["moving", "walking", "traveling"])
    ) {
      return false;
    }
    return true;
  });

  const compactEnvironment = dedupeFragments(filteredEnvironment).slice(
    0,
    maxEnvironment
  );
  const compactAction = dedupeFragments(filteredAction).slice(0, maxAction);
  return {
    environment: compactEnvironment,
    action: compactAction,
    prompt: dedupeFragments([...compactEnvironment, ...compactAction]).join(", "),
  };
};

const compactScenePayload = ({
  scenePrompt = "",
  sceneEnvironment = "",
  sceneAction = "",
  contextText = "",
}) => {
  const promptContext = extractSceneContextFragments(scenePrompt || "");
  const contextual = extractContextualSceneFragments(contextText || "");
  const mergedEnvironment = dedupeFragments([
    ...contextual.environment,
    ...splitPromptFragments(sceneEnvironment || ""),
    ...promptContext.environment,
  ]);
  const mergedAction = dedupeFragments([
    ...contextual.action,
    ...splitPromptFragments(sceneAction || ""),
    ...promptContext.action,
  ]);
  const compact = buildCompactSceneContext({
    environment: mergedEnvironment,
    action: mergedAction,
  });
  return {
    scenePrompt: compact.prompt,
    sceneEnvironment: compact.environment.join(", "),
    sceneAction: compact.action.join(", "),
  };
};

const clipText = (value = "", max = 1200) => {
  const normalized = normalizePromptFragment(value);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trim()}...`;
};

const aiCraftSceneContext = async ({
  scenePrompt = "",
  sceneEnvironment = "",
  sceneAction = "",
  contextText = "",
  storyState = {},
  lorebook = {},
}) => {
  const fallback = compactScenePayload({
    scenePrompt,
    sceneEnvironment,
    sceneAction,
    contextText,
  });
  const signalText = clipText(contextText, 1200);
  const sourcePayload = {
    scenePrompt: clipText(scenePrompt, 600),
    sceneEnvironment: clipText(sceneEnvironment, 600),
    sceneAction: clipText(sceneAction, 300),
    context: signalText,
    currentScene: {
      locationName: storyState?.scene?.locationName || "",
      description: storyState?.scene?.description || "",
      weather: storyState?.scene?.weather || "",
      timeOfDay: storyState?.scene?.timeOfDay || "",
      mood: storyState?.scene?.mood || "",
      tags: uniqueStringArray(storyState?.scene?.tags || []),
    },
    knownLocations: Array.isArray(lorebook?.locations)
      ? lorebook.locations.map((location) => ({
          id: location.id,
          name: location.name,
          tags: uniqueStringArray(location.tags || []),
        }))
      : [],
  };

  try {
    const command = new InvokeModelCommand({
      modelId: promptHelperModelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 260,
        temperature: 0.1,
        system: [
          "You compress scene context for anime illustration prompts with strong character-fidelity priority.",
          "Return ONLY valid JSON object with keys: scenePrompt, sceneEnvironment, sceneAction.",
          "Use `context` as highest-priority truth (what is visible now). Use `currentScene` only if context is missing.",
          "Choose ONE dominant setting cluster for this frame.",
          "Do not mix indoor and outdoor clusters unless the context explicitly says both are visible in one shot.",
          "Drop narrative/meta information: mood labels, directions, goals, future plans, summaries, off-screen events.",
          "Do not include location IDs or abstract tokens.",
          "Each fragment should be 2-6 words and concrete visual language.",
          "sceneEnvironment: 3-6 short visual fragments, comma-separated, no duplicates.",
          "sceneAction: 0-1 short visible action fragment, comma-separated.",
          "scenePrompt: concise merge of sceneEnvironment then sceneAction.",
        ].join("\n"),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify(sourcePayload),
              },
            ],
          },
        ],
      }),
    });
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const responseText = (responseBody?.content || [])
      .map((item) => item?.text)
      .filter(Boolean)
      .join("")
      .trim();
    const parsed = safeJsonParse(responseText) || {};
    const aiScenePrompt = normalizePromptFragment(parsed.scenePrompt || "");
    const aiSceneEnvironment = normalizePromptFragment(
      parsed.sceneEnvironment || ""
    );
    const aiSceneAction = normalizePromptFragment(parsed.sceneAction || "");
    if (!aiScenePrompt && !aiSceneEnvironment && !aiSceneAction) {
      return fallback;
    }
    const compact = compactScenePayload({
      scenePrompt: aiScenePrompt || fallback.scenePrompt,
      sceneEnvironment: aiSceneEnvironment || fallback.sceneEnvironment,
      sceneAction: aiSceneAction || fallback.sceneAction,
      contextText: signalText,
    });
    return compact.scenePrompt || compact.sceneEnvironment || compact.sceneAction
      ? compact
      : fallback;
  } catch (error) {
    return fallback;
  }
};

const buildStoryIllustrationPrompt = ({
  character,
  sessionItem,
  summaryLine,
  contextLine,
  recentTranscript,
  cleanScenePrompt,
  sceneEnvironment,
  sceneAction,
  contextMode,
}) => {
  const shotRange = character?.viewDistance || "medium shot";
  const includeScene =
    contextMode === "scene" ||
    contextMode === "summary+scene" ||
    contextMode === "summary+latest" ||
    contextMode === "recent" ||
    contextMode === "summary+recent";
  const sceneContext = includeScene
    ? {
        environment: splitPromptFragments(sceneEnvironment),
        action: splitPromptFragments(sceneAction),
      }
    : { environment: [], action: [] };
  const resolvedSceneContext =
    sceneContext.environment.length || sceneContext.action.length
      ? sceneContext
      : includeScene
        ? extractSceneContextFragments(cleanScenePrompt)
        : { environment: [], action: [] };
  const contextSignalText =
    contextMode === "summary+scene" || contextMode === "summary+latest"
      ? contextLine
      : contextMode === "recent" || contextMode === "summary+recent"
        ? recentTranscript
        : "";
  const contextualScene = extractContextualSceneFragments(contextSignalText);
  const stateSceneContext = buildSceneFragmentsFromStoryState(
    sessionItem?.storyState || {},
    sessionItem?.worldPrompt || ""
  );
  const hasSceneEnvironment =
    resolvedSceneContext.environment.length > 0 ||
    contextualScene.environment.length > 0;
  const environmentParts = dedupeFragments([
    ...contextualScene.environment,
    ...resolvedSceneContext.environment,
    ...(hasSceneEnvironment
      ? []
      : [...stateSceneContext.environment, sessionItem?.worldPrompt]),
    "background detailed but secondary",
  ]);
  const actionParts = dedupeFragments([
    ...contextualScene.action,
    ...resolvedSceneContext.action,
    ...(resolvedSceneContext.action.length > 0 || contextualScene.action.length > 0
      ? []
      : stateSceneContext.action),
  ]);
  const compactScene = buildCompactSceneContext({
    environment: environmentParts,
    action: actionParts,
  });
  const promptEnvironment = dedupeFragments([
    ...compactScene.environment,
    "background detailed but secondary",
  ]);

  const characterParts = ["1girl, solo"];
  if (character?.name) {
    const weight =
      typeof character.weight === "number" ? character.weight : 1.4;
    characterParts.push(`(${character.name}:${weight})`);
  }
  if (character?.signatureTraits) {
    characterParts.push(character.signatureTraits);
  }

  const focusActionParts = dedupeFragments([
    character?.eyeDetails,
    character?.pose,
  ]);

  const visualParts = dedupeFragments([character?.styleReference]);
  const focusParts = dedupeFragments([
    ...focusActionParts,
    ...compactScene.action.slice(0, 1),
  ]);

  return [
    shotRange,
    characterParts.join(", "),
    promptEnvironment.join(", "),
    focusParts.join(", "),
    visualParts.join(", "),
  ]
    .filter(Boolean)
    .join(", ");
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

const deleteS3ObjectsByPrefix = async (bucket, prefix) => {
  if (!bucket || !prefix) return;
  let continuationToken;
  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    const keys = (response.Contents || [])
      .map((item) => item.Key)
      .filter(Boolean);
    for (const key of keys) {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );
    }
    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);
};

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

const isDataUrl = (value = "") => /^data:/i.test(value);

const decodeDataUrl = (value = "") => {
  const match = value.match(/^data:([^;]+);base64,(.*)$/i);
  if (!match) {
    throw new Error("Unsupported data URL format");
  }
  const [, contentType, base64] = match;
  return { buffer: Buffer.from(base64, "base64"), contentType };
};

const looksLikeBase64 = (value = "") =>
  /^[a-z0-9+/=]+$/i.test(value) && value.length > 256;

const resolveGradioImageBuffer = async (output) => {
  if (!output) {
    throw new Error("No image returned from Gradio");
  }
  if (Array.isArray(output)) {
    if (!output.length) {
      throw new Error("No image returned from Gradio");
    }
    return resolveGradioImageBuffer(output[0]);
  }
  if (typeof output === "string") {
    if (isDataUrl(output)) {
      return decodeDataUrl(output);
    }
    if (/^https?:\/\//i.test(output)) {
      return fetchImageBuffer(output);
    }
    if (looksLikeBase64(output)) {
      return { buffer: Buffer.from(output, "base64"), contentType: "image/png" };
    }
    throw new Error("Unsupported Gradio image output");
  }
  if (typeof output === "object") {
    if (output.image) {
      return resolveGradioImageBuffer(output.image);
    }
    const url = output.url || output.path || output.data;
    if (typeof url === "string") {
      return resolveGradioImageBuffer(url);
    }
  }
  throw new Error("Unsupported Gradio image output");
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

const collectReplicateOutputUrls = (output, urls) => {
  if (!output) return;
  if (Array.isArray(output)) {
    output.forEach((item) => collectReplicateOutputUrls(item, urls));
    return;
  }
  if (typeof output === "string") {
    urls.push(output);
    return;
  }
  if (typeof output.url === "function") {
    urls.push(output.url());
    return;
  }
  if (typeof output.url === "string") {
    urls.push(output.url);
  }
};

const getReplicateOutputUrls = (output) => {
  const urls = [];
  collectReplicateOutputUrls(output, urls);
  return urls.filter(Boolean);
};

const getReplicateOutputUrl = (output) =>
  getReplicateOutputUrls(output)[0] || null;

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
      breastSizes: getOption("breastSizes"),
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
  const breastSize = req.body?.breastSize?.trim();
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
      breastSize ||
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
    outfitMaterials ? `Outfit/materials: ${outfitMaterials}` : null,
    pose ? `Pose: ${pose}` : null,
    signatureTraits ? `Signature traits: ${signatureTraits}` : null,
    faceDetails ? `Face details: ${faceDetails}` : null,
    eyeDetails ? `Eye details: ${eyeDetails}` : null,
    breastSize ? `Breast size: ${breastSize}` : null,
    ears ? `Ears: ${ears}` : null,
    tails ? `Tail: ${tails}` : null,
    horns ? `Horns: ${horns}` : null,
    wings ? `Wings: ${wings}` : null,
    hairStyles ? `Hair style: ${hairStyles}` : null,
    viewDistance ? `View distance: ${viewDistance}` : null,
    accessories ? `Accessories: ${accessories}` : null,
    markings ? `Markings: ${markings}` : null,
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
    "Start with: 1girl, solo, then outfit/materials (if provided), then the character name and core identity.",
    "Place outfit/materials immediately after 1girl, solo and before the character name.",
    "Include these phrases verbatim early in the prompt: anime cinematic illustration; faithful anime character design; accurate facial features; consistent identity.",
    "Follow this order of information after the opening identity:",
    "camera & framing, character placement, pose & body dynamics, hair/fabric motion, action/interaction, effects (controlled), background type, environment details, depth/lighting, art quality & style, image clarity & coherence.",
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
    await putMediaItem({ userId, type: "IMG", key });
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

app.get("/replicate/image/status", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const userId = req.user?.sub;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const predictionId = req.query?.predictionId;
  const imageName = req.query?.imageName;
  const batchId = req.query?.batchId;

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
  if (!imageName) {
    return res.status(400).json({ message: "imageName is required" });
  }
  if (!batchId) {
    return res.status(400).json({ message: "batchId is required" });
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
    const outputUrls = getReplicateOutputUrls(prediction.output);
    if (!outputUrls.length) {
      return res.status(500).json({
        message: "No images returned from Replicate",
        response: prediction,
      });
    }

    const images = await Promise.all(
      outputUrls.map(async (url, index) => {
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

    res.json({
      predictionId,
      status: prediction.status,
      batchId,
      images,
    });
  } catch (error) {
    console.error("Replicate image status error details:", {
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
    const resolvedLorebook = resolveStoryLorebook(preset, protagonistName);
    const initialStoryState = buildInitialStoryState(resolvedLorebook);

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
      lorebook: resolvedLorebook,
      storyState: initialStoryState,
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
      "medium shot, balanced composition",
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
        lorebook: sessionItem.lorebook,
        storyState: sessionItem.storyState,
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
        lorebook: sessionItem.lorebook,
        storyState: sessionItem.storyState,
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
        sceneEnvironment: scene.sceneEnvironment,
        sceneAction: scene.sceneAction,
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

app.delete("/story/sessions/:id", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const mediaTableName = process.env.MEDIA_TABLE;
  const userId = req.user?.sub;
  const sessionId = req.params.id;

  if (!mediaTableName) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
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
      limit: 200,
      scanForward: true,
    });

    const deleteItems = [
      { pk: buildMediaPk(userId), sk: buildStorySessionSk(sessionId) },
      ...messages.map((item) => ({ pk: item.pk, sk: item.sk })),
      ...scenes.map((item) => ({ pk: item.pk, sk: item.sk })),
    ];

    await Promise.all(
      deleteItems.map((item) =>
        dynamoClient.send(
          new DeleteCommand({
            TableName: mediaTableName,
            Key: item,
          })
        )
      )
    );

    if (mediaBucket) {
      const prefix = `${buildUserPrefix(userId)}stories/${sessionId}/`;
      try {
        await deleteS3ObjectsByPrefix(mediaBucket, prefix);
      } catch (error) {
        console.warn("Failed to delete story assets:", {
          message: error?.message || String(error),
          prefix,
        });
      }
    }

    res.json({
      sessionId,
      deletedMessages: messages.length,
      deletedScenes: scenes.length,
    });
  } catch (error) {
    console.error("Story session delete error:", {
      name: error?.name,
      message: error?.message,
      metadata: error?.$metadata,
      cause: error?.cause,
    });
    res.status(500).json({
      message: "Failed to delete story session",
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
      limit: 8,
      scanForward: false,
    });
    const orderedMessages = recentMessages.reverse();
    const lorebookSeed = {
      id: sessionItem.presetId,
      name: sessionItem.title,
      synopsis: sessionItem.synopsis,
      worldPrompt: sessionItem.worldPrompt,
      opening: sessionItem.opening,
      lorebook: sessionItem.lorebook,
    };
    const resolvedLorebook =
      sessionItem.lorebook ||
      resolveStoryLorebook(lorebookSeed, sessionItem.protagonistName);
    const resolvedStoryState =
      sessionItem.storyState || buildInitialStoryState(resolvedLorebook);
    const directorSelection = selectStoryEvent(
      resolvedLorebook,
      resolvedStoryState,
      newTurnCount
    );
    const directorCue = directorSelection.cue;
    const isPlayerSeparated = (resolvedStoryState.flags || []).includes(
      "player-separated"
    );

    const systemPrompt = [
      "You are a narrative director for an interactive anime adventure.",
      `Protagonist: ${sessionItem.protagonistName}.`,
      "The protagonist must remain the same character in every scene.",
      "Keep continuity with the story summary and prior dialogue.",
      "Keep narration minimal. Favor direct action and dialogue from the protagonist.",
      "Each paragraph should include the protagonist acting or speaking. Avoid long exposition.",
      "Environment changes should be concise (one short sentence max) and reflected in stateDelta.",
      "Perspective rule: the player only knows what they directly perceive.",
      "If Frieren acts away from the player, do not render full off-screen conversations; summarize key outcome in 1-2 concise sentences, then return to direct interaction with the player.",
      "When the player indicates movement or a new place (inn, village, road, ruins), update stateDelta.scene.locationId/locationName/description accordingly using the Lorebook locations.",
      "Use the Lorebook and Current State to keep environment, NPCs, and goals coherent.",
      "Integrate the Director cue into the next reply. If initiative is protagonist, the protagonist should act first or propose an action without waiting for the player.",
      "Respond in 2-4 short paragraphs, then end with a question to the player.",
      "When a meaningful scene beat occurs, mark it as a sceneBeat.",
      "Update stateDelta to reflect changes in location, time, weather, tags, goals, flags, NPC presence, and metrics (tension, mystery, urgency, progress, fatigue).",
      "stateDelta schema: { scene: { locationId, locationName, description, timeOfDay, weather, mood, direction, tagsAdd, tagsRemove, nearbyAdd, nearbyRemove }, metrics: { tension, mystery, urgency, progress, fatigue }, metricsDelta: { tension, mystery, urgency, progress, fatigue }, goals: { activeAdd, activeRemove, completedAdd }, flags: { add, remove }, npcs: { presentAdd, presentRemove } }.",
      "Return ONLY valid JSON with keys:",
      "reply (string), summary (string), sceneBeat (boolean), sceneTitle (string), sceneDescription (string), scenePrompt (string), sceneEnvironment (string), sceneAction (string), stateDelta (object).",
      "scenePrompt should focus on visual details of the moment (environment, action, mood) and be concise.",
      "scenePrompt must be purely visual fragments (comma-separated). No dialogue, no questions, no second-person phrasing.",
      "sceneEnvironment: comma-separated background/environment fragments (short phrases).",
      "sceneAction: comma-separated action/pose/motion fragments (short phrases).",
      "scenePrompt should include framing guidance: medium shot or full body, face readable, no extreme wide shots.",
      `Player separation mode: ${isPlayerSeparated ? "separated" : "shared-scene"}.`,
      `Lorebook: ${JSON.stringify(resolvedLorebook)}`,
      `Current state: ${JSON.stringify(resolvedStoryState)}`,
      `Director cue: ${directorCue ? JSON.stringify(directorCue) : "none"}`,
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
    const extractedReply =
      typeof parsed.reply === "string" && parsed.reply.trim().length > 0
        ? ""
        : extractJsonStringField(responseText, "reply");
    const replyText =
      parsed.reply ||
      extractedReply ||
      responseText ||
      "The story continues.";
    const nextSummary =
      typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary.trim()
        : sessionItem.summary || "";
    let sceneBeat = Boolean(parsed.sceneBeat);
    const sceneTitle = parsed.sceneTitle?.trim() || "";
    const sceneDescription = parsed.sceneDescription?.trim() || "";
    let scenePrompt = parsed.scenePrompt?.trim() || "";
    let sceneEnvironment = parsed.sceneEnvironment?.trim() || "";
    let sceneAction = parsed.sceneAction?.trim() || "";
    const rawStateDelta = parsed.stateDelta;
    const stateDelta =
      rawStateDelta && typeof rawStateDelta === "object" ? rawStateDelta : {};
    const inferredStateDelta = inferStateDeltaFromText({
      userText: content,
      assistantText: replyText,
      lorebook: resolvedLorebook,
      storyState: resolvedStoryState,
    });
    const resolvedStateDelta = mergeStateDeltaWithInference(
      stateDelta,
      inferredStateDelta
    );

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

    let nextStoryState = applyStateDelta(
      resolvedStoryState,
      directorSelection.event?.effects || {}
    );
    nextStoryState = applyStateDelta(nextStoryState, resolvedStateDelta);
    nextStoryState.meta = updateStoryMeta(
      nextStoryState,
      directorSelection.event,
      newTurnCount,
      directorSelection.recentLimit
    );

    const contextualSceneFromReply = extractContextualSceneFragments(replyText);
    if (
      contextualSceneFromReply.environment.length > 0 ||
      contextualSceneFromReply.action.length > 0
    ) {
      sceneEnvironment = dedupeFragments([
        ...splitPromptFragments(sceneEnvironment),
        ...contextualSceneFromReply.environment,
      ]).join(", ");
      sceneAction = dedupeFragments([
        ...splitPromptFragments(sceneAction),
        ...contextualSceneFromReply.action,
      ]).join(", ");
      if (!scenePrompt) {
        scenePrompt = dedupeFragments([
          ...splitPromptFragments(sceneEnvironment),
          ...splitPromptFragments(sceneAction),
        ]).join(", ");
      }
    }

    const locationChanged = Boolean(
      resolvedStateDelta?.scene?.locationId ||
        resolvedStateDelta?.scene?.locationName ||
        resolvedStateDelta?.scene?.description
    );
    const eventType = directorSelection.event?.type;
    const turnsSinceIllustration = newTurnCount - lastIllustrationTurn;
    const shouldAutoIllustrate = turnsSinceIllustration >= 2;
    const shouldForceScene =
      locationChanged ||
      eventType === "environment" ||
      eventType === "discovery" ||
      eventType === "npc" ||
      eventType === "choice" ||
      shouldAutoIllustrate;
    let hasSceneVisual =
      Boolean(scenePrompt) || Boolean(sceneEnvironment) || Boolean(sceneAction);
    if (!hasSceneVisual && shouldForceScene) {
      const fallbackScene = buildSceneFragmentsFromStoryState(
        nextStoryState,
        sessionItem.worldPrompt
      );
      scenePrompt = fallbackScene.prompt;
      sceneEnvironment = fallbackScene.environment.join(", ");
      sceneAction = fallbackScene.action.join(", ");
      sceneBeat = true;
      hasSceneVisual =
        Boolean(scenePrompt) || Boolean(sceneEnvironment) || Boolean(sceneAction);
    }
    if (locationChanged) {
      const stateScene = buildSceneFragmentsFromStoryState(
        nextStoryState,
        sessionItem.worldPrompt
      );
      sceneEnvironment = dedupeFragments([
        ...splitPromptFragments(sceneEnvironment),
        ...stateScene.environment,
      ]).join(", ");
      sceneAction = dedupeFragments([
        ...splitPromptFragments(sceneAction),
        ...stateScene.action,
      ]).join(", ");
      scenePrompt = dedupeFragments([
        ...splitPromptFragments(scenePrompt),
        ...stateScene.environment,
        ...stateScene.action,
      ]).join(", ");
      hasSceneVisual =
        Boolean(scenePrompt) || Boolean(sceneEnvironment) || Boolean(sceneAction);
    }
    if (hasSceneVisual) {
      const compactScene = await aiCraftSceneContext({
        scenePrompt,
        sceneEnvironment,
        sceneAction,
        contextText: replyText,
        storyState: nextStoryState,
        lorebook: resolvedLorebook,
      });
      scenePrompt = compactScene.scenePrompt;
      sceneEnvironment = compactScene.sceneEnvironment;
      sceneAction = compactScene.sceneAction;
      hasSceneVisual =
        Boolean(scenePrompt) || Boolean(sceneEnvironment) || Boolean(sceneAction);
    }

    let scene = null;
    let nextSceneCount = sessionItem.sceneCount || 0;
    const shouldIllustrate =
      sceneBeat && hasSceneVisual && turnsSinceIllustration >= 2;

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
        sceneEnvironment,
        sceneAction,
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
        sceneEnvironment,
        sceneAction,
        status: "pending",
      };
    }

    const updatedSession = {
      ...sessionItem,
      summary: nextSummary,
      lorebook: resolvedLorebook,
      storyState: nextStoryState,
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
      storyState: nextStoryState,
      lorebook: resolvedLorebook,
      summary: nextSummary,
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
  let sceneId = req.body?.sceneId;
  const forceCurrent = Boolean(req.body?.forceCurrent);
  const regenerate = Boolean(req.body?.regenerate);
  const contextMode = req.body?.contextMode || "summary+scene";
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
  if (!sessionId || (!sceneId && !forceCurrent)) {
    return res
      .status(400)
      .json({ message: "sessionId and sceneId are required unless forceCurrent is true" });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }

    let sceneItem = null;
    if (sceneId) {
      sceneItem = await getItem({
        pk: buildMediaPk(userId),
        sk: buildStorySceneSk(sessionId, sceneId),
      });
    }
    if (!sceneItem && forceCurrent) {
      const recentMessages = await queryBySkPrefix({
        pk: buildMediaPk(userId),
        skPrefix: storyMessagePrefix(sessionId),
        limit: 6,
        scanForward: false,
      });
      const latestAssistant = recentMessages.find(
        (message) => message.role === "assistant"
      );
      const stateScene = buildSceneFragmentsFromStoryState(
        sessionItem.storyState || {},
        sessionItem.worldPrompt || ""
      );
      const contextualScene = extractContextualSceneFragments(
        latestAssistant?.content || ""
      );
      const mergedEnvironment = dedupeFragments([
        ...contextualScene.environment,
        ...stateScene.environment,
      ]);
      const mergedAction = dedupeFragments([
        ...contextualScene.action,
        ...stateScene.action,
      ]);
      const compactCurrentScene = await aiCraftSceneContext({
        scenePrompt: dedupeFragments([...mergedEnvironment, ...mergedAction]).join(", "),
        sceneEnvironment: mergedEnvironment.join(", "),
        sceneAction: mergedAction.join(", "),
        contextText: latestAssistant?.content || "",
        storyState: sessionItem.storyState || {},
        lorebook: sessionItem.lorebook || {},
      });
      sceneId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      sceneItem = {
        pk: buildMediaPk(userId),
        sk: buildStorySceneSk(sessionId, sceneId),
        type: "STORY_SCENE",
        sessionId,
        sceneId,
        title: "Current moment",
        description:
          normalizePromptFragment(latestAssistant?.content || "") ||
          `Current scene with ${sessionItem.protagonistName}.`,
        prompt: compactCurrentScene.scenePrompt,
        sceneEnvironment: compactCurrentScene.sceneEnvironment,
        sceneAction: compactCurrentScene.sceneAction,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: sceneItem,
        })
      );
      const updatedSession = {
        ...sessionItem,
        sceneCount: (sessionItem.sceneCount || 0) + 1,
        updatedAt: new Date().toISOString(),
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: updatedSession,
        })
      );
      sessionItem.sceneCount = updatedSession.sceneCount;
      sessionItem.updatedAt = updatedSession.updatedAt;
    }
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
      return res.json({
        sceneId,
        imageKey: sceneItem.imageKey,
        imageUrl: url,
        scene: {
          sceneId: sceneItem.sceneId,
          title: sceneItem.title,
          description: sceneItem.description,
          prompt: sceneItem.prompt,
          sceneEnvironment: sceneItem.sceneEnvironment,
          sceneAction: sceneItem.sceneAction,
          status: sceneItem.status,
          createdAt: sceneItem.createdAt,
        },
      });
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
    const orderedRecent = recentMessages.slice().reverse();
    const lastAssistant = recentMessages.find(
      (message) => message.role === "assistant"
    );
    const contextLine = lastAssistant?.content
      ? normalizePromptFragment(lastAssistant.content)
      : "";
    const summaryLine = sessionItem.summary
      ? normalizePromptFragment(sessionItem.summary)
      : "";
    const recentTranscript = orderedRecent
      .map((message) => {
        const label = message.role === "user" ? "Player" : "Narrator";
        return `${label}: ${normalizePromptFragment(message.content || "")}`;
      })
      .filter(Boolean)
      .join(" ");
    const compactSceneForPrompt = await aiCraftSceneContext({
      scenePrompt: sceneItem.prompt || "",
      sceneEnvironment: sceneItem.sceneEnvironment || "",
      sceneAction: sceneItem.sceneAction || "",
      contextText: contextLine || recentTranscript,
      storyState: sessionItem.storyState || {},
      lorebook: sessionItem.lorebook || {},
    });
    let cleanScenePrompt = sanitizeScenePrompt(
      compactSceneForPrompt.scenePrompt || sceneItem.prompt || ""
    );
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

    const positivePrompt = buildStoryIllustrationPrompt({
      character: resolvedCharacter,
      sessionItem,
      summaryLine,
      contextLine,
      recentTranscript,
      cleanScenePrompt,
      sceneEnvironment:
        compactSceneForPrompt.sceneEnvironment || sceneItem.sceneEnvironment || "",
      sceneAction: compactSceneForPrompt.sceneAction || sceneItem.sceneAction || "",
      contextMode,
    });

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
      prompt: compactSceneForPrompt.scenePrompt || sceneItem.prompt,
      sceneEnvironment:
        compactSceneForPrompt.sceneEnvironment || sceneItem.sceneEnvironment,
      sceneAction: compactSceneForPrompt.sceneAction || sceneItem.sceneAction,
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
      scene: {
        sceneId: updatedScene.sceneId,
        title: updatedScene.title,
        description: updatedScene.description,
        prompt: updatedScene.prompt,
        sceneEnvironment: updatedScene.sceneEnvironment,
        sceneAction: updatedScene.sceneAction,
        status: updatedScene.status,
        createdAt: updatedScene.createdAt,
      },
      ...(debug
        ? {
            prompt: {
              positive: trimmedPositivePrompt,
              negative: trimmedNegativePrompt,
            },
            identity: identityBlock,
            context: {
              mode: contextMode,
              summary: summaryLine,
              latest: contextLine,
              recent: recentTranscript,
              scene: cleanScenePrompt,
              sceneEnvironment: updatedScene.sceneEnvironment || "",
              sceneAction: updatedScene.sceneAction || "",
            },
            promptPattern: [
              "shot range",
              "environment/background",
              "clothes",
              "character (1girl, solo + name + recognizable)",
              "focus/action",
              "face/furry details",
              "visual/style",
            ],
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
