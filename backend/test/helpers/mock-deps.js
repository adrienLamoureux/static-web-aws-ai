"use strict";

/**
 * createMockDeps — returns a fully-stubbed deps object matching the shape
 * produced by backend/lib/build-deps.js.  Pass `overrides` to replace any
 * individual property for a specific test.
 */
const createMockDeps = (overrides = {}) => {
  // ── Command constructor stubs ──────────────────────────────────────────────
  const makeCommandStub = (name) => {
    function Cmd(input) {
      this.input = input;
      this._name = name;
    }
    Cmd.displayName = name;
    return Cmd;
  };

  // ── AWS client stubs ───────────────────────────────────────────────────────
  const bedrockClient = {
    send: async () => ({
      body: new TextEncoder().encode(
        JSON.stringify({
          content: [{ type: "text", text: "mock response [EMOTION: neutral]" }],
        })
      ),
    }),
  };

  const s3Client = {
    send: async () => ({}),
  };

  const dynamoClient = {
    send: async () => ({ Item: null, Items: [] }),
  };

  // ── Middleware stubs ───────────────────────────────────────────────────────
  const requireUserMiddleware = (req, res, next) => next();
  const optionalUserMiddleware = (req, res, next) => next();
  const requireAdminMiddleware = (req, res, next) => next();

  // ── Store stubs ────────────────────────────────────────────────────────────
  const mediaStore = {
    putMediaItem: async () => {},
    deleteMediaItem: async () => {},
    queryMediaItems: async () => [],
    getItem: async () => null,
    queryBySkPrefix: async () => [],
  };

  const storySeedStore = {
    ensurePromptHelperOptions: async () => {},
    ensureStoryCharacters: async () => {},
    ensureStoryPresets: async () => {},
  };

  const companionMemory = {
    SUMMARY_THRESHOLD: 30,
    loadMemory: async () => null,
    saveMessages: async () => {},
    updateSummary: async () => {},
    compactMemory: async () => {},
    clearMemory: async () => {},
    getMemoryStatus: async () => ({ hasMemory: false }),
  };

  const agentMemory = {
    SUMMARY_THRESHOLD: 30,
    loadMemory: async () => null,
    saveMessages: async () => {},
    updateSummary: async () => {},
    compactMemory: async () => {},
    clearMemory: async () => {},
    getMemoryStatus: async () => ({ hasMemory: false }),
  };

  const agentState = {
    load: async () => null,
    patch: async () => {},
    clear: async () => {},
  };

  const agentRateLimit = {
    check: async () => ({ allowed: true, remaining: null, retryAfterMs: 0 }),
  };

  const agentCost = {
    record: async () => {},
    load: async () => null,
    scanAll: async () => ({ items: [], scannedCount: 0, truncated: false }),
    checkDailyCap: async () => ({ allowed: true, remaining: null, retryAfterMs: 0 }),
    checkDailyImageCap: async () => ({ allowed: true, remaining: null, retryAfterMs: 0 }),
    recordImage: async () => {},
  };

  const agentSessions = {
    list: async () => [],
    create: async () => null,
    rename: async () => null,
    touch: async () => {},
    remove: async () => false,
  };

  // ── AI stubs ───────────────────────────────────────────────────────────────
  const aiCraftSceneContext = async () => ({
    positivePrompt: "mock positive",
    negativePrompt: "mock negative",
  });

  const aiCraftIllustrationPrompts = async () => ({
    positivePrompt: "mock positive",
    negativePrompt: "mock negative",
  });

  const aiCraftMusicDirection = async () => ({
    direction: "mock music direction",
  });

  // ── Key utilities (imported from actual module for test accuracy) ──────────
  const {
    buildUserPrefix,
    ensureUserKey,
    buildMediaPk,
    buildMediaSk,
    buildStoryPresetPk,
    buildStoryPresetSk,
    buildStoryCharacterPk,
    buildStoryCharacterSk,
    buildPromptHelperPk,
    buildPromptHelperSk,
    buildStorySessionSk,
    buildStoryMessageSk,
    buildStorySceneSk,
    storyMessagePrefix,
    storyScenePrefix,
    buildCompanionMemorySk,
    buildCompanionMsgSk,
    companionMsgPrefix,
  } = require("../../lib/keys");

  // ── Story-prompt pure utilities ────────────────────────────────────────────
  const {
    safeJsonParse,
    extractJsonStringField,
    normalizePromptFragment,
    splitPromptFragments,
    dedupeFragments,
    buildSceneFragmentsFromStoryState,
    compactScenePayload,
    clipText,
    MAX_REPLICATE_PROMPT_TOKENS,
    clampPromptTokens,
  } = require("../../lib/story-prompt");

  // ── Story-state stubs ──────────────────────────────────────────────────────
  const uniqueStringArray = (arr = []) => [...new Set(arr)];
  const resolveStoryLorebook = () => null;
  const buildInitialStoryState = () => ({
    scene: { locationName: "", description: "", weather: "", timeOfDay: "" },
    characters: [],
  });
  const applyStateDelta = (state) => state;
  const selectStoryEvent = () => null;
  const updateStoryMeta = (meta) => meta;

  // ── Image / replicate / S3 utils stubs ────────────────────────────────────
  const buildSafeBaseName = (name = "") => name.replace(/[^a-z0-9]/gi, "_");
  const buildImageKey = (prefix = "", name = "") => `${prefix}/${name}`;
  const buildImageBatchId = () => `batch-${Date.now()}`;
  const buildSeedList = (count = 1) => Array.from({ length: count }, (_, i) => i);
  const buildVideoReadyKey = (key = "") => `${key}.ready`;
  const toVideoReadyBuffer = () => Buffer.from("ready");
  const fetchImageBuffer = async () => Buffer.alloc(0);
  const isDataUrl = (v = "") => v.startsWith("data:");
  const decodeDataUrl = (v = "") => ({ mimeType: "image/png", data: Buffer.alloc(0) });
  const looksLikeBase64 = () => false;
  const resolveGradioImageBuffer = async () => Buffer.alloc(0);

  const streamToBuffer = async () => Buffer.alloc(0);
  const deleteS3ObjectsByPrefix = async () => {};
  const fetchS3ImageBuffer = async () => Buffer.alloc(0);
  const buildVideoOutputKey = (prefix = "", id = "") => `${prefix}/video/${id}.mp4`;
  const encodeS3Key = (key = "") => encodeURIComponent(key);
  const buildVideoPosterKeyFromVideoKey = (key = "") => key.replace(".mp4", "-poster.jpg");
  const buildVideoPosterKeyFromPrefix = (prefix = "") => `${prefix}/poster.jpg`;
  const buildFolderPosterKeyFromVideoKey = (key = "") => key.replace(".mp4", "-folder.jpg");
  const resolveVideoPosterKey = () => null;
  const copyS3Object = async () => {};

  const delay = async (ms = 0) => new Promise((r) => setTimeout(r, ms));
  const runReplicateWithRetry = async () => ({ urls: { get: "" } });
  const buildReplicatePredictionRequest = () => ({});
  const collectReplicateOutputUrls = async () => [];
  const getReplicateOutputUrls = async () => [];
  const getReplicateOutputUrl = async () => "";

  const getSignedUrl = async () => "https://mock-signed-url.example.com";

  const getGradioSpaceClient = async () => ({
    predict: async () => ({ data: [] }),
  });

  // ── Minimal model configs (avoids env-var reads) ───────────────────────────
  const DEFAULT_NEGATIVE_PROMPT = "low quality";
  const DEFAULT_GRADIO_NEGATIVE_PROMPT = "lowres";
  const imageModelConfig = {};
  const replicateModelConfig = {};
  const civitaiModelConfig = {};
  const gradioSpaceConfig = {};
  const replicateVideoConfig = {};

  const storyCharacters = [];
  const storyPresets = [];
  const promptHelperDefaults = {};
  const buildCharacterPrompt = () => "";

  const base = {
    // Config
    mediaTable: "test-table",
    mediaBucket: "test-bucket",
    promptHelperModelId: "mock-model-id",
    storyModelId: "mock-story-model-id",

    // AWS clients
    bedrockClient,
    s3Client,
    dynamoClient,
    replicateClient: { run: async () => [], predictions: { create: async () => ({}) } },

    // AWS SDK utils
    getSignedUrl,
    Jimp: { read: async () => ({ resize: () => ({}) }) },

    // Commands
    InvokeModelCommand: makeCommandStub("InvokeModelCommand"),
    StartAsyncInvokeCommand: makeCommandStub("StartAsyncInvokeCommand"),
    GetAsyncInvokeCommand: makeCommandStub("GetAsyncInvokeCommand"),
    PutObjectCommand: makeCommandStub("PutObjectCommand"),
    GetObjectCommand: makeCommandStub("GetObjectCommand"),
    HeadObjectCommand: makeCommandStub("HeadObjectCommand"),
    ListObjectsV2Command: makeCommandStub("ListObjectsV2Command"),
    CopyObjectCommand: makeCommandStub("CopyObjectCommand"),
    DeleteObjectCommand: makeCommandStub("DeleteObjectCommand"),
    PutCommand: makeCommandStub("PutCommand"),
    QueryCommand: makeCommandStub("QueryCommand"),
    DeleteCommand: makeCommandStub("DeleteCommand"),
    GetCommand: makeCommandStub("GetCommand"),

    // Model configs
    DEFAULT_NEGATIVE_PROMPT,
    DEFAULT_GRADIO_NEGATIVE_PROMPT,
    imageModelConfig,
    replicateModelConfig,
    civitaiModelConfig,
    gradioSpaceConfig,
    replicateVideoConfig,

    // Story seed
    storyCharacters,
    storyPresets,
    promptHelperDefaults,
    buildCharacterPrompt,

    // Story state
    uniqueStringArray,
    resolveStoryLorebook,
    buildInitialStoryState,
    applyStateDelta,
    selectStoryEvent,
    updateStoryMeta,

    // Story prompt utils
    safeJsonParse,
    extractJsonStringField,
    normalizePromptFragment,
    splitPromptFragments,
    dedupeFragments,
    buildSceneFragmentsFromStoryState,
    compactScenePayload,
    clipText,
    MAX_REPLICATE_PROMPT_TOKENS,
    clampPromptTokens,

    // Middleware
    requireUserMiddleware,
    optionalUserMiddleware,
    requireAdminMiddleware,

    // Key builders
    buildUserPrefix,
    ensureUserKey,
    buildMediaPk,
    buildMediaSk,
    buildStoryPresetPk,
    buildStoryPresetSk,
    buildStoryCharacterPk,
    buildStoryCharacterSk,
    buildPromptHelperPk,
    buildPromptHelperSk,
    buildStorySessionSk,
    buildStoryMessageSk,
    buildStorySceneSk,
    storyMessagePrefix,
    storyScenePrefix,
    buildCompanionMemorySk,
    buildCompanionMsgSk,
    companionMsgPrefix,

    // Stores
    companionMemory,
    agentMemory,
    agentState,
    agentRateLimit,
    agentCost,
    agentSessions,
    putMediaItem: mediaStore.putMediaItem,
    deleteMediaItem: mediaStore.deleteMediaItem,
    queryMediaItems: mediaStore.queryMediaItems,
    getItem: mediaStore.getItem,
    queryBySkPrefix: mediaStore.queryBySkPrefix,
    ensurePromptHelperOptions: storySeedStore.ensurePromptHelperOptions,
    ensureStoryCharacters: storySeedStore.ensureStoryCharacters,
    ensureStoryPresets: storySeedStore.ensureStoryPresets,

    // AI
    aiCraftSceneContext,
    aiCraftIllustrationPrompts,
    aiCraftMusicDirection,
    getGradioSpaceClient,

    // Timing / replicate
    delay,
    runReplicateWithRetry,
    buildReplicatePredictionRequest,
    collectReplicateOutputUrls,
    getReplicateOutputUrls,
    getReplicateOutputUrl,

    // Image utils
    buildSafeBaseName,
    buildImageKey,
    buildImageBatchId,
    buildSeedList,
    buildVideoReadyKey,
    toVideoReadyBuffer,
    fetchImageBuffer,
    isDataUrl,
    decodeDataUrl,
    looksLikeBase64,
    resolveGradioImageBuffer,

    // S3 utils
    streamToBuffer,
    deleteS3ObjectsByPrefix,
    fetchS3ImageBuffer,
    buildVideoOutputKey,
    encodeS3Key,
    buildVideoPosterKeyFromVideoKey,
    buildVideoPosterKeyFromPrefix,
    buildFolderPosterKeyFromVideoKey,
    resolveVideoPosterKey,
    copyS3Object,
  };

  return { ...base, ...overrides };
};

module.exports = { createMockDeps };
