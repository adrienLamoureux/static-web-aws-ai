const test = require("node:test");
const assert = require("node:assert/strict");

const registerLoraRoutes = require("../routes/lora-routes");
const registerReplicateImageRoutes = require("../routes/replicate-image-routes");
const registerReplicateVideoRoutes = require("../routes/replicate-video-routes");
const registerCivitaiImageRoutes = require("../routes/civitai-image-routes");
const registerOperationsRoutes = require("../routes/operations-routes");
const {
  hasLoraInjectionSupport,
} = require("../lib/lora-utils");
const {
  replicateModelConfig,
  civitaiModelConfig,
  replicateVideoConfig,
} = require("../config/models");

const createMockApp = () => {
  const routes = {
    get: new Map(),
    post: new Map(),
    put: new Map(),
  };
  return {
    get(path, handler) {
      routes.get.set(path, handler);
    },
    post(path, handler) {
      routes.post.set(path, handler);
    },
    put(path, handler) {
      routes.put.set(path, handler);
    },
    routes,
  };
};

const createMockRes = () => {
  const output = {
    statusCode: 200,
    payload: null,
  };
  return {
    status(code) {
      output.statusCode = code;
      return this;
    },
    json(payload) {
      output.payload = payload;
      return this;
    },
    output,
  };
};

const withEnv = async (entries, fn) => {
  const previous = new Map();
  Object.keys(entries).forEach((key) => {
    previous.set(key, process.env[key]);
    const value = entries[key];
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  });
  try {
    return await fn();
  } finally {
    Object.keys(entries).forEach((key) => {
      const value = previous.get(key);
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
};

test("hasLoraInjectionSupport handles representative injection shapes", () => {
  assert.equal(hasLoraInjectionSupport({}), false);
  assert.equal(
    hasLoraInjectionSupport({
      loraInjection: {
        scaleFieldNames: ["lora_scale_transformer"],
      },
    }),
    true
  );
  assert.equal(
    hasLoraInjectionSupport({
      loraInjection: {
        weightsField: "lora_weights",
      },
    }),
    true
  );
  assert.equal(
    hasLoraInjectionSupport({
      loraInjection: {
        strengthField: "lora_strength",
      },
    }),
    true
  );
});

test("buildDirectorOptions exposes supportsLora for image/video models", () => {
  const options = registerOperationsRoutes.buildDirectorOptions({
    replicateModelConfig,
    civitaiModelConfig,
    replicateVideoConfig,
  });
  const imageSupport = new Map(
    options.generation.imageModels.map((item) => [item.key, item.supportsLora])
  );
  const civitaiSupport = new Map(
    options.generation.civitaiModels.map((item) => [item.key, item.supportsLora])
  );
  const videoSupport = new Map(
    options.video.models.map((item) => [item.key, item.supportsLora])
  );

  assert.equal(imageSupport.get("animagine"), false);
  assert.equal(civitaiSupport.get("civitai-sd15-anime"), true);
  assert.equal(videoSupport.get("wan-2.2-i2v-fast"), true);
  assert.equal(videoSupport.get("veo-3.1-fast"), false);
});

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
  const app = createMockApp();
  registerLoraRoutes(app, {
    buildMediaPk: () => "USER#1",
    buildMediaSk: () => "LORAPROFILE#demo",
    queryBySkPrefix: async () => [],
    putMediaItem: async () => {},
    getItem: async () => null,
    replicateModelConfig,
    replicateVideoConfig,
  });
  const handler = app.routes.put.get("/lora/profiles/:characterId");
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
