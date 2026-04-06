const { hasConfiguredLoraSupport } = require("../../lib/lora-utils");
const { SOUND_ENERGY_LEVELS } = require("../../lib/director-config");

const MAX_QUEUE_ITEMS = 6;
const MAX_ACTIVE_JOBS = 8;
const MAX_FAILED_JOBS = 6;
const MAX_STORY_SESSIONS = 30;
const MAX_MUSIC_TRACKS = 300;
const MAX_SOUND_AUDIT_TRACKS = 20;
const DEFAULT_JOB_PRIORITY = "high";
const ALLOWED_JOB_PRIORITIES = new Set(["high", "normal"]);
const STATUS_COUNTS_TEMPLATE = Object.freeze({
  queued: 0,
  running: 0,
  completed: 0,
  failed: 0,
});
const STATUS_META = Object.freeze({
  queued: { label: "Queued", tone: "warn", progress: 10 },
  running: { label: "Running", tone: "warn", progress: 55 },
  completed: { label: "Completed", tone: "good", progress: 100 },
  failed: { label: "Failed", tone: "bad", progress: 100 },
});
const IMAGE_MODEL_LABELS = Object.freeze({
  animagine: "Animagine XL v4 Opt",
  "wai-nsfw-illustrious-v11": "WAI NSFW Illustrious v11",
  "seedream-4.5": "Seedream 4.5",
  "wai-nsfw-illustrious-v12": "WAI NSFW Illustrious v12",
  "anillustrious-v4": "Anillustrious v4",
  "civitai-sd15-anime": "CivitAI SD 1.5 Anime",
  "civitai-pony-sdxl": "CivitAI Pony SDXL",
});
const VIDEO_MODEL_LABELS = Object.freeze({
  "wan-2.2-i2v-fast": "Wan 2.2 I2V Fast",
  "veo-3.1-fast": "Veo 3.1 Fast",
  "kling-v2.6": "Kling v2.6",
  "seedance-1.5-pro": "Seedance 1.5 Pro",
});
const APP_CONFIG_PK = "APP#GLOBAL";
const APP_CONFIG_SK = "CFG#PIXNOVEL";
const APP_THEME_OPTIONS = Object.freeze(["pink", "purple", "yellow"]);
const DEFAULT_APP_THEME = APP_THEME_OPTIONS[0];
const GLOBAL_MASONRY_PREFIX = "app/masonry/";
const MAX_GLOBAL_MASONRY_IMAGES = 60;
const GLOBAL_MASONRY_URL_EXPIRATION_SECONDS = 900;

const cloneStatusCountsTemplate = () => ({ ...STATUS_COUNTS_TEMPLATE });

const clampPercent = (value) => {
  if (!Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.min(100, Math.round(Number(value))));
};

const toMs = (value) => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (status = "") => {
  const normalized = String(status).toLowerCase();
  if (
    normalized === "starting" ||
    normalized === "processing" ||
    normalized === "in_progress" ||
    normalized === "running"
  ) {
    return "running";
  }
  if (normalized === "queued" || normalized === "pending") {
    return "queued";
  }
  if (
    normalized === "succeeded" ||
    normalized === "completed" ||
    normalized === "done"
  ) {
    return "completed";
  }
  if (
    normalized === "failed" ||
    normalized === "error" ||
    normalized === "cancelled" ||
    normalized === "canceled"
  ) {
    return "failed";
  }
  return "queued";
};

const inferProviderFromKey = (key = "") => {
  if (key.includes("/replicate/")) return "replicate";
  if (key.includes("/bedrock/")) return "bedrock";
  if (key.includes("/gradio/")) return "gradio";
  if (key.includes("/uploads/")) return "upload";
  return "engine";
};

const prettyKeyName = (key = "", fallback = "Render") => {
  const raw = key.split("/").pop() || "";
  const clean = raw.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim();
  return clean || fallback;
};

