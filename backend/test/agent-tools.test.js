"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  generateImageToolSpec,
  ALL_TOOL_SPECS,
  STYLE_TO_MODEL_KEY,
  ASPECT_TO_SIZE,
  dispatchTool,
} = require("../lib/agent-tools");

const { createMockDeps } = require("./helpers/mock-deps");

// ── Tool spec shape ────────────────────────────────────────────────────────

test("generateImageToolSpec exposes Bedrock Converse format", () => {
  assert.equal(generateImageToolSpec.toolSpec.name, "generate_image");
  assert.ok(generateImageToolSpec.toolSpec.description);
  const schema = generateImageToolSpec.toolSpec.inputSchema?.json;
  assert.ok(schema);
  assert.deepEqual(schema.required, ["prompt"]);
  assert.deepEqual(schema.properties.style.enum, ["anime", "photoreal", "manga", "chibi"]);
  assert.deepEqual(schema.properties.aspect.enum, ["1:1", "3:4", "16:9"]);
});

test("ALL_TOOL_SPECS includes the v1.2 tool fleet", () => {
  const names = ALL_TOOL_SPECS.map((t) => t.toolSpec.name).sort();
  assert.deepEqual(names, [
    "browse_gallery",
    "continue_story",
    "generate_image",
    "generate_music",
    "illustrate_scene",
    "recall_favorites",
    "set_theme",
  ]);
});

test("STYLE_TO_MODEL_KEY covers every supported style", () => {
  for (const style of ["anime", "photoreal", "manga", "chibi"]) {
    assert.ok(STYLE_TO_MODEL_KEY[style], `missing model for style ${style}`);
  }
});

test("ASPECT_TO_SIZE covers every supported aspect", () => {
  for (const aspect of ["1:1", "3:4", "16:9"]) {
    assert.ok(ASPECT_TO_SIZE[aspect], `missing size for aspect ${aspect}`);
  }
});

// ── Dispatcher — guard rails ───────────────────────────────────────────────

test("dispatchTool returns unknown_tool for unsupported names", async () => {
  const deps = createMockDeps();
  const r = await dispatchTool({ name: "summon_dragon", args: {}, deps, userId: "u1" });
  assert.equal(r.ok, false);
  assert.match(r.error, /^unknown_tool/);
});

