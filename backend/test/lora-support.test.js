const test = require("node:test");
const assert = require("node:assert/strict");

const registerLoraRoutes = require("../routes/lora-routes");
const registerReplicateImageRoutes = require("../routes/replicate-image-routes");
const registerReplicateVideoRoutes = require("../routes/replicate-video-routes");
const registerCivitaiImageRoutes = require("../routes/civitai-image-routes");
const registerOperationsRoutes = require("../routes/operations-routes");
const { createCivitaiClient } = require("../lib/civitai-client");
const {
  hasLoraInjectionSupport,
} = require("../lib/lora-utils");
const {
  replicateModelConfig,
  civitaiModelConfig,
  replicateVideoConfig,
} = require("../config/models");

const {
  extractCivitaiStatusCodeFromError,
  collectCatalogBaseModels,
  withBaseModelHint,
  normalizeModelIdList,
  extractModelIdFromCivitaiUrl,
  resolveRequestedModelIds,
} = registerLoraRoutes;

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

test("extractCivitaiStatusCodeFromError parses client errors", () => {
  assert.equal(
    extractCivitaiStatusCodeFromError(
      "CivitAI request failed (400): {\"error\":\"invalid\"}"
    ),
    400
  );
  assert.equal(extractCivitaiStatusCodeFromError("random error"), null);
  assert.equal(extractCivitaiStatusCodeFromError(""), null);
});

test("withBaseModelHint appends suggestions when filtered sync returns no results", () => {
  const metadata = withBaseModelHint({
    metadata: { nextCursor: "cursor-1" },
    requestedBaseModel: "SDXL 1.0",
    hintItems: [
      { baseModel: "Illustrious" },
      { baseModel: "Illustrious" },
      { baseModel: "SD 1.5" },
      { baseModel: "" },
    ],
  });
  assert.deepEqual(metadata, {
    nextCursor: "cursor-1",
    baseModelHint: {
      requestedBaseModel: "SDXL 1.0",
      suggestedBaseModels: ["Illustrious", "SD 1.5"],
    },
  });
});

test("collectCatalogBaseModels keeps insertion order and deduplicates case-insensitively", () => {
  assert.deepEqual(
    collectCatalogBaseModels([
      { baseModel: "Illustrious" },
      { baseModel: "illustrIous" },
      { baseModel: "SD 1.5" },
      { baseModel: "  " },
    ]),
    ["Illustrious", "SD 1.5"]
  );
});

test("normalizeModelIdList keeps numeric IDs and removes invalid values", () => {
  assert.deepEqual(
    normalizeModelIdList(["372057", " 372057 ", "abc", "", "415616"]),
    ["372057", "415616"]
  );
  assert.deepEqual(normalizeModelIdList("372057"), ["372057"]);
  assert.deepEqual(normalizeModelIdList(""), []);
});

test("extractModelIdFromCivitaiUrl extracts /models/:id pattern", () => {
  assert.equal(
    extractModelIdFromCivitaiUrl(
      "https://civitai.com/models/372057/frieren-frieren-beyond-journeys-end-xl-lora"
    ),
    "372057"
  );
  assert.equal(extractModelIdFromCivitaiUrl("https://civitai.com/models"), "");
});

test("resolveRequestedModelIds supports ids/modelIds/modelUrl aliases", () => {
  assert.deepEqual(
    resolveRequestedModelIds({
      modelIds: ["372057", "372057"],
      ids: "415616",
      modelId: "999999",
      modelUrl:
        "https://civitai.com/models/372057/frieren-frieren-beyond-journeys-end-xl-lora",
      query: "https://civitai.com/models/111111/demo",
    }),
    ["372057", "415616", "999999", "111111"]
  );
});

test("resolveRequestedModelIds accepts query with plain numeric ID", () => {
  assert.deepEqual(
    resolveRequestedModelIds({
      query: "372057",
    }),
    ["372057"]
  );
});

test("searchLoras omits query/sort/period when ids filter is provided", async () => {
  let requestedUrl = "";
  const civitaiClient = createCivitaiClient({
    apiToken: "",
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return {
        ok: true,
        json: async () => ({ items: [], metadata: {} }),
      };
    },
  });

  await civitaiClient.searchLoras({
    query: "frieren",
    sort: "Highest Rated",
    period: "Month",
    baseModel: "SDXL 1.0",
    modelIds: ["372057"],
    nsfw: false,
  });

  const parsedUrl = new URL(requestedUrl);
  assert.equal(parsedUrl.searchParams.get("ids"), "372057");
  assert.equal(parsedUrl.searchParams.get("baseModels"), "SDXL 1.0");
  assert.equal(parsedUrl.searchParams.get("query"), null);
  assert.equal(parsedUrl.searchParams.get("sort"), null);
  assert.equal(parsedUrl.searchParams.get("period"), null);
});

test("searchLoras falls back to broad query scan when baseModel filter returns zero", async () => {
  const requestedUrls = [];
  const modelPayload = {
    id: 372057,
    name: "Frieren (Frieren: Beyond Journey's End) XL LORA",
    creator: { username: "demo" },
    tags: ["frieren"],
    nsfw: false,
    stats: {},
    modelVersions: [
      {
        id: 415616,
        name: "v1.0",
        baseModel: "SDXL 1.0",
        trainedWords: ["Frieren"],
        files: [{ downloadUrl: "https://example.com/frieren.safetensors" }],
        images: [{ url: "https://example.com/frieren.png" }],
      },
    ],
  };

  const civitaiClient = createCivitaiClient({
    apiToken: "",
    fetchImpl: async (url) => {
      const normalizedUrl = String(url);
      requestedUrls.push(normalizedUrl);
      const parsed = new URL(normalizedUrl);
      const ids = parsed.searchParams.getAll("ids");
      const hasBaseModels = Boolean(parsed.searchParams.get("baseModels"));

      if (ids.length > 0) {
        return {
          ok: true,
          json: async () => ({ items: [], metadata: {} }),
        };
      }

      if (hasBaseModels) {
        return {
          ok: true,
          json: async () => ({ items: [], metadata: {} }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          items: [modelPayload],
          metadata: {},
        }),
      };
    },
  });

  const response = await civitaiClient.searchLoras({
    query: "frieren",
    baseModel: "SDXL 1.0",
    limit: 20,
    nsfw: false,
  });

  assert.equal(response.items.length, 1);
  assert.equal(response.items[0]?.modelId, "372057");
  assert.equal(response.items[0]?.baseModel, "SDXL 1.0");
  assert.equal(
    response.metadata?.fallbackSearch?.strategy,
    "broad-query-post-filter-base-model"
  );
  assert.ok(requestedUrls.length >= 2);
  assert.ok(requestedUrls.some((url) => url.includes("baseModels=SDXL+1.0")));
  assert.ok(requestedUrls.some((url) => url.includes("query=frieren")));
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
