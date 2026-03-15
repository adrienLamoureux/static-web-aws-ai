import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Link,
  Navigate,
  useLocation,
} from "react-router-dom";
import About from "./pages/About";
import Whisk from "./pages/Whisk";
import SharedLibrary from "./pages/SharedLibrary";
import Story from "./pages/Story";
import StoryMusicLibrary from "./pages/StoryMusicLibrary";
import WhiskVideos from "./pages/WhiskVideos";
import Director from "./pages/Director";
import LoraManagement from "./pages/LoraManagement";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import RequireAuth from "./components/auth/RequireAuth";
import GlobalNowPlayingDock from "./components/music/GlobalNowPlayingDock";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import {
  fetchDirectorAppConfig,
  fetchOperationalDashboard,
  listDirectorMasonryImages,
} from "./services/operations";
import { generateReplicateImage } from "./services/replicate";
import { listStoryCharacters } from "./services/story";
import { listPromptHelperOptions } from "./services/promptHelper";
import {
  buildLoopedMasonryImages,
  buildPixnovelPositivePrompt,
  DEFAULT_OPS_SUMMARY,
  formatAverageRender,
  isVideoQueueItem,
  mapMasonryApiImages,
  mergeCognitoConfig,
  normalizePixnovelTheme,
  PIXNOVEL_CONTEXT_PANEL_CONFIG,
  PIXNOVEL_DEFAULT_CHARACTER,
  PIXNOVEL_DEFAULT_THEME,
  PIXNOVEL_FEED_CONFIG,
  PIXNOVEL_FALLBACK_NEGATIVE_PROMPT,
  PIXNOVEL_IMAGE_SIZE_OPTIONS,
  PIXNOVEL_MASONRY_BASE_IMAGES,
  PIXNOVEL_MASONRY_COLUMNS,
  PIXNOVEL_MASONRY_REPEAT_COUNT,
  PIXNOVEL_MODEL_KEY_MAP,
  PIXNOVEL_MODEL_OPTIONS,
  PIXNOVEL_OPS_POLL_INTERVAL_MS,
  PIXNOVEL_PANE_META,
  PIXNOVEL_SCHEDULER_OPTIONS,
  PIXNOVEL_SIZE_DIMENSIONS_MAP,
  PIXNOVEL_THEME_STORAGE_KEY,
  summarizeQueue,
  uniqueNonEmpty,
} from "./config/pixnovelShellConfig";
import "./themes/pixnovel.css";

