import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchDirectorOverview,
  listDirectorMasonryImages,
  normalizeDirectorSoundMetadata,
  requestDirectorMasonryUploadUrl,
  pinDirectorStorySession,
  prioritizeDirectorJob,
  saveDirectorAppConfig,
  saveDirectorConfig,
  deleteDirectorMasonryImage,
} from "../services/operations";
import { putFileToUrl } from "../services/s3";
import {
  buildInitialDrafts,
  buildSizeKey,
  DIRECTOR_DEFAULT_THEME,
  DIRECTOR_OBSERVER_BOTTOM_MARGIN_PCT,
  DIRECTOR_OBSERVER_THRESHOLD,
  DIRECTOR_OBSERVER_TOP_MARGIN_PCT,
  DIRECTOR_SECTION_DEFS,
  DIRECTOR_SECTION_META,
  DIRECTOR_TABS_ACTIVE_OFFSET_PX,
  DIRECTOR_THEME_OPTIONS,
  EMPTY_SUMMARY,
  formatSizeLabel,
  formatTimestamp,
  normalizeDirectorTheme,
  normalizeTagsForInput,
  parseSizeKey,
  splitTags,
} from "./director/directorConfig";
import "./director.css";

function Director({
  apiBaseUrl = "",
  opsSnapshot = null,
  opsLoading = false,
  opsError = "",
  currentTheme = DIRECTOR_DEFAULT_THEME,
  onThemeChange,
}) {
  const [overview, setOverview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [activeActionKey, setActiveActionKey] = useState("");
  const [drafts, setDrafts] = useState(buildInitialDrafts);
  const [masonryImages, setMasonryImages] = useState([]);
  const [isUploadingMasonry, setIsUploadingMasonry] = useState(false);
  const [activeSectionKey, setActiveSectionKey] = useState(
    DIRECTOR_SECTION_DEFS[0].key
  );

  const hasHydratedDraftsRef = useRef(false);
  const masonryFileInputRef = useRef(null);

  const hydrateDrafts = useCallback((payload) => {
    const config = payload?.config || {};
    const options = payload?.options || {};

    const generationOptions = options.generation || {};
    const imageModels = Array.isArray(generationOptions.imageModels)
      ? generationOptions.imageModels
      : [];
    const generationByModel = generationOptions.byModel || {};
    const configuredModel = config?.generation?.imageModel || imageModels[0]?.key || "";
    const modelOptions = generationByModel[configuredModel] || {};
    const schedulers = Array.isArray(modelOptions.schedulers) ? modelOptions.schedulers : [];
    const sizes = Array.isArray(modelOptions.sizes) ? modelOptions.sizes : [];
    const configuredScheduler =
      config?.generation?.imageScheduler && schedulers.includes(config.generation.imageScheduler)
        ? config.generation.imageScheduler
        : schedulers[0] || "";
    const configuredSizeKey = buildSizeKey(
      config?.generation?.imageWidth,
      config?.generation?.imageHeight
    );
    const sizeExists = sizes.some(
      (size) => buildSizeKey(size.width, size.height) === configuredSizeKey
    );
    const imageSizeKey =
      (sizeExists && configuredSizeKey) ||
      (sizes[0] ? buildSizeKey(sizes[0].width, sizes[0].height) : "");

    const videoModels = Array.isArray(options?.video?.models) ? options.video.models : [];
    const videoModel =
      config?.video?.videoModel || videoModels[0]?.key || "";

    setDrafts({
      generation: {
        imageModel: configuredModel,
        imageScheduler: configuredScheduler,
        imageSizeKey,
        negativePrompt: config?.generation?.negativePrompt || "",
      },
      video: {
        videoModel,
        generateAudio:
          typeof config?.video?.generateAudio === "boolean"
            ? config.video.generateAudio
            : true,
      },
      sound: {
        defaultMood: config?.sound?.defaultMood || "",
        defaultEnergy: config?.sound?.defaultEnergy || "medium",
        defaultTags: normalizeTagsForInput(config?.sound?.defaultTags),
      },
      app: {
        theme: normalizeDirectorTheme(
          config?.app?.theme || payload?.appConfig?.theme || currentTheme,
          DIRECTOR_DEFAULT_THEME
        ),
      },
    });
  }, [currentTheme]);

  const loadOverview = useCallback(
    async ({ preserveDrafts = true } = {}) => {
      if (!apiBaseUrl) return;
      setIsLoading(true);
      setLoadError("");
      try {
        const payload = await fetchDirectorOverview(apiBaseUrl);
        setOverview(payload);
        const nextTheme = normalizeDirectorTheme(payload?.appConfig?.theme, "");
        if (nextTheme) {
          onThemeChange?.(nextTheme, { persist: true });
        }
        const nextMasonryImages = Array.isArray(payload?.modules?.experience?.masonryImages)
          ? payload.modules.experience.masonryImages
          : [];
        setMasonryImages(nextMasonryImages);
        if (!preserveDrafts || !hasHydratedDraftsRef.current) {
          hydrateDrafts(payload);
          hasHydratedDraftsRef.current = true;
        }
      } catch (error) {
        setLoadError(error?.message || "Failed to load director data.");
      } finally {
        setIsLoading(false);
      }
    },
    [apiBaseUrl, hydrateDrafts, onThemeChange]
  );

  useEffect(() => {
    hasHydratedDraftsRef.current = false;
    setOverview(null);
    setDrafts(buildInitialDrafts());
    setMasonryImages([]);
    if (!apiBaseUrl) {
      setLoadError("API base URL is not configured.");
      setIsLoading(false);
      return;
    }
    loadOverview({ preserveDrafts: false });
  }, [apiBaseUrl, loadOverview]);

  const runAction = useCallback(async (actionKey, action, successMessage = "Saved") => {
    if (!apiBaseUrl) return;
    setActionError("");
    setActionMessage("");
    setActiveActionKey(actionKey);
    try {
      await action();
      await loadOverview({ preserveDrafts: false });
      setActionMessage(successMessage);
    } catch (error) {
      setActionError(error?.message || "Action failed.");
    } finally {
      setActiveActionKey("");
    }
  }, [apiBaseUrl, loadOverview]);

  const options = overview?.options || {};
  const moduleData = overview?.modules || {};
  const generationModule = moduleData.generation || {};
  const videoModule = moduleData.video || {};
  const storyModule = moduleData.story || {};
  const soundModule = moduleData.sound || {};
  const experienceModule = moduleData.experience || {};

  const summary = useMemo(() => {
    const source = overview?.summary || opsSnapshot?.summary || EMPTY_SUMMARY;
    return {
      queued: Number(source.queued || 0),
      running: Number(source.running || 0),
      completed: Number(source.completed || 0),
      failed: Number(source.failed || 0),
      queueDepth: Number(source.queueDepth || 0),
    };
  }, [overview?.summary, opsSnapshot?.summary]);

  const generationModels = useMemo(
    () =>
      Array.isArray(options?.generation?.imageModels)
        ? options.generation.imageModels
        : [],
    [options?.generation?.imageModels]
  );

  const generationByModel = useMemo(
    () => options?.generation?.byModel || {},
    [options?.generation?.byModel]
  );

  const generationSchedulers = useMemo(() => {
    const modelConfig = generationByModel[drafts.generation.imageModel] || {};
    return Array.isArray(modelConfig.schedulers) ? modelConfig.schedulers : [];
  }, [generationByModel, drafts.generation.imageModel]);

  const generationSizes = useMemo(() => {
    const modelConfig = generationByModel[drafts.generation.imageModel] || {};
    return Array.isArray(modelConfig.sizes) ? modelConfig.sizes : [];
  }, [generationByModel, drafts.generation.imageModel]);

  useEffect(() => {
    if (!generationSchedulers.length) return;
    if (generationSchedulers.includes(drafts.generation.imageScheduler)) return;
    setDrafts((current) => ({
      ...current,
      generation: {
        ...current.generation,
        imageScheduler: generationSchedulers[0],
      },
    }));
  }, [generationSchedulers, drafts.generation.imageScheduler]);

  useEffect(() => {
    if (!generationSizes.length) return;
    const hasSelected = generationSizes.some(
      (size) => buildSizeKey(size.width, size.height) === drafts.generation.imageSizeKey
    );
    if (hasSelected) return;
    setDrafts((current) => ({
      ...current,
      generation: {
        ...current.generation,
        imageSizeKey: buildSizeKey(generationSizes[0].width, generationSizes[0].height),
      },
    }));
  }, [generationSizes, drafts.generation.imageSizeKey]);

  const videoModels = useMemo(
    () => (Array.isArray(options?.video?.models) ? options.video.models : []),
    [options?.video?.models]
  );

  const soundEnergyLevels = useMemo(
    () => (Array.isArray(options?.sound?.energyLevels) ? options.sound.energyLevels : []),
    [options?.sound?.energyLevels]
  );

  const appThemes = useMemo(() => {
    const themeLabelByKey = DIRECTOR_THEME_OPTIONS.reduce((accumulator, theme) => {
      accumulator[theme.key] = theme.label;
      return accumulator;
    }, {});
    const sourceThemes =
      Array.isArray(options?.app?.themes) && options.app.themes.length
        ? options.app.themes
        : DIRECTOR_THEME_OPTIONS;
    const filteredThemes = sourceThemes
      .map((theme) => {
        const key = normalizeDirectorTheme(theme?.key, "");
        if (!key) return null;
        const fallbackLabel = themeLabelByKey[key] || key;
        const label = String(theme?.label || "").trim() || fallbackLabel;
        return {
          key,
          label,
        };
      })
      .filter(Boolean);
    return filteredThemes.length ? filteredThemes : DIRECTOR_THEME_OPTIONS;
  }, [options?.app?.themes]);

  useEffect(() => {
    const normalizedTheme = normalizeDirectorTheme(currentTheme, "");
    if (!normalizedTheme) return;
    setDrafts((current) => {
      if (current.app.theme === normalizedTheme) return current;
      return {
        ...current,
        app: {
          ...current.app,
          theme: normalizedTheme,
        },
      };
    });
  }, [currentTheme]);

  const handleGenerationModelChange = useCallback(
    (nextModel) => {
      const modelConfig = generationByModel[nextModel] || {};
      const nextSchedulers = Array.isArray(modelConfig.schedulers)
        ? modelConfig.schedulers
        : [];
      const nextSizes = Array.isArray(modelConfig.sizes) ? modelConfig.sizes : [];
      setDrafts((current) => ({
        ...current,
        generation: {
          ...current.generation,
          imageModel: nextModel,
          imageScheduler: nextSchedulers[0] || "",
          imageSizeKey: nextSizes[0]
            ? buildSizeKey(nextSizes[0].width, nextSizes[0].height)
            : "",
        },
      }));
    },
    [generationByModel]
  );

  const saveGenerationDefaults = useCallback(async () => {
    const parsedSize = parseSizeKey(drafts.generation.imageSizeKey);
    if (!parsedSize) {
      throw new Error("Image size selection is invalid.");
    }
    await saveDirectorConfig(apiBaseUrl, {
      config: {
        generation: {
          imageModel: drafts.generation.imageModel,
          imageScheduler: drafts.generation.imageScheduler,
          imageWidth: parsedSize.width,
          imageHeight: parsedSize.height,
          negativePrompt: drafts.generation.negativePrompt,
        },
      },
    });
  }, [apiBaseUrl, drafts.generation]);

  const saveVideoDefaults = useCallback(async () => {
    await saveDirectorConfig(apiBaseUrl, {
      config: {
        video: {
          videoModel: drafts.video.videoModel,
          generateAudio: Boolean(drafts.video.generateAudio),
        },
      },
    });
  }, [apiBaseUrl, drafts.video]);

  const saveSoundDefaults = useCallback(async () => {
    await saveDirectorConfig(apiBaseUrl, {
      config: {
        sound: {
          defaultMood: drafts.sound.defaultMood,
          defaultEnergy: drafts.sound.defaultEnergy,
          defaultTags: splitTags(drafts.sound.defaultTags),
        },
      },
    });
  }, [apiBaseUrl, drafts.sound]);

  const normalizeSoundMetadata = useCallback(async () => {
    await normalizeDirectorSoundMetadata(apiBaseUrl, {
      soundDefaults: {
        defaultMood: drafts.sound.defaultMood,
        defaultEnergy: drafts.sound.defaultEnergy,
        defaultTags: splitTags(drafts.sound.defaultTags),
      },
    });
  }, [apiBaseUrl, drafts.sound]);

  const saveAppTheme = useCallback(async () => {
    const payload = await saveDirectorAppConfig(apiBaseUrl, {
      theme: drafts.app.theme,
    });
    const nextTheme = normalizeDirectorTheme(
      payload?.appConfig?.theme || drafts.app.theme,
      DIRECTOR_DEFAULT_THEME
    );
    onThemeChange?.(nextTheme, { persist: true });
    setDrafts((current) => ({
      ...current,
      app: {
        ...current.app,
        theme: nextTheme,
      },
    }));
  }, [apiBaseUrl, drafts.app.theme, onThemeChange]);

  const refreshMasonryImages = useCallback(async () => {
    const payload = await listDirectorMasonryImages(apiBaseUrl);
    const items = Array.isArray(payload?.images) ? payload.images : [];
    setMasonryImages(items);
  }, [apiBaseUrl]);

  const handleUploadMasonryImage = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || !apiBaseUrl) return;
      setActionError("");
      setActionMessage("");
      setIsUploadingMasonry(true);
      try {
        const upload = await requestDirectorMasonryUploadUrl(apiBaseUrl, {
          fileName: file.name,
          contentType: file.type || "image/jpeg",
        });
        await putFileToUrl(upload.url, file, file.type || "image/jpeg");
        await refreshMasonryImages();
        setActionMessage("Masonry image uploaded.");
      } catch (error) {
        setActionError(error?.message || "Failed to upload masonry image.");
      } finally {
        setIsUploadingMasonry(false);
      }
    },
    [apiBaseUrl, refreshMasonryImages]
  );

  const handleDeleteMasonryImage = useCallback(
    async (imageKey) => {
      if (!imageKey || !apiBaseUrl) return;
      setActionError("");
      setActionMessage("");
      setActiveActionKey(`delete-masonry-${imageKey}`);
      try {
        await deleteDirectorMasonryImage(apiBaseUrl, { key: imageKey });
        await refreshMasonryImages();
        setActionMessage("Masonry image removed.");
      } catch (error) {
        setActionError(error?.message || "Failed to delete masonry image.");
      } finally {
        setActiveActionKey("");
      }
    },
    [apiBaseUrl, refreshMasonryImages]
  );

  const directorSignals = [
    { id: "queued", label: "Queued", value: `${summary.queued}` },
    { id: "running", label: "Running", value: `${summary.running}` },
    { id: "completed", label: "Completed", value: `${summary.completed}` },
    { id: "failed", label: "Failed", value: `${summary.failed}` },
    { id: "depth", label: "Queue Depth", value: `${summary.queueDepth}` },
  ];

  const generationActiveJobs = Array.isArray(generationModule.activeJobs)
    ? generationModule.activeJobs
    : [];
  const generationFailedJobs = Array.isArray(generationModule.failedJobs)
    ? generationModule.failedJobs
    : [];
  const videoActiveJobs = Array.isArray(videoModule.activeJobs)
    ? videoModule.activeJobs
    : [];
  const videoFailedJobs = Array.isArray(videoModule.failedJobs)
    ? videoModule.failedJobs
    : [];
  const storySessions = Array.isArray(storyModule.sessions) ? storyModule.sessions : [];
  const missingTracks = Array.isArray(soundModule.missingTracks)
    ? soundModule.missingTracks
    : [];
  const generationSection = DIRECTOR_SECTION_META.generation;
  const videoSection = DIRECTOR_SECTION_META.video;
  const storySection = DIRECTOR_SECTION_META.story;
  const soundSection = DIRECTOR_SECTION_META.sound;
  const experienceSection = DIRECTOR_SECTION_META.experience;

  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver !== "function") {
      return undefined;
    }

    const sectionElements = DIRECTOR_SECTION_DEFS.map(({ id }) =>
      document.getElementById(id)
    ).filter(Boolean);
    if (!sectionElements.length) {
      return undefined;
    }

    const resolveVisibleSection = () => {
      const sectionByTop = sectionElements
        .map((element) => ({
          element,
          top: element.getBoundingClientRect().top,
        }))
        .sort((left, right) => left.top - right.top);
      const aboveTabs = [...sectionByTop]
        .reverse()
        .find((item) => item.top <= DIRECTOR_TABS_ACTIVE_OFFSET_PX);
      const selected = aboveTabs || sectionByTop[0];
      const nextKey = selected?.element?.dataset?.sectionKey;
      if (nextKey) {
        setActiveSectionKey(nextKey);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              Math.abs(left.boundingClientRect.top - DIRECTOR_TABS_ACTIVE_OFFSET_PX) -
              Math.abs(right.boundingClientRect.top - DIRECTOR_TABS_ACTIVE_OFFSET_PX)
          );
        if (intersecting.length) {
          const nextKey = intersecting[0].target?.dataset?.sectionKey;
          if (nextKey) {
            setActiveSectionKey(nextKey);
          }
          return;
        }
        resolveVisibleSection();
      },
      {
        root: null,
        rootMargin: `-${DIRECTOR_OBSERVER_TOP_MARGIN_PCT}% 0px -${DIRECTOR_OBSERVER_BOTTOM_MARGIN_PCT}% 0px`,
        threshold: DIRECTOR_OBSERVER_THRESHOLD,
      }
    );

    sectionElements.forEach((element) => observer.observe(element));
    resolveVisibleSection();

    return () => {
      observer.disconnect();
    };
  }, [isLoading]);

  return (
    <section className="director-page">
      <header className="director-hero">
        <div>
          <p className="director-kicker">Director</p>
          <h1 className="director-title">Global Command Center</h1>
          <p className="director-subtitle">
            One readable surface for Generation Ops, Video Pipeline, Story Control,
            and Sound Governance.
          </p>
        </div>
        <div className="director-hero-actions">
          <Link to="/lora" className="director-refresh">
            Open LoRA
          </Link>
          <button
            type="button"
            className="director-refresh"
            onClick={() => loadOverview({ preserveDrafts: false })}
            disabled={isLoading}
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      <section className="director-signals" aria-label="Director signals">
        <div className="director-signals-head">
          <h2>Live Signals</h2>
          {(opsLoading || isLoading) && <span>Refreshing...</span>}
        </div>
        <div className="director-signal-grid">
          {directorSignals.map((signal) => (
            <article key={signal.id} className="director-signal-card">
              <span>{signal.label}</span>
              <strong>{signal.value}</strong>
            </article>
          ))}
        </div>
      </section>

      {(loadError || opsError || actionError || actionMessage) && (
        <section className="director-flash-stack" aria-live="polite">
          {loadError ? <p className="director-flash director-flash--error">{loadError}</p> : null}
          {opsError ? <p className="director-flash director-flash--error">{opsError}</p> : null}
          {actionError ? (
            <p className="director-flash director-flash--error">{actionError}</p>
          ) : null}
          {actionMessage ? (
            <p className="director-flash director-flash--success">{actionMessage}</p>
          ) : null}
        </section>
      )}

      <nav className="director-section-tabs" aria-label="Director module navigation">
        <ul className="director-section-tabs-list">
          {DIRECTOR_SECTION_DEFS.map((section) => (
            <li key={section.key}>
              <a
                href={`#${section.id}`}
                className={`director-section-tab${
                  activeSectionKey === section.key ? " is-active" : ""
                }`}
                aria-current={activeSectionKey === section.key ? "true" : undefined}
                onClick={() => setActiveSectionKey(section.key)}
              >
                <span className="director-section-tab-number">{section.titleNumber}</span>
                <span>{section.tabLabel}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section className="director-module-grid" aria-label="Director modules">
        <article
          className="director-module"
          id={generationSection.id}
          data-section-key={generationSection.key}
          data-section-index={generationSection.titleNumber}
        >
          <div className="director-module-head">
            <div>
              <h3>{`${generationSection.titleNumber}. ${generationSection.title}`}</h3>
              <p>Manage image defaults and keep render priorities clean.</p>
            </div>
            <Link to="/" className="director-module-link">
              Open Generator
            </Link>
          </div>

          <div className="director-form-grid">
            <label>
              Model
              <select
                value={drafts.generation.imageModel}
                onChange={(event) => handleGenerationModelChange(event.target.value)}
              >
                {generationModels.map((model) => (
                  <option key={model.key} value={model.key}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Scheduler
              <select
                value={drafts.generation.imageScheduler}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    generation: {
                      ...current.generation,
                      imageScheduler: event.target.value,
                    },
                  }))
                }
              >
                {generationSchedulers.map((scheduler) => (
                  <option key={scheduler} value={scheduler}>
                    {scheduler}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Image Size
              <select
                value={drafts.generation.imageSizeKey}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    generation: {
                      ...current.generation,
                      imageSizeKey: event.target.value,
                    },
                  }))
                }
              >
                {generationSizes.map((size) => {
                  const key = buildSizeKey(size.width, size.height);
                  return (
                    <option key={key} value={key}>
                      {formatSizeLabel(size.width, size.height)}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>

          <label className="director-textarea-label">
            Negative Prompt Defaults
            <textarea
              value={drafts.generation.negativePrompt}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  generation: {
                    ...current.generation,
                    negativePrompt: event.target.value,
                  },
                }))
              }
              rows={3}
            />
          </label>

          <div className="director-module-actions">
            <button
              type="button"
              onClick={() =>
                runAction(
                  "save-generation",
                  saveGenerationDefaults,
                  "Generation defaults saved."
                )
              }
              disabled={activeActionKey === "save-generation"}
            >
              {activeActionKey === "save-generation" ? "Saving..." : "Save Generation Defaults"}
            </button>
          </div>

          <div className="director-list-columns">
            <section>
              <h4>Active Jobs ({generationModule?.summary?.running || 0})</h4>
              {generationActiveJobs.length ? (
                <ul className="director-job-list">
                  {generationActiveJobs.map((job) => (
                    <li key={job.id}>
                      <div>
                        <strong>{job.title}</strong>
                        <p>
                          {job.statusLabel} • {job.progressPct}% • {job.etaLabel}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(
                            `prioritize-${job.id}`,
                            () => prioritizeDirectorJob(apiBaseUrl, { jobKey: job.jobKey }),
                            `Prioritized ${job.title}.`
                          )
                        }
                        disabled={
                          !job.jobKey || activeActionKey === `prioritize-${job.id}`
                        }
                      >
                        Prioritize
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="director-empty">No active generation jobs.</p>
              )}
            </section>

            <section>
              <h4>Failed Jobs ({generationModule?.summary?.failed || 0})</h4>
              {generationFailedJobs.length ? (
                <ul className="director-job-list">
                  {generationFailedJobs.map((job) => (
                    <li key={job.id}>
                      <div>
                        <strong>{job.title}</strong>
                        <p>{job.errorMessage || "No error details provided."}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(
                            `retry-priority-${job.id}`,
                            () => prioritizeDirectorJob(apiBaseUrl, { jobKey: job.jobKey }),
                            `Moved ${job.title} to high priority.`
                          )
                        }
                        disabled={
                          !job.jobKey || activeActionKey === `retry-priority-${job.id}`
                        }
                      >
                        Queue First
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="director-empty">No failed generation jobs.</p>
              )}
            </section>
          </div>
        </article>

        <article
          className="director-module"
          id={videoSection.id}
          data-section-key={videoSection.key}
          data-section-index={videoSection.titleNumber}
        >
          <div className="director-module-head">
            <div>
              <h3>{`${videoSection.titleNumber}. ${videoSection.title}`}</h3>
              <p>Control video defaults and elevate blocked clips quickly.</p>
            </div>
            <Link to="/videos" className="director-module-link">
              Open Videos
            </Link>
          </div>

          <div className="director-form-grid director-form-grid--two">
            <label>
              Video Model
              <select
                value={drafts.video.videoModel}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    video: {
                      ...current.video,
                      videoModel: event.target.value,
                    },
                  }))
                }
              >
                {videoModels.map((model) => (
                  <option key={model.key} value={model.key}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Generate Audio
              <select
                value={drafts.video.generateAudio ? "enabled" : "disabled"}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    video: {
                      ...current.video,
                      generateAudio: event.target.value === "enabled",
                    },
                  }))
                }
              >
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
          </div>

          <div className="director-module-actions">
            <button
              type="button"
              onClick={() =>
                runAction(
                  "save-video",
                  saveVideoDefaults,
                  "Video defaults saved."
                )
              }
              disabled={activeActionKey === "save-video"}
            >
              {activeActionKey === "save-video" ? "Saving..." : "Save Video Defaults"}
            </button>
          </div>

          <div className="director-list-columns">
            <section>
              <h4>Active Video Jobs ({videoModule?.summary?.running || 0})</h4>
              {videoActiveJobs.length ? (
                <ul className="director-job-list">
                  {videoActiveJobs.map((job) => (
                    <li key={job.id}>
                      <div>
                        <strong>{job.title}</strong>
                        <p>
                          {job.statusLabel} • {job.progressPct}% • {job.etaLabel}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(
                            `video-prioritize-${job.id}`,
                            () => prioritizeDirectorJob(apiBaseUrl, { jobKey: job.jobKey }),
                            `Prioritized ${job.title}.`
                          )
                        }
                        disabled={
                          !job.jobKey || activeActionKey === `video-prioritize-${job.id}`
                        }
                      >
                        Prioritize
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="director-empty">No active video jobs.</p>
              )}
            </section>

            <section>
              <h4>Failed Video Jobs ({videoModule?.summary?.failed || 0})</h4>
              {videoFailedJobs.length ? (
                <ul className="director-job-list">
                  {videoFailedJobs.map((job) => (
                    <li key={job.id}>
                      <div>
                        <strong>{job.title}</strong>
                        <p>{job.errorMessage || "No error details provided."}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(
                            `video-retry-priority-${job.id}`,
                            () => prioritizeDirectorJob(apiBaseUrl, { jobKey: job.jobKey }),
                            `Moved ${job.title} to high priority.`
                          )
                        }
                        disabled={
                          !job.jobKey || activeActionKey === `video-retry-priority-${job.id}`
                        }
                      >
                        Queue First
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="director-empty">No failed video jobs.</p>
              )}
            </section>
          </div>
        </article>

        <article
          className="director-module"
          id={storySection.id}
          data-section-key={storySection.key}
          data-section-index={storySection.titleNumber}
        >
          <div className="director-module-head">
            <div>
              <h3>{`${storySection.titleNumber}. ${storySection.title}`}</h3>
              <p>Pin priority sessions and keep active narratives in focus.</p>
            </div>
            <Link to="/story" className="director-module-link">
              Open Story
            </Link>
          </div>

          <div className="director-story-summary">
            <span>Total sessions: {storyModule?.summary?.totalSessions || 0}</span>
            <span>Pinned sessions: {storyModule?.summary?.pinnedSessions || 0}</span>
          </div>

          {storySessions.length ? (
            <ul className="director-story-list">
              {storySessions.map((session) => (
                <li key={session.sessionId || session.updatedAt}>
                  <div>
                    <strong>{session.title || "Untitled session"}</strong>
                    <p>
                      {session.turnCount || 0} turns • {session.sceneCount || 0} scenes
                    </p>
                    <p className="director-submeta">
                      Updated {formatTimestamp(session.updatedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      runAction(
                        `session-pin-${session.sessionId}`,
                        () =>
                          pinDirectorStorySession(apiBaseUrl, {
                            sessionId: session.sessionId,
                            pinned: !session.directorPinned,
                          }),
                        session.directorPinned
                          ? `Unpinned ${session.title || "session"}.`
                          : `Pinned ${session.title || "session"}.`
                      )
                    }
                    disabled={
                      !session.sessionId ||
                      activeActionKey === `session-pin-${session.sessionId}`
                    }
                  >
                    {session.directorPinned ? "Unpin" : "Pin"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="director-empty">No story sessions found.</p>
          )}
        </article>

        <article
          className="director-module"
          id={soundSection.id}
          data-section-key={soundSection.key}
          data-section-index={soundSection.titleNumber}
        >
          <div className="director-module-head">
            <div>
              <h3>{`${soundSection.titleNumber}. ${soundSection.title}`}</h3>
              <p>Standardize soundtrack metadata and repair missing mood signals.</p>
            </div>
            <Link to="/music-library" className="director-module-link">
              Open Sound Lab
            </Link>
          </div>

          <div className="director-form-grid director-form-grid--three">
            <label>
              Default Mood
              <input
                type="text"
                value={drafts.sound.defaultMood}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    sound: {
                      ...current.sound,
                      defaultMood: event.target.value,
                    },
                  }))
                }
              />
            </label>

            <label>
              Default Energy
              <select
                value={drafts.sound.defaultEnergy}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    sound: {
                      ...current.sound,
                      defaultEnergy: event.target.value,
                    },
                  }))
                }
              >
                {soundEnergyLevels.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Default Tags
              <input
                type="text"
                value={drafts.sound.defaultTags}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    sound: {
                      ...current.sound,
                      defaultTags: event.target.value,
                    },
                  }))
                }
                placeholder="cinematic, atmospheric"
              />
            </label>
          </div>

          <div className="director-module-actions">
            <button
              type="button"
              onClick={() =>
                runAction(
                  "save-sound",
                  saveSoundDefaults,
                  "Sound defaults saved."
                )
              }
              disabled={activeActionKey === "save-sound"}
            >
              {activeActionKey === "save-sound" ? "Saving..." : "Save Sound Defaults"}
            </button>
            <button
              type="button"
              onClick={() =>
                runAction(
                  "normalize-sound",
                  normalizeSoundMetadata,
                  "Sound metadata normalized."
                )
              }
              disabled={activeActionKey === "normalize-sound"}
            >
              {activeActionKey === "normalize-sound"
                ? "Normalizing..."
                : "Normalize Missing Metadata"}
            </button>
          </div>

          <h4>
            Missing Metadata ({soundModule?.summary?.tracksMissingMetadata || 0})
          </h4>
          {missingTracks.length ? (
            <ul className="director-sound-list">
              {missingTracks.map((track) => (
                <li key={track.trackId || track.updatedAt}>
                  <strong>{track.title}</strong>
                  <p>
                    Mood: {track.mood || "missing"} • Energy: {track.energy || "missing"}
                  </p>
                  <p className="director-submeta">
                    Tags: {track.tags?.length ? track.tags.join(", ") : "missing"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="director-empty">All tracks already match sound metadata standards.</p>
          )}
        </article>

        <article
          className="director-module"
          id={experienceSection.id}
          data-section-key={experienceSection.key}
          data-section-index={experienceSection.titleNumber}
        >
          <div className="director-module-head">
            <div>
              <h3>{`${experienceSection.titleNumber}. ${experienceSection.title}`}</h3>
              <p>Set the global theme and curate portrait masonry assets.</p>
            </div>
          </div>

          <div className="director-form-grid director-form-grid--two">
            <label>
              Global Theme
              <select
                value={drafts.app.theme}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    app: {
                      ...current.app,
                      theme: event.target.value,
                    },
                  }))
                }
              >
                {appThemes.map((theme) => (
                  <option key={theme.key} value={theme.key}>
                    {theme.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Masonry Portraits
              <input
                type="text"
                value={`${
                  experienceModule?.summary?.masonryImages ?? masonryImages.length
                } image(s)`}
                readOnly
              />
            </label>
          </div>

          <div className="director-module-actions">
            <button
              type="button"
              onClick={() =>
                runAction("save-app-theme", saveAppTheme, "Global theme saved.")
              }
              disabled={activeActionKey === "save-app-theme"}
            >
              {activeActionKey === "save-app-theme" ? "Saving..." : "Save Theme"}
            </button>
            <button
              type="button"
              onClick={() => masonryFileInputRef.current?.click()}
              disabled={isUploadingMasonry}
            >
              {isUploadingMasonry ? "Uploading..." : "Upload Portrait"}
            </button>
            <button
              type="button"
              onClick={() =>
                runAction(
                  "refresh-masonry",
                  refreshMasonryImages,
                  "Masonry list refreshed."
                )
              }
              disabled={activeActionKey === "refresh-masonry"}
            >
              Refresh List
            </button>
          </div>

          <input
            ref={masonryFileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="director-hidden-input"
            onChange={handleUploadMasonryImage}
          />

          {masonryImages.length ? (
            <div className="director-masonry-list">
              {masonryImages.map((item) => (
                <article key={item.key} className="director-masonry-card">
                  <img src={item.url} alt="" loading="lazy" />
                  <div className="director-masonry-meta">
                    <p>{String(item.key || "").split("/").pop() || "masonry-image"}</p>
                    <button
                      type="button"
                      onClick={() => handleDeleteMasonryImage(item.key)}
                      disabled={activeActionKey === `delete-masonry-${item.key}`}
                    >
                      {activeActionKey === `delete-masonry-${item.key}`
                        ? "Deleting..."
                        : "Delete"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="director-empty">No global masonry images yet.</p>
          )}
        </article>

      </section>
    </section>
  );
}

export default Director;
