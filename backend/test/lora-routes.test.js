const test = require("node:test");
const assert = require("node:assert/strict");

const registerLoraProfileRoutes = require("../routes/lora/profile-routes");
const registerReplicateImageRoutes = require("../routes/replicate-image-routes");
const registerReplicateVideoRoutes = require("../routes/replicate-video-routes");
const registerCivitaiImageRoutes = require("../routes/civitai-image-routes");
const { replicateModelConfig, replicateVideoConfig } = require("../config/models");

const { createMockApp, createMockRes, withEnv, getRouterHandler } = require("./helpers/test-utils");

test("POST /civitai/image/generate rejects unsupported model when characterId is set", async () => {
  const app = createMockApp();
  registerCivitaiImageRoutes(app, {
    civitaiModelConfig: {
      "civitai-no-lora": {
        modelId: "urn:air:sd1:checkpoint:civitai:1@1",
        baseModel: "SD_1_5",
        supportsLora: false,
        sizes: [{ width: 1024, height: 1024 }],
        buildInput: ({ prompt, width, height }) => ({
          prompt,
          width,
          height,
        }),
      },
    },
    buildImageBatchId: () => "batch-1",
    clampPromptTokens: (value) => String(value || ""),
    MAX_REPLICATE_PROMPT_TOKENS: 77,
    fetchImageBuffer: async () => ({
      buffer: Buffer.from(""),
      contentType: "image/png",
    }),
    buildImageKey: () => "users/user-1/images/test.png",
    s3Client: { send: async () => {} },
    PutObjectCommand: function PutObjectCommand() {},
    putMediaItem: async () => {},
    getSignedUrl: async () => "https://example.com/test.png",
    GetObjectCommand: function GetObjectCommand() {},
    getItem: async () => null,
    buildMediaPk: () => "USER#user-1",
    buildMediaSk: () => "LORAPROFILE#frieren",
  });
  const handler = app.routes.post.get("/civitai/image/generate");
  assert.equal(typeof handler, "function");

  await withEnv(
    {
      MEDIA_BUCKET: "bucket",
      CIVITAI_API_TOKEN: "token",
    },
    async () => {
      const req = {
        user: { sub: "user-1" },
        body: {
          model: "civitai-no-lora",
          imageName: "test",
          prompt: "anime portrait",
          width: 1024,
          height: 1024,
          characterId: "frieren",
        },
      };
      const res = createMockRes();
      await handler(req, res);

      assert.equal(res.output.statusCode, 400);
      assert.equal(res.output.payload?.code, "LORA_UNSUPPORTED_MODEL");
      assert.equal(res.output.payload?.modality, "image");
      assert.equal(res.output.payload?.modelKey, "civitai-no-lora");
    }
  );
});

test("PUT /lora/profiles/:characterId rejects unsupported profile model key", async () => {
  const router = registerLoraProfileRoutes({
    buildMediaPk: () => "USER#1",
    buildMediaSk: () => "LORAPROFILE#demo",
    queryBySkPrefix: async () => [],
    putMediaItem: async () => {},
    deleteMediaItem: async () => {},
    getItem: async () => null,
    requireUserMiddleware: (req, res, next) => next(),
    replicateModelConfig,
    replicateVideoConfig,
  });
  const handler = getRouterHandler(router, "put", "/lora/profiles/:characterId");
  assert.equal(typeof handler, "function");

  const req = {
    user: { sub: "user-1" },
    params: { characterId: "frieren" },
    body: {
      image: {
        modelKey: "animagine",
      },
      video: {
        modelKey: "wan-2.2-i2v-fast",
      },
    },
  };
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.output.statusCode, 400);
  assert.equal(res.output.payload?.code, "LORA_UNSUPPORTED_MODEL");
  assert.equal(res.output.payload?.modality, "image");
  assert.equal(res.output.payload?.modelKey, "animagine");
});