const PixnovelContextPanel = ({ activePane }) => {
  const config = PIXNOVEL_CONTEXT_PANEL_CONFIG[activePane];
  if (!config) {
    return null;
  }

  return (
    <aside className="pixnovel-generator-panel" aria-label={`${config.title} controls`}>
      <header className="pixnovel-generator-head">
        <p className="pixnovel-generator-kicker">{config.kicker}</p>
        <h3>{config.title}</h3>
      </header>
      {config.sections.map((section) => (
        <section key={section.label} className="pixnovel-control-group">
          <p className="pixnovel-control-label">{section.label}</p>
          <div className="pixnovel-shortcut-list">
            {section.items.map((item) => (
              <div key={`${section.label}-${item.title}`} className="pixnovel-shortcut-item">
                <span>{item.title}</span>
                <small>{item.value}</small>
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="pixnovel-generator-note">{config.footer}</p>
    </aside>
  );
};

const PixnovelGenerationMenu = ({ apiBaseUrl }) => {
  const [characterOptions, setCharacterOptions] = useState([
    PIXNOVEL_DEFAULT_CHARACTER,
  ]);
  const [poseOptions, setPoseOptions] = useState([]);
  const [backgroundOptions, setBackgroundOptions] = useState([]);
  const [outfitOptions, setOutfitOptions] = useState([]);
  const [defaultNegativePrompt, setDefaultNegativePrompt] = useState(
    PIXNOVEL_FALLBACK_NEGATIVE_PROMPT
  );

  const [selectedModel, setSelectedModel] = useState(PIXNOVEL_MODEL_OPTIONS[0]);
  const [imageName, setImageName] = useState("frieren-key-visual");
  const [selectedCharacter, setSelectedCharacter] = useState(
    PIXNOVEL_DEFAULT_CHARACTER
  );
  const [selectedPose, setSelectedPose] = useState("");
  const [selectedBackground, setSelectedBackground] = useState("");
  const [selectedOutfit, setSelectedOutfit] = useState("");
  const [selectedImageSize, setSelectedImageSize] = useState(
    PIXNOVEL_IMAGE_SIZE_OPTIONS[0]
  );
  const [selectedScheduler, setSelectedScheduler] = useState(
    PIXNOVEL_SCHEDULER_OPTIONS[0]
  );
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [submitMessage, setSubmitMessage] = useState("");

  useEffect(() => {
    if (!apiBaseUrl) return;
    Promise.all([listStoryCharacters(apiBaseUrl), listPromptHelperOptions(apiBaseUrl)])
      .then(([characterPayload, helperPayload]) => {
        const characterList = Array.isArray(characterPayload?.characters)
          ? characterPayload.characters
          : [];
        const fallbackCharacterNames = characterList
          .map((item) => item?.name)
          .filter(Boolean);
        const mergedCharacters = uniqueNonEmpty([
          PIXNOVEL_DEFAULT_CHARACTER,
          ...fallbackCharacterNames,
        ]);
        const selectedCharacterPreset =
          characterList.find((item) =>
            String(item?.name || "")
              .toLowerCase()
              .includes("frieren")
          ) || characterList[0] || null;

        const poseList = uniqueNonEmpty([
          selectedCharacterPreset?.pose,
          ...(helperPayload?.poses || []),
          ...characterList.map((item) => item?.pose),
        ]);
        const backgroundList = uniqueNonEmpty([
          selectedCharacterPreset?.background,
          ...(helperPayload?.backgrounds || []),
          ...characterList.map((item) => item?.background),
        ]);
        const outfitList = uniqueNonEmpty([
          selectedCharacterPreset?.outfitMaterials,
          ...(helperPayload?.outfits || []),
          ...characterList.map((item) => item?.outfitMaterials),
        ]);
        const resolvedNegativePrompt =
          typeof helperPayload?.negativePrompt === "string" &&
          helperPayload.negativePrompt.trim()
            ? helperPayload.negativePrompt.trim()
            : PIXNOVEL_FALLBACK_NEGATIVE_PROMPT;

        setCharacterOptions(mergedCharacters);
        setPoseOptions(poseList);
        setBackgroundOptions(backgroundList);
        setOutfitOptions(outfitList);
        setDefaultNegativePrompt(resolvedNegativePrompt);

        if (selectedCharacterPreset?.name) {
          setSelectedCharacter(selectedCharacterPreset.name);
        } else {
          setSelectedCharacter(mergedCharacters[0] || PIXNOVEL_DEFAULT_CHARACTER);
        }
        setSelectedPose((previous) =>
          previous || selectedCharacterPreset?.pose || ""
        );
        setSelectedBackground((previous) =>
          previous || selectedCharacterPreset?.background || ""
        );
        setSelectedOutfit((previous) =>
          previous || selectedCharacterPreset?.outfitMaterials || ""
        );
      })
      .catch(() => {});
  }, [apiBaseUrl]);

  const generatedPositivePrompt = useMemo(
    () =>
      buildPixnovelPositivePrompt({
        character: selectedCharacter,
        outfit: selectedOutfit,
        pose: selectedPose,
        background: selectedBackground,
        imageSize: selectedImageSize,
      }),
    [
      selectedCharacter,
      selectedOutfit,
      selectedPose,
      selectedBackground,
      selectedImageSize,
    ]
  );

  const generatedNegativePrompt = useMemo(
    () => defaultNegativePrompt || PIXNOVEL_FALLBACK_NEGATIVE_PROMPT,
    [defaultNegativePrompt]
  );

  const quickGeneratePayload = useMemo(() => {
    const modelKey =
      PIXNOVEL_MODEL_KEY_MAP[selectedModel] || PIXNOVEL_MODEL_KEY_MAP[PIXNOVEL_MODEL_OPTIONS[0]];
    const dimensions =
      PIXNOVEL_SIZE_DIMENSIONS_MAP[selectedImageSize] ||
      PIXNOVEL_SIZE_DIMENSIONS_MAP[PIXNOVEL_IMAGE_SIZE_OPTIONS[0]];
    return {
      model: modelKey,
      imageName: imageName.trim() || "pixnovel-quick-generate",
      prompt: generatedPositivePrompt,
      negativePrompt: generatedNegativePrompt,
      width: dimensions.width,
      height: dimensions.height,
      numImages: 1,
      ...(modelKey === "animagine" ? { scheduler: selectedScheduler } : {}),
    };
  }, [
    generatedNegativePrompt,
    generatedPositivePrompt,
    imageName,
    selectedImageSize,
    selectedModel,
    selectedScheduler,
  ]);

  const handleQuickGenerate = async () => {
    if (!apiBaseUrl) {
      setSubmitStatus("error");
      setSubmitMessage("API base URL is missing.");
      return;
    }

    setSubmitStatus("loading");
    setSubmitMessage("Submitting render...");
    try {
      const response = await generateReplicateImage(apiBaseUrl, quickGeneratePayload);
      if (response?.predictionId && response?.status !== "succeeded") {
        setSubmitStatus("success");
        setSubmitMessage(
          `Queued (${response.status || "pending"}). Queue panel will update shortly.`
        );
        return;
      }
      setSubmitStatus("success");
      setSubmitMessage("Image generation request sent successfully.");
    } catch (error) {
      setSubmitStatus("error");
      setSubmitMessage(error?.message || "Failed to submit render.");
    }
  };

  return (
    <aside className="pixnovel-generator-panel" aria-label="Generation controls">
      <header className="pixnovel-generator-head">
        <p className="pixnovel-generator-kicker">Quick Generate</p>
        <h3>Compose Render Settings</h3>
      </header>

      <section className="pixnovel-control-group">
        <p className="pixnovel-control-label">Models</p>
        <select
          className="pixnovel-form-select"
          value={selectedModel}
          onChange={(event) => setSelectedModel(event.target.value)}
        >
          {PIXNOVEL_MODEL_OPTIONS.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </section>

      <section className="pixnovel-control-group">
        <div className="pixnovel-quick-form">
          <label className="pixnovel-form-field">
            <span className="pixnovel-control-label">Image name</span>
            <input
              className="pixnovel-form-input"
              type="text"
              placeholder="e.g. moonlit-rooftop-v1"
              value={imageName}
              onChange={(event) => setImageName(event.target.value)}
            />
          </label>
          <label className="pixnovel-form-field">
            <span className="pixnovel-control-label">Character</span>
            <select
              className="pixnovel-form-select"
              value={selectedCharacter}
              onChange={(event) => setSelectedCharacter(event.target.value)}
            >
              {characterOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="pixnovel-form-field">
            <span className="pixnovel-control-label">
              Pose <em>(optional)</em>
            </span>
            <select
              className="pixnovel-form-select"
              value={selectedPose}
              onChange={(event) => setSelectedPose(event.target.value)}
            >
              <option value="">Auto / None</option>
              {poseOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="pixnovel-form-field">
            <span className="pixnovel-control-label">
              Background <em>(optional)</em>
            </span>
            <select
              className="pixnovel-form-select"
              value={selectedBackground}
              onChange={(event) => setSelectedBackground(event.target.value)}
            >
              <option value="">Auto / None</option>
              {backgroundOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="pixnovel-form-field">
            <span className="pixnovel-control-label">
              Outfits <em>(optional)</em>
            </span>
            <select
              className="pixnovel-form-select"
              value={selectedOutfit}
              onChange={(event) => setSelectedOutfit(event.target.value)}
            >
              <option value="">Auto / None</option>
              {outfitOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="pixnovel-control-group">
        <p className="pixnovel-control-label">Image size</p>
        <select
          className="pixnovel-form-select"
          value={selectedImageSize}
          onChange={(event) => setSelectedImageSize(event.target.value)}
        >
          {PIXNOVEL_IMAGE_SIZE_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </section>

      <section className="pixnovel-control-group">
        <p className="pixnovel-control-label">Scheduler</p>
        <select
          className="pixnovel-form-select"
          value={selectedScheduler}
          onChange={(event) => setSelectedScheduler(event.target.value)}
        >
          {PIXNOVEL_SCHEDULER_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </section>

      <button
        type="button"
        className="pixnovel-generate-button"
        onClick={handleQuickGenerate}
        disabled={submitStatus === "loading"}
      >
        Generate 1 Image
      </button>
      <p
        className={`pixnovel-generator-note${
          submitStatus === "error"
            ? " pixnovel-generator-note--error"
            : submitStatus === "success"
              ? " pixnovel-generator-note--success"
              : ""
        }`}
      >
        {submitMessage || "Simplified shortcut. Use the image dialog for advanced controls."}
      </p>
    </aside>
  );
};

const PixnovelHeroMasonry = ({ masonryBaseImages }) => {
  const masonryImages = useMemo(
    () =>
      buildLoopedMasonryImages(
        masonryBaseImages?.length ? masonryBaseImages : PIXNOVEL_MASONRY_BASE_IMAGES,
        PIXNOVEL_MASONRY_REPEAT_COUNT
      ),
    [masonryBaseImages]
  );

  return (
    <div className="pixnovel-hero-masonry">
      <div className="pixnovel-masonry-grid" aria-hidden="true">
        {PIXNOVEL_MASONRY_COLUMNS.map((column) => (
          <div
            key={column.id}
            className="pixnovel-masonry-column"
            style={{
              "--pix-masonry-duration": `${column.durationSeconds}s`,
              "--pix-masonry-start-offset": column.startOffset,
            }}
          >
            {masonryImages.map((image) => (
              <figure key={`${column.id}-${image.loopId}`} className="pixnovel-masonry-card">
                <img src={image.src} alt="" loading="lazy" decoding="async" />
              </figure>
            ))}
          </div>
        ))}
      </div>
      <div className="pixnovel-hero-masonry-copy">
        <p className="pixnovel-hero-masonry-title">Whisk Studio</p>
        <p className="pixnovel-hero-masonry-subtitle">
          Anime-first workspace for image generation, story crafting, sound design, and
          direction in one unified flow.
        </p>
      </div>
    </div>
  );
};

const PixnovelWorkspaceNav = ({ activePane }) => {
  return (
    <nav className="pixnovel-workspace-nav" aria-label="Workspace navigation">
      {Object.entries(PIXNOVEL_PANE_META).map(([key, item]) => (
        <Link
          key={key}
          to={item.route}
          className={`pixnovel-top-link${activePane === key ? " is-active" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
};

const PixnovelHero = ({ masonryBaseImages, userEmail, onLogout }) => {
  return (
    <section className="pixnovel-hero" aria-label="Creative hero section">
      <div className="pixnovel-hero-chrome">
        <Link to="/" className="pixnovel-brand">
          Whisk Studio
        </Link>
        <div className="pixnovel-hero-auth">
          <span>{userEmail || "Signed in"}</span>
          <button type="button" className="pixnovel-hero-auth-action" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </div>
      <PixnovelHeroMasonry masonryBaseImages={masonryBaseImages} />
    </section>
  );
};

const PixnovelWorkspace = ({
  apiBaseUrl,
  activePane,
  userEmail,
  onLogout,
  currentTheme,
  onThemeChange,
  onNowPlayingChange,
  onTrackCatalogChange,
}) => {
  const [opsSnapshot, setOpsSnapshot] = useState({
    queue: [],
    signalCards: [],
    summary: DEFAULT_OPS_SUMMARY,
  });
  const [opsLoading, setOpsLoading] = useState(true);
  const [opsError, setOpsError] = useState("");
  const [masonryBaseImages, setMasonryBaseImages] = useState(
    PIXNOVEL_MASONRY_BASE_IMAGES
  );

  const paneByKey = {
    shared: <SharedLibrary apiBaseUrl={apiBaseUrl} />,
    whisk: <Whisk apiBaseUrl={apiBaseUrl} />,
    lora: <LoraManagement apiBaseUrl={apiBaseUrl} />,
    videos: <WhiskVideos apiBaseUrl={apiBaseUrl} />,
    director: (
      <Director
        apiBaseUrl={apiBaseUrl}
        opsSnapshot={opsSnapshot}
        opsLoading={opsLoading}
        opsError={opsError}
        currentTheme={currentTheme}
        onThemeChange={onThemeChange}
      />
    ),
    story: (
      <Story
        apiBaseUrl={apiBaseUrl}
        forcedViewMode="reader"
        pageVariant="story"
        onNowPlayingChange={onNowPlayingChange}
        onTrackCatalogChange={onTrackCatalogChange}
      />
    ),
    music: <StoryMusicLibrary apiBaseUrl={apiBaseUrl} />,
    about: <About />,
  };

  useEffect(() => {
    let isCancelled = false;
    if (!apiBaseUrl) return undefined;

    Promise.all([
      fetchDirectorAppConfig(apiBaseUrl),
      listDirectorMasonryImages(apiBaseUrl),
    ])
      .then(([appConfigPayload, masonryPayload]) => {
        if (isCancelled) return;
        const nextTheme = normalizePixnovelTheme(
          appConfigPayload?.appConfig?.theme,
          PIXNOVEL_DEFAULT_THEME
        );
        onThemeChange?.(nextTheme, { persist: true });

        const nextMasonryImages = mapMasonryApiImages(masonryPayload?.images);
        if (nextMasonryImages.length) {
          setMasonryBaseImages(nextMasonryImages);
        } else {
          setMasonryBaseImages(PIXNOVEL_MASONRY_BASE_IMAGES);
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, onThemeChange]);

  useEffect(() => {
    let isCancelled = false;
    let intervalId = null;

    const loadDashboard = async ({ initial = false } = {}) => {
      if (!apiBaseUrl) return;
      if (initial) {
        setOpsLoading(true);
      }
      try {
        const payload = await fetchOperationalDashboard(apiBaseUrl);
        if (isCancelled) return;
        setOpsSnapshot({
          queue: Array.isArray(payload?.queue) ? payload.queue : [],
          signalCards: Array.isArray(payload?.signalCards)
            ? payload.signalCards
            : [],
          summary: {
            ...DEFAULT_OPS_SUMMARY,
            ...(payload?.summary || {}),
          },
        });
        setOpsError("");
      } catch (error) {
        if (isCancelled) return;
        setOpsError(error?.message || "Failed to load operational dashboard.");
      } finally {
        if (!isCancelled && initial) {
          setOpsLoading(false);
        }
      }
    };

    loadDashboard({ initial: true });
    intervalId = window.setInterval(() => {
      loadDashboard();
    }, PIXNOVEL_OPS_POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [apiBaseUrl]);

  const feedConfig = PIXNOVEL_FEED_CONFIG[activePane] || PIXNOVEL_FEED_CONFIG.whisk;

  const paneQueue = useMemo(() => {
    if (activePane === "videos") {
      return opsSnapshot.queue.filter(isVideoQueueItem);
    }
    if (activePane === "music" || activePane === "shared") {
      return [];
    }
    return opsSnapshot.queue;
  }, [activePane, opsSnapshot.queue]);

  const paneSignals = useMemo(() => {
    const apiSignal =
      opsSnapshot.signalCards.find((item) => item.key === "api-status") ||
      {
        key: "api-status",
        label: "API status",
        value: "Online",
        hint: "Live service check",
        tone: "good",
      };

    if (activePane === "whisk" || activePane === "shared" || activePane === "about") {
      return opsSnapshot.signalCards;
    }

    if (activePane === "videos") {
      const counts = summarizeQueue(paneQueue);
      return [
        {
          ...apiSignal,
          label: "Video API",
        },
        {
          key: "video-backlog",
          label: "Video backlog",
          value: `${counts.running + counts.queued}`,
          hint: `${counts.running} running • ${counts.queued} queued`,
          tone: counts.running + counts.queued > 2 ? "warn" : "good",
        },
        {
          key: "video-completed",
          label: "Video completed",
          value: `${counts.completed}`,
          hint: "Visible in this page grid",
          tone: "good",
        },
        {
          key: "video-failed",
          label: "Video failed",
          value: `${counts.failed}`,
          hint: "Retry from source image if needed",
          tone: counts.failed > 0 ? "bad" : "good",
        },
      ];
    }

    if (activePane === "story") {
      const summary = opsSnapshot.summary || DEFAULT_OPS_SUMMARY;
      return [
        {
          ...apiSignal,
          label: "Director API",
        },
        {
          key: "story-backlog",
          label: "Scene renders",
          value: `${Number(summary.running || 0) + Number(summary.queued || 0)}`,
          hint: `${summary.running || 0} running • ${summary.queued || 0} queued`,
          tone: Number(summary.queueDepth || 0) > 4 ? "warn" : "good",
        },
        {
          key: "story-completed",
          label: "Completed assets",
          value: `${summary.completed || 0}`,
          hint: "Illustrations and clips",
          tone: "good",
        },
        {
          key: "story-pace",
          label: "Avg render pace",
          value: formatAverageRender(summary.averageRenderSeconds),
          hint: `Failures 1h: ${summary.recentFailedJobs || 0}`,
          tone: Number(summary.recentFailedJobs || 0) > 0 ? "warn" : "good",
        },
      ];
    }

    if (activePane === "music") {
      const summary = opsSnapshot.summary || DEFAULT_OPS_SUMMARY;
      return [
        {
          ...apiSignal,
          label: "Sound API",
        },
        {
          key: "sound-workflow",
          label: "Library workflow",
          value: "Ready",
          hint: "Upload, tag, and apply tracks to scenes",
          tone: "good",
        },
        {
          key: "sound-backlog",
          label: "Render pressure",
          value: `${summary.queueDepth || 0}`,
          hint: "Visual backlog can affect soundtrack timing",
          tone: Number(summary.queueDepth || 0) > 4 ? "warn" : "good",
        },
        {
          key: "sound-failures",
          label: "Pipeline errors (1h)",
          value: `${summary.recentFailedJobs || 0}`,
          hint: `Error rate ${summary.errorRatePct || 0}%`,
          tone: Number(summary.recentFailedJobs || 0) > 0 ? "bad" : "good",
        },
      ];
    }

    return opsSnapshot.signalCards;
  }, [activePane, opsSnapshot, paneQueue]);

  const isExpandedStudioPane =
    activePane === "story" ||
    activePane === "music" ||
    activePane === "director";
  const isStoryPane = activePane === "story";
  const sidePanel =
    activePane === "whisk" ? (
      <PixnovelGenerationMenu apiBaseUrl={apiBaseUrl} />
    ) : (
      <PixnovelContextPanel activePane={activePane} />
    );
  const feedPanel = (
    <aside
      className={`pixnovel-feed-panel${
        isExpandedStudioPane ? " pixnovel-feed-panel--inline" : ""
      }`}
    >
      <section className="pixnovel-feed-card">
        <p className="pixnovel-feed-title">{feedConfig.queueTitle}</p>
        {opsLoading && !paneQueue.length ? (
          <p className="pixnovel-feed-copy">{feedConfig.loadingText}</p>
        ) : null}
        {opsError ? <p className="pixnovel-feed-copy pixnovel-feed-copy--error">{opsError}</p> : null}
        {paneQueue.length === 0 && !opsLoading ? (
          <p className="pixnovel-feed-copy">{feedConfig.emptyText}</p>
        ) : (
          <div className="pixnovel-queue-list">
            {paneQueue.map((item) => (
              <div key={item.id} className="pixnovel-queue-item">
                <div className="pixnovel-queue-item-head">
                  <p>{item.title}</p>
                  <span className={`pixnovel-status-badge is-${item.tone || "good"}`}>
                    {item.statusLabel || "Queued"}
                  </span>
                </div>
                <span>{item.detail || "Render task"}</span>
                <div className="pixnovel-queue-metrics">
                  <span>{`${Number(item.progressPct || 0)}%`}</span>
                  <span>{item.etaLabel || "ETA: n/a"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="pixnovel-feed-card">
        <p className="pixnovel-feed-title">{feedConfig.signalTitle}</p>
        {paneSignals.length === 0 ? (
          <p className="pixnovel-feed-copy">{feedConfig.signalEmptyText}</p>
        ) : (
          <div className="pixnovel-signal-list">
            {paneSignals.map((signal) => (
              <div key={signal.key} className="pixnovel-signal-item">
                <div className="pixnovel-signal-row">
                  <span>{signal.label}</span>
                  <strong className={`pixnovel-signal-value is-${signal.tone || "good"}`}>
                    {signal.value}
                  </strong>
                </div>
                <span className="pixnovel-signal-hint">{signal.hint}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  );

  return (
    <div className="pixnovel-workspace">
      <PixnovelHero
        masonryBaseImages={masonryBaseImages}
        userEmail={userEmail}
        onLogout={onLogout}
      />
      <PixnovelWorkspaceNav activePane={activePane} />

      <div className={`pixnovel-grid${isExpandedStudioPane ? " pixnovel-grid--expanded" : ""}`}>
        {isExpandedStudioPane ? null : sidePanel}

        <section
          className={`pixnovel-stage${isExpandedStudioPane ? " pixnovel-stage--expanded" : ""}${
            isStoryPane ? " pixnovel-stage--story-fullbleed" : ""
          }`}
          key={activePane}
        >
          <header
            className={`pixnovel-stage-head${
              isStoryPane ? " pixnovel-stage-head--visually-hidden" : ""
            }`}
          >
            <p className="pixnovel-stage-kicker">{PIXNOVEL_PANE_META[activePane].label}</p>
            <h2>{PIXNOVEL_PANE_META[activePane].subtitle}</h2>
          </header>
          <div
            className={`pixnovel-stage-body${
              isStoryPane ? " pixnovel-stage-body--story-fullbleed" : ""
            }`}
          >
            {paneByKey[activePane]}
          </div>
        </section>

        {isExpandedStudioPane ? null : feedPanel}
      </div>
    </div>
  );
};

const AppShell = ({ apiBaseUrl, currentTheme, onThemeChange }) => {
  const { logout, user } = useAuth();
  const location = useLocation();
  const [nowPlayingTrack, setNowPlayingTrack] = useState(null);
  const [musicTrackCatalog, setMusicTrackCatalog] = useState([]);
  const protectedRoutes = useMemo(
    () => [
      { path: "/", activePane: "shared" },
      { path: "/shared", activePane: "shared" },
      { path: "/whisk", activePane: "whisk" },
      { path: "/lora", activePane: "lora" },
      { path: "/videos", activePane: "videos" },
      { path: "/story", activePane: "story" },
      { path: "/director", activePane: "director" },
      { path: "/music-library", activePane: "music" },
      { path: "/about", activePane: "about" },
    ],
    []
  );
  const hideGlobalMusicDock =
    location.pathname === "/login" || location.pathname === "/auth/callback";

  return (
    <div className="pixnovel-shell relative min-h-screen overflow-hidden">
      <div className="pixnovel-atmosphere" aria-hidden="true">
        <span className="pixnovel-orb pixnovel-orb--one" />
        <span className="pixnovel-orb pixnovel-orb--two" />
        <span className="pixnovel-grid-shimmer" />
      </div>

      <main className="pixnovel-main relative z-10">
        {!hideGlobalMusicDock && user?.email ? (
          <GlobalNowPlayingDock
            nowPlayingTrack={nowPlayingTrack}
            availableTracks={musicTrackCatalog}
          />
        ) : null}
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          {protectedRoutes.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={
                <RequireAuth>
                  <PixnovelWorkspace
                    apiBaseUrl={apiBaseUrl}
                    activePane={route.activePane}
                    userEmail={user?.email}
                    onLogout={logout}
                    currentTheme={currentTheme}
                    onThemeChange={onThemeChange}
                    onNowPlayingChange={
                      route.activePane === "story" ? setNowPlayingTrack : undefined
                    }
                    onTrackCatalogChange={
                      route.activePane === "story" ? setMusicTrackCatalog : undefined
                    }
                  />
                </RequireAuth>
              }
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

function App() {
  const [runtimeConfig, setRuntimeConfig] = useState({
    apiBaseUrl: "",
    cognito: {},
  });
  const [configReady, setConfigReady] = useState(false);
  const [themeName, setThemeName] = useState(() => {
    if (typeof window === "undefined") return PIXNOVEL_DEFAULT_THEME;
    return normalizePixnovelTheme(
      window.localStorage.getItem(PIXNOVEL_THEME_STORAGE_KEY),
      PIXNOVEL_DEFAULT_THEME
    );
  });

  const handleThemeChange = useCallback((nextTheme, options = {}) => {
    const normalizedTheme = normalizePixnovelTheme(nextTheme, PIXNOVEL_DEFAULT_THEME);
    setThemeName(normalizedTheme);
    if (options?.persist && typeof window !== "undefined") {
      window.localStorage.setItem(PIXNOVEL_THEME_STORAGE_KEY, normalizedTheme);
    }
  }, []);

  useEffect(() => {
    document.body.classList.add("theme-pixnovel");
    document.body.dataset.pixTheme = themeName;
    return () => {
      document.body.classList.remove("theme-pixnovel");
      delete document.body.dataset.pixTheme;
    };
  }, [themeName]);

  useEffect(() => {
    let isMounted = true;
    fetch("/config.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setRuntimeConfig({
          apiBaseUrl: data.apiBaseUrl || "",
          cognito: data.cognito || {},
        });
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setConfigReady(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const envApiUrl = process.env.REACT_APP_API_URL || "";
  const envCognito = useMemo(
    () => ({
      domain: process.env.REACT_APP_COGNITO_DOMAIN || "",
      clientId: process.env.REACT_APP_COGNITO_CLIENT_ID || "",
      userPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID || "",
      region: process.env.REACT_APP_COGNITO_REGION || "",
    }),
    []
  );

  const resolvedApiBaseUrl = useMemo(() => {
    if (envApiUrl && typeof window !== "undefined") {
      if (window.location.hostname === "localhost") {
        return envApiUrl;
      }
    }
    return runtimeConfig.apiBaseUrl || envApiUrl || "";
  }, [envApiUrl, runtimeConfig.apiBaseUrl]);

  const resolvedCognito = useMemo(
    () => mergeCognitoConfig(runtimeConfig.cognito, envCognito),
    [envCognito, runtimeConfig.cognito]
  );

  const hasEnvConfig = Boolean(envCognito.domain && envCognito.clientId);
  const isReady = configReady || hasEnvConfig;

  if (!isReady) {
    return (
      <div className="auth-shell">
        <div className="auth-card pix-auth-dialog glass-panel">
          <p className="auth-loading">Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider cognito={resolvedCognito}>
      <Router>
        <AppShell
          apiBaseUrl={resolvedApiBaseUrl}
          currentTheme={themeName}
          onThemeChange={handleThemeChange}
        />
      </Router>
    </AuthProvider>
  );
}

export default App;
