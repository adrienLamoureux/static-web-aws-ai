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
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const Replicate = require("replicate");
const Jimp = require("jimp");

const {
  DEFAULT_NEGATIVE_PROMPT,
  DEFAULT_GRADIO_NEGATIVE_PROMPT,
  imageModelConfig,
  replicateModelConfig,
  gradioSpaceConfig,
  replicateVideoConfig,
} = require("../config/models");
const {
  storyCharacters,
  storyPresets,
  promptHelperDefaults,
  buildCharacterPrompt,
} = require("../config/story-seed-data");
const {
  uniqueStringArray,
  resolveStoryLorebook,
  buildInitialStoryState,
  applyStateDelta,
  selectStoryEvent,
  updateStoryMeta,
} = require("./story-state");
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
} = require("./story-prompt");

const { requireUserMiddleware } = require("./auth");
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
} = require("./keys");
const { createMediaStore } = require("./media-store");
const { createStorySeedStore } = require("./story-seed-store");
const { getGradioSpaceClient } = require("./gradio-client");
const {
  delay,
  runReplicateWithRetry,
  buildReplicatePredictionRequest,
  collectReplicateOutputUrls,
  getReplicateOutputUrls,
  getReplicateOutputUrl,
} = require("./replicate-utils");
const {
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
} = require("./image-utils");
const {
  streamToBuffer,
  deleteS3ObjectsByPrefix,
  fetchS3ImageBuffer,
  buildVideoOutputKey,
  encodeS3Key,
  buildVideoPosterKeyFromVideoKey,
  buildVideoPosterKeyFromPrefix,
  buildFolderPosterKeyFromVideoKey,
  resolveVideoPosterKey,
  copyS3Object: copyS3ObjectRaw,
} = require("./s3-utils");
const {
  createAiCraftSceneContext,
  createAiCraftIllustrationPrompts,
  createAiCraftMusicDirection,
} = require("./scene-context");

const createDeps = () => {
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

  const mediaStore = createMediaStore({
    dynamoClient,
    mediaTable,
  });
  const storySeedStore = createStorySeedStore({
    dynamoClient,
    mediaTable,
    queryBySkPrefix: mediaStore.queryBySkPrefix,
  });

  const aiCraftSceneContext = createAiCraftSceneContext({
    bedrockClient,
    promptHelperModelId,
    uniqueStringArray,
    safeJsonParse,
    normalizePromptFragment,
    compactScenePayload,
    clipText,
  });

  const aiCraftIllustrationPrompts = createAiCraftIllustrationPrompts({
    bedrockClient,
    promptHelperModelId,
    safeJsonParse,
    normalizePromptFragment,
    clipText,
  });

  const aiCraftMusicDirection = createAiCraftMusicDirection({
    bedrockClient,
    promptHelperModelId,
    safeJsonParse,
    normalizePromptFragment,
    clipText,
  });

  const runReplicateWithRetryBound = async (...args) =>
    runReplicateWithRetry(replicateClient, ...args);

  const deleteS3ObjectsByPrefixBound = async (bucket, prefix) =>
    deleteS3ObjectsByPrefix(s3Client, bucket, prefix);

  const fetchS3ImageBufferBound = async (bucket, key) =>
    fetchS3ImageBuffer(s3Client, bucket, key);

  const copyS3Object = async ({ bucket, sourceKey, destinationKey }) =>
    copyS3ObjectRaw({ s3Client, bucket, sourceKey, destinationKey });

  return {
    mediaTable,
    promptHelperModelId,
    storyModelId,
    bedrockClient,
    s3Client,
    replicateClient,
    dynamoClient,
    getSignedUrl,
    Jimp,
    InvokeModelCommand,
    StartAsyncInvokeCommand,
    GetAsyncInvokeCommand,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    CopyObjectCommand,
    DeleteObjectCommand,
    PutCommand,
    QueryCommand,
    DeleteCommand,
    DEFAULT_NEGATIVE_PROMPT,
    DEFAULT_GRADIO_NEGATIVE_PROMPT,
    imageModelConfig,
    replicateModelConfig,
    gradioSpaceConfig,
    replicateVideoConfig,
    storyCharacters,
    storyPresets,
    promptHelperDefaults,
    buildCharacterPrompt,
    uniqueStringArray,
    resolveStoryLorebook,
    buildInitialStoryState,
    applyStateDelta,
    selectStoryEvent,
    updateStoryMeta,
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
    requireUserMiddleware,
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
    putMediaItem: mediaStore.putMediaItem,
    deleteMediaItem: mediaStore.deleteMediaItem,
    queryMediaItems: mediaStore.queryMediaItems,
    getItem: mediaStore.getItem,
    queryBySkPrefix: mediaStore.queryBySkPrefix,
    ensurePromptHelperOptions: storySeedStore.ensurePromptHelperOptions,
    ensureStoryCharacters: storySeedStore.ensureStoryCharacters,
    ensureStoryPresets: storySeedStore.ensureStoryPresets,
    getGradioSpaceClient,
    aiCraftSceneContext,
    aiCraftIllustrationPrompts,
    aiCraftMusicDirection,
    delay,
    runReplicateWithRetry: runReplicateWithRetryBound,
    buildReplicatePredictionRequest,
    collectReplicateOutputUrls,
    getReplicateOutputUrls,
    getReplicateOutputUrl,
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
    streamToBuffer,
    deleteS3ObjectsByPrefix: deleteS3ObjectsByPrefixBound,
    fetchS3ImageBuffer: fetchS3ImageBufferBound,
    buildVideoOutputKey,
    encodeS3Key,
    buildVideoPosterKeyFromVideoKey,
    buildVideoPosterKeyFromPrefix,
    buildFolderPosterKeyFromVideoKey,
    resolveVideoPosterKey,
    copyS3Object,
  };
};

module.exports = {
  createDeps,
};