test("POST /replicate/image/generate rejects unsupported model when characterId is set", async () => {
  const app = createMockApp();
  registerReplicateImageRoutes(app, {
    replicateModelConfig,
    replicateVideoConfig,
    replicateClient: {},
    buildSeedList: () => [42],
    buildImageBatchId: () => "batch-1",
    clampPromptTokens: (value) => String(value || ""),
    MAX_REPLICATE_PROMPT_TOKENS: 77,
    getReplicateOutputUrls: () => [],
    fetchImageBuffer: async () => ({ buffer: Buffer.from(""), contentType: "image/png" }),
    buildImageKey: () => "users/user-1/images/test.png",
    s3Client: { send: async () => {} },
    PutObjectCommand: function PutObjectCommand() {},
    putMediaItem: async () => {},
    getSignedUrl: async () => "https://example.com/test.png",
    GetObjectCommand: function GetObjectCommand() {},
    delay: async () => {},
    runReplicateWithRetry: async () => [],
    getReplicateOutputUrl: () => "",
    buildReplicatePredictionRequest: () => ({}),
    DEFAULT_NEGATIVE_PROMPT: "",
    getItem: async () => null,
    buildMediaPk: () => "USER#user-1",
    buildMediaSk: () => "LORAPROFILE#frieren",
  });
  const handler = app.routes.post.get("/replicate/image/generate");
  assert.equal(typeof handler, "function");

  await withEnv(
    {
      MEDIA_BUCKET: "bucket",
      REPLICATE_API_TOKEN: "token",
    },
    async () => {
      const req = {
        user: { sub: "user-1" },
        body: {
          model: "animagine",
          imageName: "test",
          prompt: "anime portrait",
          width: 1024,
          height: 1024,
          characterId: "frieren",
        },
      };
      const res = createMockRes();
      await handler(req, res);

      assert.equal(res.output.statusCode, 400);
      assert.equal(res.output.payload?.code, "LORA_UNSUPPORTED_MODEL");
      assert.equal(res.output.payload?.modality, "image");
      assert.equal(res.output.payload?.modelKey, "animagine");
      assert.deepEqual(res.output.payload?.supportedModels, []);
    }
  );
});

test("POST /replicate/video/generate rejects unsupported model when characterId is set", async () => {
  const app = createMockApp();
  registerReplicateVideoRoutes(app, {
    ensureUserKey: () => {},
    replicateModelConfig,
    replicateVideoConfig,
    fetchS3ImageBuffer: async () => ({ buffer: Buffer.from(""), contentType: "image/png" }),
    fetchImageBuffer: async () => ({ buffer: Buffer.from(""), contentType: "image/png" }),
    replicateClient: {},
    getReplicateOutputUrl: () => "",
    buildVideoOutputKey: () => "users/user-1/videos/out.mp4",
    s3Client: { send: async () => {} },
    PutObjectCommand: function PutObjectCommand() {},
    buildVideoPosterKeyFromVideoKey: () => "",
    copyS3Object: async () => {},
    putMediaItem: async () => {},
    getSignedUrl: async () => "https://example.com/out.mp4",
    GetObjectCommand: function GetObjectCommand() {},
    buildReplicatePredictionRequest: () => ({}),
    getItem: async () => null,
    buildMediaPk: () => "USER#user-1",
    buildMediaSk: () => "LORAPROFILE#frieren",
  });
  const handler = app.routes.post.get("/replicate/video/generate");
  assert.equal(typeof handler, "function");

  await withEnv(
    {
      MEDIA_BUCKET: "bucket",
      REPLICATE_API_TOKEN: "token",
    },
    async () => {
      const req = {
        user: { sub: "user-1" },
        body: {
          model: "veo-3.1-fast",
          inputKey: "users/user-1/images/source.png",
          imageUrl: "https://example.com/source.png",
          prompt: "camera pan",
          characterId: "frieren",
        },
      };
      const res = createMockRes();
      await handler(req, res);

      assert.equal(res.output.statusCode, 400);
      assert.equal(res.output.payload?.code, "LORA_UNSUPPORTED_MODEL");
      assert.equal(res.output.payload?.modality, "video");
      assert.equal(res.output.payload?.modelKey, "veo-3.1-fast");
      assert.deepEqual(res.output.payload?.supportedModels, ["wan-2.2-i2v-fast"]);
    }
  );
});
