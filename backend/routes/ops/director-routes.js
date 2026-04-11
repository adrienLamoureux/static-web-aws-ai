const { Router } = require("express");
const {
  DIRECTOR_CONFIG_TYPE,
  DIRECTOR_CONFIG_KEY,
  buildDirectorFallbackConfig,
  normalizeDirectorConfig,
  getDirectorConfigDbKey,
  normalizeTags,
  normalizeEnergy,
  normalizeMood,
} = require("../../lib/director-config");
const {
  APP_CONFIG_PK,
  APP_CONFIG_SK,
  DEFAULT_APP_THEME,
  MAX_STORY_SESSIONS,
  MAX_MUSIC_TRACKS,
  MAX_SOUND_AUDIT_TRACKS,
  MAX_ACTIVE_JOBS,
  MAX_FAILED_JOBS,
  normalizeStatus,
  normalizeAppTheme,
  sortByNewest,
  cloneStatusCountsTemplate,
  buildDashboardData,
  buildDirectorOptions,
} = require("./ops-helpers");

module.exports = function registerDirectorRoutes(deps) {
  const {
    mediaTable,
    queryMediaItems,
    queryBySkPrefix,
    getItem,
    putMediaItem,
    buildMediaPk,
    buildMediaSk,
    replicateModelConfig,
    civitaiModelConfig,
    replicateVideoConfig,
    DEFAULT_NEGATIVE_PROMPT,
    dynamoClient,
    PutCommand,
    // listGlobalMasonryImages is injected by operations-routes from dashboard-routes
    listGlobalMasonryImages,
  } = deps;

  const { requireUserMiddleware, requireAdminMiddleware } = deps;
  const adminGuard = [requireUserMiddleware, requireAdminMiddleware];

  const directorFallbackConfig = buildDirectorFallbackConfig({
    replicateModelConfig,
    replicateVideoConfig,
    defaultNegativePrompt: DEFAULT_NEGATIVE_PROMPT,
  });
  const directorOptions = buildDirectorOptions({
    replicateModelConfig,
    civitaiModelConfig,
    replicateVideoConfig,
  });

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

  const countStatuses = (items = []) =>
    items.reduce((accumulator, item) => {
      const status = normalizeStatus(item.status);
      if (status in accumulator) {
        accumulator[status] += 1;
      }
      return accumulator;
    }, cloneStatusCountsTemplate());

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
      return { item: null, config: { theme: DEFAULT_APP_THEME } };
    }
    const item = await getItem({ pk: APP_CONFIG_PK, sk: APP_CONFIG_SK });
    return {
      item,
      config: { theme: normalizeAppTheme(item?.theme, DEFAULT_APP_THEME) },
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
    ] = await Promise.all([
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
      listGlobalMasonryImages ? listGlobalMasonryImages() : Promise.resolve([]),
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
      .map((item) => ({
        sessionId: resolveSessionId(item),
        title: item.title || "Untitled session",
        presetId: item.presetId || "",
        turnCount: Number(item.turnCount || 0),
        sceneCount: Number(item.sceneCount || 0),
        directorPinned: Boolean(item.directorPinned),
        updatedAt: item.updatedAt || item.createdAt || "",
        createdAt: item.createdAt || "",
      }))
      .sort(sortByNewest);

    const musicTracks = (rawMusicTracks || [])
      .map((item) => {
        const mood = normalizeMood(item.mood || "", "");
        const energy = normalizeEnergy(item.energy || "", "");
        const tags = normalizeTags(item.tags);
        const hasMissingMetadata = !mood || !energy || !tags.length;
        return {
          trackId: resolveTrackId(item),
          title: String(item.title || "").trim() || "Untitled track",
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
          summary: { total: imageJobs.length, ...imageStatus },
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
            tracksMissingMetadata: musicTracks.filter((item) => item.hasMissingMetadata).length,
          },
          defaults: directorConfigData.config.sound,
          missingTracks: missingSoundTracks,
        },
        experience: {
          summary: { masonryImages: masonryImages.length },
          masonryImages,
        },
      },
    };
  };

  const router = Router();

  router.get("/director/config", ...adminGuard, async (req, res) => {
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

  router.post("/director/config", ...adminGuard, async (req, res) => {
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

  router.get("/director/app-config", ...adminGuard, async (req, res) => {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const appConfigData = await readAppConfig();
      return res.json({
        generatedAt: new Date().toISOString(),
        appConfig: appConfigData.config,
        options: { themes: directorOptions.app?.themes || [] },
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load app config",
        error: error?.message || String(error),
      });
    }
  });

  router.post("/director/app-config", ...adminGuard, async (req, res) => {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const appConfig = await writeAppConfig(req.body || {});
      return res.json({ savedAt: new Date().toISOString(), appConfig });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to save app config",
        error: error?.message || String(error),
      });
    }
  });

  router.get("/director/overview", ...adminGuard, async (req, res) => {
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

  router.post("/director/sound/normalize", ...adminGuard, async (req, res) => {
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
          dynamoClient.send(new PutCommand({ TableName: mediaTable, Item: item }))
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

  return router;
};
