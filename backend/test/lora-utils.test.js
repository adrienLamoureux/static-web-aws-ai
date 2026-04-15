const test = require("node:test");
const assert = require("node:assert/strict");

const registerLoraCatalogRoutes = require("../routes/lora/catalog-routes");
const registerOperationsRoutes = require("../routes/operations-routes");
const { createCivitaiClient } = require("../lib/civitai-client");
const { hasLoraInjectionSupport } = require("../lib/lora-utils");
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
} = registerLoraCatalogRoutes;

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
    extractCivitaiStatusCodeFromError('CivitAI request failed (400): {"error":"invalid"}'),
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
  assert.deepEqual(normalizeModelIdList(["372057", " 372057 ", "abc", "", "415616"]), [
    "372057",
    "415616",
  ]);
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
      modelUrl: "https://civitai.com/models/372057/frieren-frieren-beyond-journeys-end-xl-lora",
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
  assert.equal(response.metadata?.fallbackSearch?.strategy, "broad-query-post-filter-base-model");
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
  const videoSupport = new Map(options.video.models.map((item) => [item.key, item.supportsLora]));

  assert.equal(imageSupport.get("animagine"), false);
  assert.equal(civitaiSupport.get("civitai-sd15-anime"), true);
  assert.equal(videoSupport.get("wan-2.2-i2v-fast"), true);
  assert.equal(videoSupport.get("veo-3.1-fast"), false);
});