const formatEtaLabel = (etaSeconds) => {
  if (!Number.isFinite(Number(etaSeconds))) return "ETA: n/a";
  const seconds = Math.max(0, Math.round(Number(etaSeconds)));
  if (seconds < 60) return `ETA: ${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `ETA: ${minutes}m`;
};

const sortByNewest = (left, right) => {
  const leftTime = toMs(left.updatedAt || left.createdAt || left.startedAt);
  const rightTime = toMs(right.updatedAt || right.createdAt || right.startedAt);
  return rightTime - leftTime;
};

const toTitleCaseFromKey = (value = "") =>
  String(value || "")
    .split(/[-_]+/)
    .map((part) => {
      if (!part) return "";
      return `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");

const resolveImageModelLabel = (key = "") =>
  IMAGE_MODEL_LABELS[key] || toTitleCaseFromKey(key);

const resolveVideoModelLabel = (key = "") =>
  VIDEO_MODEL_LABELS[key] || toTitleCaseFromKey(key);

const resolveThemeLabel = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized
    ? `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}`
    : "";
};

const normalizeAppTheme = (value = "", fallback = DEFAULT_APP_THEME) => {
  const normalized = String(value || "").trim().toLowerCase();
  return APP_THEME_OPTIONS.includes(normalized) ? normalized : fallback;
};

const isMasonryImageKey = (key = "") =>
  String(key || "").startsWith(GLOBAL_MASONRY_PREFIX) &&
  /\.(png|jpe?g|webp|gif|avif)$/i.test(String(key || ""));

const mapJobItem = (item = {}) => {
  const status = normalizeStatus(item.status);
  const statusMeta = STATUS_META[status];
  const progressPct = clampPercent(item.progressPct) ?? statusMeta.progress;
  const entityType =
    item.entityType === "video" || item.entityType === "image"
      ? item.entityType
      : "image";
  const provider = item.provider || inferProviderFromKey(item.inputKey || item.key || "");
  const title =
    item.title ||
    item.imageName ||
    prettyKeyName(
      item.inputKey || item.outputKey || item.key || "",
      entityType === "video" ? "Video render" : "Image render"
    );
  const detail = [provider ? provider.toUpperCase() : null, entityType === "video" ? "Video" : "Image"]
    .filter(Boolean)
    .join(" • ");

  return {
    id: item.key || item.predictionId || `${provider}-${title}`,
    jobKey: item.key || "",
    title,
    detail,
    status,
    statusLabel: statusMeta.label,
    tone: statusMeta.tone,
    progressPct,
    etaSeconds:
      Number.isFinite(Number(item.etaSeconds)) && Number(item.etaSeconds) >= 0
        ? Number(item.etaSeconds)
        : null,
    etaLabel: formatEtaLabel(item.etaSeconds),
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || item.createdAt || "",
    predictionId: item.predictionId || "",
    provider,
    entityType,
    priority: String(item.priority || "normal"),
    priorityRank: Number.isFinite(Number(item.priorityRank))
      ? Number(item.priorityRank)
      : null,
    errorMessage: item.errorMessage || "",
  };
};

const buildFallbackQueue = ({ imageItems = [], videoItems = [] }) =>
  []
    .concat(
      (videoItems || []).map((item) => ({
        id: item.key,
        jobKey: "",
        title: prettyKeyName(item.key, "Video output"),
        detail: `${inferProviderFromKey(item.key).toUpperCase()} • Video`,
        status: "completed",
        statusLabel: STATUS_META.completed.label,
        tone: STATUS_META.completed.tone,
        progressPct: 100,
        etaSeconds: 0,
        etaLabel: "ETA: done",
        createdAt: item.createdAt || "",
        updatedAt: item.createdAt || "",
        predictionId: "",
        provider: inferProviderFromKey(item.key),
        entityType: "video",
        priority: "normal",
        priorityRank: null,
        errorMessage: "",
      }))
    )
    .concat(
      (imageItems || []).map((item) => ({
        id: item.key,
        jobKey: "",
        title: prettyKeyName(item.key, "Image output"),
        detail: `${inferProviderFromKey(item.key).toUpperCase()} • Image`,
        status: "completed",
        statusLabel: STATUS_META.completed.label,
        tone: STATUS_META.completed.tone,
        progressPct: 100,
        etaSeconds: 0,
        etaLabel: "ETA: done",
        createdAt: item.createdAt || "",
        updatedAt: item.createdAt || "",
        predictionId: "",
        provider: inferProviderFromKey(item.key),
        entityType: "image",
        priority: "normal",
        priorityRank: null,
        errorMessage: "",
      }))
    )
    .sort(sortByNewest);

