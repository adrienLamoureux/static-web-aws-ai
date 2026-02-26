import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchDirectorOverview,
  normalizeDirectorSoundMetadata,
  pinDirectorStorySession,
  prioritizeDirectorJob,
  saveDirectorConfig,
} from "../services/operations";
import "./director.css";

const EMPTY_SUMMARY = Object.freeze({
  queued: 0,
  running: 0,
  completed: 0,
  failed: 0,
  queueDepth: 0,
});

const buildSizeKey = (width, height) => `${Number(width)}x${Number(height)}`;

const parseSizeKey = (sizeKey) => {
  const [widthRaw, heightRaw] = String(sizeKey || "").split("x");
  const width = Number(widthRaw);
  const height = Number(heightRaw);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  return {
    width,
    height,
  };
};

const formatSizeLabel = (width, height) => {
  const numericWidth = Number(width);
  const numericHeight = Number(height);
  if (!Number.isFinite(numericWidth) || !Number.isFinite(numericHeight)) {
    return "Custom size";
  }
  if (numericWidth === numericHeight) {
    return `Square (${numericWidth}x${numericHeight})`;
  }
  if (numericHeight > numericWidth) {
    return `Portrait (${numericWidth}x${numericHeight})`;
  }
  const ratio = numericWidth / numericHeight;
  if (ratio > 1.7 && ratio < 1.8) {
    return `16:9 (${numericWidth}x${numericHeight})`;
  }
  return `${numericWidth}x${numericHeight}`;
};

const formatTimestamp = (value) => {
  const parsed = Date.parse(value || "");
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toLocaleString();
};

const splitTags = (value = "") =>
  String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeTagsForInput = (value = []) =>
  Array.isArray(value) ? value.join(", ") : "";

const buildInitialDrafts = () => ({
  generation: {
    imageModel: "",
    imageScheduler: "",
    imageSizeKey: "",
    negativePrompt: "",
  },
  video: {
    videoModel: "",
    generateAudio: true,
  },
  sound: {
    defaultMood: "",
    defaultEnergy: "",
    defaultTags: "",
  },
});

function Director({ apiBaseUrl = "", opsSnapshot = null, opsLoading = false, opsError = "" }) {
  const [overview, setOverview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [activeActionKey, setActiveActionKey] = useState("");
  const [drafts, setDrafts] = useState(buildInitialDrafts);

  const hasHydratedDraftsRef = useRef(false);

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
    });
  }, []);

  const loadOverview = useCallback(
    async ({ preserveDrafts = true } = {}) => {
      if (!apiBaseUrl) return;
      setIsLoading(true);
      setLoadError("");
      try {
        const payload = await fetchDirectorOverview(apiBaseUrl);
        setOverview(payload);
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
    [apiBaseUrl, hydrateDrafts]
  );

  useEffect(() => {
    hasHydratedDraftsRef.current = false;
    setOverview(null);
    setDrafts(buildInitialDrafts());
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

  const generationByModel = options?.generation?.byModel || {};

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

  return (
    <section className="director-page">
      <header className="director-hero glass-panel">
        <div>
          <p className="director-kicker">Director</p>
          <h1 className="director-title">Global Command Center</h1>
          <p className="director-subtitle">
            One readable surface for Generation Ops, Video Pipeline, Story Control,
            and Sound Governance.
          </p>
        </div>
        <button
          type="button"
          className="director-refresh"
          onClick={() => loadOverview({ preserveDrafts: false })}
          disabled={isLoading}
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <section className="director-signals glass-panel" aria-label="Director signals">
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

      <section className="director-module-grid" aria-label="Director modules">
        <article className="director-module glass-panel">
          <div className="director-module-head">
            <div>
              <h3>1. Generation Ops</h3>
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

        <article className="director-module glass-panel">
          <div className="director-module-head">
            <div>
              <h3>2. Video Pipeline</h3>
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

        <article className="director-module glass-panel">
          <div className="director-module-head">
            <div>
              <h3>3. Story Control</h3>
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

        <article className="director-module glass-panel">
          <div className="director-module-head">
            <div>
              <h3>4. Sound Governance</h3>
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
      </section>
    </section>
  );
}

export default Director;