test("generate_image rejects when userId missing", async () => {
  const deps = createMockDeps();
  const r = await dispatchTool({
    name: "generate_image",
    args: { prompt: "x" },
    deps,
    userId: null,
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, "unauthorized");
});

test("generate_image rejects when REPLICATE_API_TOKEN missing", async () => {
  const prev = process.env.REPLICATE_API_TOKEN;
  delete process.env.REPLICATE_API_TOKEN;
  try {
    const deps = createMockDeps();
    const r = await dispatchTool({
      name: "generate_image",
      args: { prompt: "cat" },
      deps,
      userId: "u1",
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, "replicate_token_missing");
  } finally {
    if (prev !== undefined) process.env.REPLICATE_API_TOKEN = prev;
  }
});

test("generate_image rejects empty prompt", async () => {
  process.env.REPLICATE_API_TOKEN = "test-token";
  const deps = createMockDeps();
  const r = await dispatchTool({
    name: "generate_image",
    args: { prompt: "   " },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, "prompt_required");
});

test("generate_image returns model_resolve error when replicateModelConfig missing entry", async () => {
  process.env.REPLICATE_API_TOKEN = "test-token";
  const deps = createMockDeps({ replicateModelConfig: {} });
  const r = await dispatchTool({
    name: "generate_image",
    args: { prompt: "cat", style: "anime" },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /not configured/);
});

// ── Dispatcher — happy paths ───────────────────────────────────────────────

const buildReplicateModelConfig = () => ({
  "wai-nsfw-illustrious-v11": {
    modelId: "test/model:abc",
    sizes: [
      { width: 1024, height: 1024 },
      { width: 768, height: 1024 },
      { width: 1280, height: 720 },
    ],
    schedulers: ["Euler a"],
    buildInput: ({ prompt, width, height, seed }) => ({ prompt, width, height, seed }),
  },
  animagine: {
    modelId: "test/animagine:xyz",
    sizes: [{ width: 1024, height: 1024 }],
    schedulers: ["Euler a"],
    buildInput: ({ prompt, width, height }) => ({ prompt, width, height }),
  },
});

test("generate_image starts a Replicate prediction and returns a job descriptor", async () => {
  process.env.REPLICATE_API_TOKEN = "test-token";
  const created = [];
  const deps = createMockDeps({
    replicateModelConfig: buildReplicateModelConfig(),
    replicateClient: {
      run: async () => [],
      predictions: {
        create: async (req) => {
          created.push(req);
          return { id: "pred-123", status: "starting" };
        },
      },
    },
    buildReplicatePredictionRequest: ({ modelId, input }) => ({ model: modelId, input }),
    buildImageBatchId: () => "batch-test",
  });

  const r = await dispatchTool({
    name: "generate_image",
    args: { prompt: "a cat in a space suit", style: "anime", aspect: "3:4" },
    deps,
    userId: "u1",
  });

  assert.equal(r.ok, true);
  assert.equal(r.result.predictionId, "pred-123");
  assert.equal(r.result.batchId, "batch-test");
  assert.equal(r.result.width, 768);
  assert.equal(r.result.height, 1024);
  assert.equal(r.result.aspect, "3:4");
  assert.equal(r.result.style, "anime");
  assert.equal(r.result.modelKey, "wai-nsfw-illustrious-v11");
  assert.ok(typeof r.result.seed === "number");
  assert.ok(r.result.imageName);
  assert.equal(created.length, 1);
});

test("generate_image fast-path: returns imageUrl when prediction succeeds in wait window", async () => {
  process.env.REPLICATE_API_TOKEN = "test-token";
  process.env.MEDIA_BUCKET = "test-bucket";
  const putItems = [];
  const deps = createMockDeps({
    replicateModelConfig: buildReplicateModelConfig(),
    replicateClient: {
      run: async () => [],
      predictions: {
        create: async () => ({
          id: "pred-fast",
          status: "succeeded",
          output: ["https://replicate.delivery/abc.png"],
        }),
      },
    },
    buildReplicatePredictionRequest: ({ modelId, input }) => ({ model: modelId, input }),
    buildImageBatchId: () => "batch-fast",
    getReplicateOutputUrls: (out) => (Array.isArray(out) ? out : []),
    fetchImageBuffer: async () => ({ buffer: Buffer.from("png"), contentType: "image/png" }),
    buildImageKey: ({ baseName, batchId }) => `users/u1/${batchId}/${baseName}-0.png`,
    putMediaItem: async (item) => {
      putItems.push(item);
    },
    getSignedUrl: async () => "https://signed.example.com/abc.png",
  });

  const r = await dispatchTool({
    name: "generate_image",
    args: { prompt: "fast path", style: "anime", aspect: "1:1" },
    deps,
    userId: "u1",
  });

  assert.equal(r.ok, true);
  assert.equal(r.result.status, "succeeded");
  assert.equal(r.result.imageUrl, "https://signed.example.com/abc.png");
  // Should have written both an IMG row and a JOB row
  const types = putItems.map((i) => i.type).sort();
  assert.deepEqual(types, ["IMG", "JOB"]);
});

test("generate_image preserves seed when passed via args", async () => {
  process.env.REPLICATE_API_TOKEN = "test-token";
  const deps = createMockDeps({
    replicateModelConfig: buildReplicateModelConfig(),
    replicateClient: {
      run: async () => [],
      predictions: {
        create: async () => ({ id: "pred-seed", status: "starting" }),
      },
    },
    buildReplicatePredictionRequest: ({ modelId, input }) => ({ model: modelId, input }),
  });
  const r = await dispatchTool({
    name: "generate_image",
    args: { prompt: "x", seed: 12345, style: "anime", aspect: "3:4" },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, true);
  assert.equal(r.result.seed, 12345);
});

test("generate_image gracefully maps Replicate failure to replicate_create_failed", async () => {
  process.env.REPLICATE_API_TOKEN = "test-token";
  const deps = createMockDeps({
    replicateModelConfig: buildReplicateModelConfig(),
    replicateClient: {
      predictions: {
        create: async () => {
          throw new Error("network down");
        },
      },
    },
    buildReplicatePredictionRequest: () => ({}),
  });
  const r = await dispatchTool({
    name: "generate_image",
    args: { prompt: "x", style: "anime", aspect: "3:4" },
    deps,
    userId: "u1",
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /network down|replicate_create_failed/);
});