const countStatuses = (items = []) =>
  items.reduce((accumulator, item) => {
    const status = normalizeStatus(item.status);
    if (status in accumulator) {
      accumulator[status] += 1;
    }
    return accumulator;
  }, cloneStatusCountsTemplate());

const buildDashboardData = ({
  jobItems = [],
  imageItems = [],
  videoItems = [],
  requestStartedAt = Date.now(),
}) => {
  const normalizedJobs = (jobItems || []).map(mapJobItem).sort(sortByNewest);
  const fallbackQueue = buildFallbackQueue({ imageItems, videoItems });
  const queue = (normalizedJobs.length ? normalizedJobs : fallbackQueue).slice(
    0,
    MAX_QUEUE_ITEMS
  );
  const statusCounts = countStatuses(normalizedJobs);
  const queueDepth = statusCounts.queued + statusCounts.running;

  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const recentTerminalJobs = normalizedJobs.filter((item) => {
    const isRecent = toMs(item.updatedAt || item.createdAt) >= oneHourAgo;
    const isTerminal = item.status === "completed" || item.status === "failed";
    return isRecent && isTerminal;
  });
  const recentFailedJobs = recentTerminalJobs.filter(
    (item) => item.status === "failed"
  ).length;
  const errorRatePct =
    recentTerminalJobs.length > 0
      ? Math.round((recentFailedJobs / recentTerminalJobs.length) * 100)
      : 0;

  const completedDurations = (jobItems || [])
    .map((item) => {
      const started = toMs(item.startedAt);
      const completed = toMs(item.completedAt);
      if (!started || !completed || completed < started) return null;
      return Math.round((completed - started) / 1000);
    })
    .filter((value) => Number.isFinite(value));
  const averageRenderSeconds = completedDurations.length
    ? Math.round(
        completedDurations.reduce((sum, value) => sum + value, 0) /
          completedDurations.length
      )
    : null;

  const apiLatencyMs = Date.now() - requestStartedAt;
  const signalCards = [
    {
      key: "api-status",
      label: "API status",
      value: "Online",
      hint: `Latency ${apiLatencyMs}ms`,
      tone: apiLatencyMs > 600 ? "warn" : "good",
    },
    {
      key: "queue-depth",
      label: "Queue depth",
      value: `${queueDepth}`,
      hint: `${statusCounts.running} running • ${statusCounts.queued} queued`,
      tone: queueDepth > 4 ? "warn" : "good",
    },
    {
      key: "failed-hour",
      label: "Failed jobs (1h)",
      value: `${recentFailedJobs}`,
      hint: `Error rate ${errorRatePct}%`,
      tone: recentFailedJobs > 0 ? "bad" : "good",
    },
    {
      key: "avg-render",
      label: "Avg render",
      value:
        averageRenderSeconds === null ? "n/a" : `${averageRenderSeconds}s`,
      hint:
        averageRenderSeconds === null
          ? "No completed jobs yet"
          : "Based on completed jobs",
      tone: "good",
    },
  ];

  return {
    queue,
    summary: {
      queueDepth,
      ...statusCounts,
      recentFailedJobs,
      errorRatePct,
      averageRenderSeconds,
    },
    signalCards,
    normalizedJobs,
  };
};

