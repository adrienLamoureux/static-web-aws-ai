const {
  DIRECTOR_CONFIG_TYPE,
  DIRECTOR_CONFIG_KEY,
  SOUND_ENERGY_LEVELS,
  normalizeTags,
  normalizeEnergy,
  normalizeMood,
  buildDirectorFallbackConfig,
  normalizeDirectorConfig,
  getDirectorConfigDbKey,
} = require("../lib/director-config");

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
});
const VIDEO_MODEL_LABELS = Object.freeze({
  "wan-2.2-i2v-fast": "Wan 2.2 I2V Fast",
  "veo-3.1-fast": "Veo 3.1 Fast",
  "kling-v2.6": "Kling v2.6",
  "seedance-1.5-pro": "Seedance 1.5 Pro",
});
const APP_CONFIG_PK = "APP#GLOBAL";
const APP_CONFIG_SK = "CFG#PIXNOVEL";
const APP_THEME_OPTIONS = Object.freeze(["blue", "pink", "purple", "yellow"]);
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
    };
  });
  const videoModels = Object.keys(replicateVideoConfig).map((modelKey) => ({
    key: modelKey,
    label: resolveVideoModelLabel(modelKey),
  }));
  return {
    generation: {
      imageModels,
      byModel: generationByModel,
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

const mergeDirectorConfig = (baseConfig = {}, patchConfig = {}) => ({
  generation: {
    ...(baseConfig.generation || {}),
    ...(patchConfig.generation || {}),
  },
  video: {
    ...(baseConfig.video || {}),
    ...(patchConfig.video || {}),
  },
  sound: {
    ...(baseConfig.sound || {}),
    ...(patchConfig.sound || {}),
  },
});

const resolveSessionId = (item = {}) => {
  if (item.sessionId) return item.sessionId;
  if (typeof item.sk === "string" && /^SESSION#[^#]+$/.test(item.sk)) {
    return item.sk.slice("SESSION#".length);
  }
  return "";
};

const resolveTrackId = (item = {}) => {
  if (item.trackId) return String(item.trackId);
  if (typeof item.sk === "string" && item.sk.startsWith("MUSICLIB#")) {
    return item.sk.slice("MUSICLIB#".length);
  }
  return "";
};

module.exports = (app, deps) => {
  const {
    mediaTable,
    queryMediaItems,
    queryBySkPrefix,
    getItem,
    putMediaItem,
    buildMediaPk,
    buildMediaSk,
    buildStorySessionSk,
    replicateModelConfig,
    replicateVideoConfig,
    DEFAULT_NEGATIVE_PROMPT,
    s3Client,
    getSignedUrl,
    PutObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    DeleteObjectCommand,
    buildSafeBaseName,
    dynamoClient,
    PutCommand,
  } = deps;

  const directorFallbackConfig = buildDirectorFallbackConfig({
    replicateModelConfig,
    replicateVideoConfig,
    defaultNegativePrompt: DEFAULT_NEGATIVE_PROMPT,
  });
  const directorOptions = buildDirectorOptions({
    replicateModelConfig,
    replicateVideoConfig,
  });

  const readDirectorConfig = async (userId) => {
    const dbKey = getDirectorConfigDbKey({
      buildMediaPk,
      buildMediaSk,
      userId,
    });
    const item = await getItem(dbKey);
    const config = normalizeDirectorConfig({
      input: item?.config || item?.defaults || {},
      fallbackConfig: directorFallbackConfig,
      replicateModelConfig,
      replicateVideoConfig,
    });
    return { item, config };
  };

  const writeDirectorConfig = async (userId, patchConfig = {}) => {
    const { item, config: currentConfig } = await readDirectorConfig(userId);
    const mergedConfig = mergeDirectorConfig(currentConfig, patchConfig);
    const normalizedConfig = normalizeDirectorConfig({
      input: mergedConfig,
      fallbackConfig: directorFallbackConfig,
      replicateModelConfig,
      replicateVideoConfig,
    });
    const nowIso = new Date().toISOString();
    const existingItem = item || {};
    const existingExtra = { ...existingItem };
    delete existingExtra.pk;
    delete existingExtra.sk;
    delete existingExtra.type;
    delete existingExtra.key;
    await putMediaItem({
      userId,
      type: DIRECTOR_CONFIG_TYPE,
      key: DIRECTOR_CONFIG_KEY,
      extra: {
        ...existingExtra,
        config: normalizedConfig,
        createdAt: existingItem.createdAt || nowIso,
        updatedAt: nowIso,
      },
    });
    return normalizedConfig;
  };

  const readAppConfig = async () => {
    if (!mediaTable) {
      return {
        item: null,
        config: {
          theme: DEFAULT_APP_THEME,
        },
      };
    }
    const item = await getItem({
      pk: APP_CONFIG_PK,
      sk: APP_CONFIG_SK,
    });
    return {
      item,
      config: {
        theme: normalizeAppTheme(item?.theme, DEFAULT_APP_THEME),
      },
    };
  };

  const writeAppConfig = async (patchConfig = {}) => {
    const { item, config: currentConfig } = await readAppConfig();
    const nextConfig = {
      theme: normalizeAppTheme(patchConfig.theme, currentConfig.theme),
    };
    if (!mediaTable) {
      return nextConfig;
    }

    const nowIso = new Date().toISOString();
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: {
          ...(item || {}),
          pk: APP_CONFIG_PK,
          sk: APP_CONFIG_SK,
          type: "CFG",
          key: "app/config",
          theme: nextConfig.theme,
          createdAt: item?.createdAt || nowIso,
          updatedAt: nowIso,
        },
      })
    );
    return nextConfig;
  };

  const listGlobalMasonryImages = async ({ limit = MAX_GLOBAL_MASONRY_IMAGES } = {}) => {
    const mediaBucket = process.env.MEDIA_BUCKET;
    if (!mediaBucket || !s3Client) {
      return [];
    }

    const maxKeys = Math.max(1, Math.min(1000, Number(limit) || MAX_GLOBAL_MASONRY_IMAGES));
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: mediaBucket,
        Prefix: GLOBAL_MASONRY_PREFIX,
        MaxKeys: maxKeys,
      })
    );
    const objects = (response.Contents || [])
      .filter((item) => isMasonryImageKey(item.Key))
      .sort((left, right) => toMs(right.LastModified) - toMs(left.LastModified))
      .slice(0, maxKeys);

    return Promise.all(
      objects.map(async (item) => {
        const key = item.Key;
        const url = await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: mediaBucket,
            Key: key,
          }),
          { expiresIn: GLOBAL_MASONRY_URL_EXPIRATION_SECONDS }
        );
        return {
          key,
          url,
          updatedAt: item.LastModified ? new Date(item.LastModified).toISOString() : "",
          sizeBytes: Number(item.Size || 0),
        };
      })
    );
  };

  const buildDirectorOverview = async ({ userId, requestStartedAt }) => {
    const [
      jobItems,
      imageItems,
      videoItems,
      rawSessionItems,
      rawMusicTracks,
      directorConfigData,
      appConfigData,
      masonryImages,
    ] =
      await Promise.all([
        queryMediaItems({ userId, type: "JOB" }),
        queryMediaItems({ userId, type: "IMG" }),
        queryMediaItems({ userId, type: "VID" }),
        queryBySkPrefix({
          pk: buildMediaPk(userId),
          skPrefix: "SESSION#",
          limit: MAX_STORY_SESSIONS,
          scanForward: false,
        }),
        queryBySkPrefix({
          pk: buildMediaPk(userId),
          skPrefix: "MUSICLIB#",
          limit: MAX_MUSIC_TRACKS,
          scanForward: false,
        }),
        readDirectorConfig(userId),
        readAppConfig(),
        listGlobalMasonryImages(),
      ]);

    const dashboardData = buildDashboardData({
      jobItems,
      imageItems,
      videoItems,
      requestStartedAt,
    });
    const normalizedJobs = dashboardData.normalizedJobs;
    const imageJobs = normalizedJobs.filter((item) => item.entityType === "image");
    const videoJobs = normalizedJobs.filter((item) => item.entityType === "video");
    const imageStatus = countStatuses(imageJobs);
    const videoStatus = countStatuses(videoJobs);

    const sessions = (rawSessionItems || [])
      .filter((item) => /^SESSION#[^#]+$/.test(String(item.sk || "")))
      .map((item) => {
        const sessionId = resolveSessionId(item);
        return {
          sessionId,
          title: item.title || "Untitled session",
          presetId: item.presetId || "",
          turnCount: Number(item.turnCount || 0),
          sceneCount: Number(item.sceneCount || 0),
          directorPinned: Boolean(item.directorPinned),
          updatedAt: item.updatedAt || item.createdAt || "",
          createdAt: item.createdAt || "",
        };
      })
      .sort(sortByNewest);

    const musicTracks = (rawMusicTracks || [])
      .map((item) => {
        const trackId = resolveTrackId(item);
        const title = String(item.title || "").trim() || "Untitled track";
        const mood = normalizeMood(item.mood || "", "");
        const energy = normalizeEnergy(item.energy || "", "");
        const tags = normalizeTags(item.tags);
        const hasMissingMetadata = !mood || !energy || !tags.length;
        return {
          trackId,
          title,
          mood,
          energy,
          tags,
          hasMissingMetadata,
          updatedAt: item.updatedAt || item.createdAt || "",
          createdAt: item.createdAt || "",
        };
      })
      .sort(sortByNewest);

    const missingSoundTracks = musicTracks
      .filter((track) => track.hasMissingMetadata)
      .slice(0, MAX_SOUND_AUDIT_TRACKS);

    return {
      generatedAt: new Date().toISOString(),
      queue: dashboardData.queue,
      summary: dashboardData.summary,
      signalCards: dashboardData.signalCards,
      config: directorConfigData.config,
      appConfig: appConfigData.config,
      options: directorOptions,
      modules: {
        generation: {
          summary: {
            total: imageJobs.length,
            ...imageStatus,
          },
          defaults: directorConfigData.config.generation,
          activeJobs: imageJobs
            .filter((item) => item.status === "queued" || item.status === "running")
            .slice(0, MAX_ACTIVE_JOBS),
          failedJobs: imageJobs
            .filter((item) => item.status === "failed")
            .slice(0, MAX_FAILED_JOBS),
        },
        video: {
          summary: {
            total: videoJobs.length,
            libraryCount: (videoItems || []).length,
            ...videoStatus,
          },
          defaults: directorConfigData.config.video,
          activeJobs: videoJobs
            .filter((item) => item.status === "queued" || item.status === "running")
            .slice(0, MAX_ACTIVE_JOBS),
          failedJobs: videoJobs
            .filter((item) => item.status === "failed")
            .slice(0, MAX_FAILED_JOBS),
        },
        story: {
          summary: {
            totalSessions: sessions.length,
            pinnedSessions: sessions.filter((item) => item.directorPinned).length,
          },
          sessions,
        },
        sound: {
          summary: {
            totalTracks: musicTracks.length,
            tracksMissingMetadata: musicTracks.filter((item) => item.hasMissingMetadata)
              .length,
          },
          defaults: directorConfigData.config.sound,
          missingTracks: missingSoundTracks,
        },
        experience: {
          summary: {
            masonryImages: masonryImages.length,
          },
          masonryImages,
        },
      },
    };
  };

  app.get("/ops/dashboard", async (req, res) => {
    const requestStartedAt = Date.now();
    const userId = req.user?.sub;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const [jobItems, imageItems, videoItems] = await Promise.all([
        queryMediaItems({ userId, type: "JOB" }),
        queryMediaItems({ userId, type: "IMG" }),
        queryMediaItems({ userId, type: "VID" }),
      ]);
      const dashboardData = buildDashboardData({
        jobItems,
        imageItems,
        videoItems,
        requestStartedAt,
      });
      return res.json({
        generatedAt: new Date().toISOString(),
        queue: dashboardData.queue,
        summary: dashboardData.summary,
        signalCards: dashboardData.signalCards,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load operational dashboard",
        error: error?.message || String(error),
      });
    }
  });

  app.get("/ops/director/config", async (req, res) => {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const [{ config }, appConfigData] = await Promise.all([
        readDirectorConfig(userId),
        readAppConfig(),
      ]);
      return res.json({
        generatedAt: new Date().toISOString(),
        config,
        appConfig: appConfigData.config,
        options: directorOptions,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load director config",
        error: error?.message || String(error),
      });
    }
  });

  app.post("/ops/director/config", async (req, res) => {
    const userId = req.user?.sub;
    const inputPatch = req.body?.config || req.body || {};
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const config = await writeDirectorConfig(userId, inputPatch);
      return res.json({
        savedAt: new Date().toISOString(),
        config,
        options: directorOptions,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to save director config",
        error: error?.message || String(error),
      });
    }
  });

  app.get("/ops/director/app-config", async (req, res) => {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const appConfigData = await readAppConfig();
      return res.json({
        generatedAt: new Date().toISOString(),
        appConfig: appConfigData.config,
        options: {
          themes: directorOptions.app?.themes || [],
        },
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load app config",
        error: error?.message || String(error),
      });
    }
  });

  app.post("/ops/director/app-config", async (req, res) => {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const appConfig = await writeAppConfig(req.body || {});
      return res.json({
        savedAt: new Date().toISOString(),
        appConfig,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to save app config",
        error: error?.message || String(error),
      });
    }
  });

  app.get("/ops/director/masonry/images", async (req, res) => {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const images = await listGlobalMasonryImages();
      return res.json({
        generatedAt: new Date().toISOString(),
        prefix: GLOBAL_MASONRY_PREFIX,
        images,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load masonry images",
        error: error?.message || String(error),
      });
    }
  });

  app.post("/ops/director/masonry/upload-url", async (req, res) => {
    const userId = req.user?.sub;
    const mediaBucket = process.env.MEDIA_BUCKET;
    const fileName = String(req.body?.fileName || "masonry-image").trim();
    const contentType = String(req.body?.contentType || "image/jpeg").trim();
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!mediaBucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }
    if (!contentType.startsWith("image/")) {
      return res.status(400).json({ message: "Only image uploads are allowed." });
    }

    const safeBase = buildSafeBaseName(fileName || "masonry-image");
    const extension =
      contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : contentType.includes("gif")
            ? "gif"
            : "jpg";
    const key = `${GLOBAL_MASONRY_PREFIX}${safeBase}-${Date.now()}.${extension}`;

    try {
      const command = new PutObjectCommand({
        Bucket: mediaBucket,
        Key: key,
        ContentType: contentType,
      });
      const url = await getSignedUrl(s3Client, command, {
        expiresIn: GLOBAL_MASONRY_URL_EXPIRATION_SECONDS,
      });
      return res.json({
        bucket: mediaBucket,
        key,
        url,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to create masonry upload URL",
        error: error?.message || String(error),
      });
    }
  });

  app.post("/ops/director/masonry/images/delete", async (req, res) => {
    const userId = req.user?.sub;
    const mediaBucket = process.env.MEDIA_BUCKET;
    const key = String(req.body?.key || "").trim();
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!mediaBucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }
    if (!isMasonryImageKey(key)) {
      return res.status(400).json({ message: "Invalid masonry key." });
    }
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: mediaBucket,
          Key: key,
        })
      );
      return res.json({
        deletedAt: new Date().toISOString(),
        key,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to delete masonry image",
        error: error?.message || String(error),
      });
    }
  });

  app.get("/ops/director/overview", async (req, res) => {
    const userId = req.user?.sub;
    const requestStartedAt = Date.now();
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const payload = await buildDirectorOverview({ userId, requestStartedAt });
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load director overview",
        error: error?.message || String(error),
      });
    }
  });

  app.post("/ops/director/jobs/prioritize", async (req, res) => {
    const userId = req.user?.sub;
    const jobKey = String(req.body?.jobKey || "").trim();
    const priorityRaw = String(req.body?.priority || DEFAULT_JOB_PRIORITY)
      .trim()
      .toLowerCase();
    const priority = ALLOWED_JOB_PRIORITIES.has(priorityRaw)
      ? priorityRaw
      : DEFAULT_JOB_PRIORITY;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!jobKey) {
      return res.status(400).json({ message: "jobKey is required" });
    }

    try {
      const existingItem = await getItem({
        pk: buildMediaPk(userId),
        sk: buildMediaSk("JOB", jobKey),
      });
      if (!existingItem) {
        return res.status(404).json({ message: "Job not found" });
      }
      const nowIso = new Date().toISOString();
      const existingExtra = { ...existingItem };
      delete existingExtra.pk;
      delete existingExtra.sk;
      delete existingExtra.type;
      delete existingExtra.key;
      await putMediaItem({
        userId,
        type: "JOB",
        key: jobKey,
        extra: {
          ...existingExtra,
          priority,
          priorityRank: 0,
          directorPriority: true,
          createdAt: existingItem.createdAt || nowIso,
          updatedAt: nowIso,
        },
      });
      return res.json({
        updatedAt: nowIso,
        job: {
          jobKey,
          priority,
        },
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to prioritize job",
        error: error?.message || String(error),
      });
    }
  });

  app.post("/ops/director/story/sessions/pin", async (req, res) => {
    const userId = req.user?.sub;
    const sessionId = String(req.body?.sessionId || "").trim();
    const pinned = Boolean(req.body?.pinned);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }
    if (!mediaTable) {
      return res.status(500).json({ message: "MEDIA_TABLE is not set" });
    }

    try {
      const key = {
        pk: buildMediaPk(userId),
        sk: buildStorySessionSk(sessionId),
      };
      const existingItem = await getItem(key);
      if (!existingItem) {
        return res.status(404).json({ message: "Story session not found" });
      }
      const nowIso = new Date().toISOString();
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: {
            ...existingItem,
            directorPinned: pinned,
            updatedAt: nowIso,
          },
        })
      );
      return res.json({
        updatedAt: nowIso,
        session: {
          sessionId,
          pinned,
        },
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to update story session",
        error: error?.message || String(error),
      });
    }
  });

  app.post("/ops/director/sound/normalize", async (req, res) => {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!mediaTable) {
      return res.status(500).json({ message: "MEDIA_TABLE is not set" });
    }

    try {
      const patchSoundDefaults = req.body?.soundDefaults
        ? { sound: req.body.soundDefaults }
        : {};
      const config = Object.keys(patchSoundDefaults).length
        ? await writeDirectorConfig(userId, patchSoundDefaults)
        : (await readDirectorConfig(userId)).config;

      const tracks = await queryBySkPrefix({
        pk: buildMediaPk(userId),
        skPrefix: "MUSICLIB#",
        limit: MAX_MUSIC_TRACKS,
        scanForward: false,
      });
      const nowIso = new Date().toISOString();
      const updatePayloads = (tracks || []).reduce((accumulator, item) => {
        const existingMood = normalizeMood(item.mood || "", "");
        const existingEnergy = normalizeEnergy(item.energy || "", "");
        const existingTags = normalizeTags(item.tags);
        const nextMood = existingMood || config.sound.defaultMood;
        const nextEnergy = existingEnergy || config.sound.defaultEnergy;
        const nextTags = existingTags.length ? existingTags : config.sound.defaultTags;
        const changed =
          nextMood !== existingMood ||
          nextEnergy !== existingEnergy ||
          JSON.stringify(nextTags) !== JSON.stringify(existingTags);
        if (!changed) return accumulator;
        accumulator.push({
          ...item,
          mood: nextMood,
          energy: nextEnergy,
          tags: nextTags,
          directorNormalizedAt: nowIso,
          updatedAt: nowIso,
        });
        return accumulator;
      }, []);

      await Promise.all(
        updatePayloads.map((item) =>
          dynamoClient.send(
            new PutCommand({
              TableName: mediaTable,
              Item: item,
            })
          )
        )
      );

      return res.json({
        normalizedAt: nowIso,
        inspectedCount: (tracks || []).length,
        normalizedCount: updatePayloads.length,
        defaultsApplied: config.sound,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to normalize sound metadata",
        error: error?.message || String(error),
      });
    }
  });
};