const buildDirectorOptions = ({
  replicateModelConfig = {},
  civitaiModelConfig = {},
  replicateVideoConfig = {},
}) => {
  const generationByModel = {};
  const imageModels = Object.keys(replicateModelConfig).map((modelKey) => {
    const modelConfig = replicateModelConfig[modelKey] || {};
    const schedulers = Array.isArray(modelConfig.schedulers)
      ? modelConfig.schedulers
      : [];
    const sizes = Array.isArray(modelConfig.sizes)
      ? modelConfig.sizes.map((size) => ({
          width: Number(size.width),
          height: Number(size.height),
          label: `${Number(size.width)}x${Number(size.height)}`,
        }))
      : [];
    generationByModel[modelKey] = {
      schedulers,
      sizes,
    };
    return {
      key: modelKey,
      label: resolveImageModelLabel(modelKey),
      provider: "replicate",
      supportsLora: hasConfiguredLoraSupport(modelConfig),
      estimatedUnitCostUsd: null,
    };
  });
  const civitaiModels = Object.keys(civitaiModelConfig).map((modelKey) => {
    const modelConfig = civitaiModelConfig[modelKey] || {};
    const sizes = Array.isArray(modelConfig.sizes)
      ? modelConfig.sizes.map((size) => ({
          width: Number(size.width),
          height: Number(size.height),
          label: `${Number(size.width)}x${Number(size.height)}`,
        }))
      : [];
    generationByModel[modelKey] = {
      schedulers: [],
      sizes,
    };
    return {
      key: modelKey,
      label: resolveImageModelLabel(modelKey),
      provider: "civitai",
      supportsLora: hasConfiguredLoraSupport(modelConfig),
      estimatedUnitCostUsd: Number.isFinite(
        Number(modelConfig.estimatedUnitCostUsd)
      )
        ? Number(modelConfig.estimatedUnitCostUsd)
        : null,
    };
  });
  const videoModels = Object.keys(replicateVideoConfig).map((modelKey) => {
    const modelConfig = replicateVideoConfig[modelKey] || {};
    return {
      key: modelKey,
      label: resolveVideoModelLabel(modelKey),
      provider: "replicate",
      supportsLora: hasConfiguredLoraSupport(modelConfig),
    };
  });
  return {
    generation: {
      imageModels,
      civitaiModels,
      byModel: generationByModel,
      providers: [
        {
          key: "replicate",
          label: "Replicate",
          supportsLora: imageModels.some((item) => item.supportsLora),
          enabled: true,
        },
        {
          key: "civitai",
          label: "CivitAI",
          supportsLora: civitaiModels.some((item) => item.supportsLora),
          enabled: true,
        },
      ],
    },
    video: {
      models: videoModels,
    },
    sound: {
      energyLevels: Array.from(SOUND_ENERGY_LEVELS),
    },
    app: {
      themes: APP_THEME_OPTIONS.map((theme) => ({
        key: theme,
        label: resolveThemeLabel(theme),
      })),
    },
  };
};

module.exports = {
  MAX_QUEUE_ITEMS,
  MAX_ACTIVE_JOBS,
  MAX_FAILED_JOBS,
  MAX_STORY_SESSIONS,
  MAX_MUSIC_TRACKS,
  MAX_SOUND_AUDIT_TRACKS,
  DEFAULT_JOB_PRIORITY,
  ALLOWED_JOB_PRIORITIES,
  STATUS_COUNTS_TEMPLATE,
  STATUS_META,
  IMAGE_MODEL_LABELS,
  VIDEO_MODEL_LABELS,
  APP_CONFIG_PK,
  APP_CONFIG_SK,
  APP_THEME_OPTIONS,
  DEFAULT_APP_THEME,
  GLOBAL_MASONRY_PREFIX,
  MAX_GLOBAL_MASONRY_IMAGES,
  GLOBAL_MASONRY_URL_EXPIRATION_SECONDS,
  cloneStatusCountsTemplate,
  clampPercent,
  toMs,
  normalizeStatus,
  inferProviderFromKey,
  prettyKeyName,
  formatEtaLabel,
  sortByNewest,
  toTitleCaseFromKey,
  resolveImageModelLabel,
  resolveVideoModelLabel,
  resolveThemeLabel,
  normalizeAppTheme,
  isMasonryImageKey,
  mapJobItem,
  buildFallbackQueue,
  countStatuses,
  buildDashboardData,
  buildDirectorOptions,
};
