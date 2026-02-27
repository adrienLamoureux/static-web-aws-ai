import React, { useEffect, useMemo, useState } from "react";
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
import Story from "./pages/Story";
import StoryMusicLibrary from "./pages/StoryMusicLibrary";
import WhiskVideos from "./pages/WhiskVideos";
import Director from "./pages/Director";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import RequireAuth from "./components/auth/RequireAuth";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { fetchOperationalDashboard } from "./services/operations";
import { generateReplicateImage } from "./services/replicate";
import { listStoryCharacters } from "./services/story";
import { listPromptHelperOptions } from "./services/promptHelper";

const mergeCognitoConfig = (base = {}, override = {}) => ({
  domain: override.domain || base.domain || "",
  clientId: override.clientId || base.clientId || "",
  userPoolId: override.userPoolId || base.userPoolId || "",
  region: override.region || base.region || "",
});

const PIXNOVEL_PANE_META = {
  whisk: {
    label: "Generator",
    route: "/",
    subtitle: "Realtime visual prompt studio",
  },
  videos: {
    label: "Videos",
    route: "/videos",
    subtitle: "Generated clips and playback controls",
  },
  director: {
    label: "Director",
    route: "/director",
    subtitle: "Global orchestration across all creative workflows",
  },
  story: {
    label: "Story",
    route: "/story",
    subtitle: "Story Teller narrative workspace",
  },
  music: {
    label: "Sound Lab",
    route: "/music-library",
    subtitle: "Track curation and atmosphere cues",
  },
  about: {
    label: "Core",
    route: "/about",
    subtitle: "Project profile and architecture brief",
  },
};

const PIXNOVEL_MODEL_OPTIONS = [
  "Animagine XL v4 Opt",
  "WAI NSFW Illustrious v11",
];

const PIXNOVEL_IMAGE_SIZE_OPTIONS = ["Portrait", "Square", "16:9"];
const PIXNOVEL_SCHEDULER_OPTIONS = ["Euler a", "DPM++ 2M Karras"];
const PIXNOVEL_MODEL_KEY_MAP = {
  "Animagine XL v4 Opt": "animagine",
  "WAI NSFW Illustrious v11": "wai-nsfw-illustrious-v11",
};
const PIXNOVEL_SIZE_DIMENSIONS_MAP = {
  Portrait: { width: 768, height: 1024 },
  Square: { width: 1024, height: 1024 },
  "16:9": { width: 1280, height: 720 },
};
const PIXNOVEL_FALLBACK_NEGATIVE_PROMPT =
  "lowres, bad anatomy, bad hands, text, watermark, blurry";

const PIXNOVEL_STYLE_TAGS = [
  "#dreamwave",
  "#portrait",
  "#lighting",
  "#storyframe",
];
const DEFAULT_OPS_SUMMARY = {
  queueDepth: 0,
  queued: 0,
  running: 0,
  completed: 0,
  failed: 0,
  recentFailedJobs: 0,
  errorRatePct: 0,
  averageRenderSeconds: null,
};
const PIXNOVEL_CONTEXT_PANEL_CONFIG = {
  videos: {
    kicker: "Video Ops",
    title: "Clip Library Controls",
    sections: [
      {
        label: "Library Focus",
        items: [
          { title: "View", value: "Latest renders first" },
          { title: "Preview", value: "Inline player on demand" },
          { title: "Cleanup", value: "Remove invalid outputs fast" },
        ],
      },
      {
        label: "Workflow",
        items: [
          { title: "Input source", value: "From Generator image wall" },
          { title: "Render launch", value: "Image modal -> Generate video" },
          { title: "Refresh", value: "Queue-backed auto updates" },
        ],
      },
    ],
    footer: "Use this page to review, preview, and curate generated clips.",
  },
  story: {
    kicker: "Director",
    title: "Story Director Focus",
    sections: [
      {
        label: "Session Flow",
        items: [
          { title: "Mode", value: "Director / Reader switch" },
          { title: "Presets", value: "Scenario cards for fast setup" },
          { title: "Continuity", value: "Memory + context panels live" },
        ],
      },
      {
        label: "Scene Production",
        items: [
          { title: "Illustrations", value: "Regenerate by scene beat" },
          { title: "Animation", value: "Trigger video from selected scene" },
          { title: "Music", value: "Attach Sound Lab tracks per scene" },
        ],
      },
    ],
    footer: "Director tools are tuned for scene continuity and production cadence.",
  },
  music: {
    kicker: "Sound Lab",
    title: "Soundtrack Operations",
    sections: [
      {
        label: "Track Intake",
        items: [
          { title: "Upload", value: "Music file + metadata tags" },
          { title: "Library", value: "Search and filter saved tracks" },
          { title: "Selection", value: "Set active soundtrack quickly" },
        ],
      },
      {
        label: "Scene Sync",
        items: [
          { title: "Director handoff", value: "Apply track to scene cards" },
          { title: "Mood map", value: "Energy / tempo / mood labels" },
          { title: "Iteration", value: "Swap tracks without leaving session" },
        ],
      },
    ],
    footer: "Sound Lab keeps your music catalog ready for Director scene assignment.",
  },
  about: {
    kicker: "Core",
    title: "Platform Snapshot",
    sections: [
      {
        label: "System",
        items: [
          { title: "Frontend", value: "Pixnovel shell + existing domains" },
          { title: "Backend", value: "Express API + job tracking" },
          { title: "Deploy", value: "CDK stage with sanity + UI smoke" },
        ],
      },
    ],
    footer: "Core view summarizes system surfaces and live stack status.",
  },
};
const PIXNOVEL_FEED_CONFIG = {
  whisk: {
    queueTitle: "Render Queue",
    signalTitle: "Creation Signals",
    loadingText: "Loading operational queue...",
    emptyText: "No active jobs yet.",
    signalEmptyText: "No signals available yet.",
  },
  videos: {
    queueTitle: "Video Queue",
    signalTitle: "Playback Signals",
    loadingText: "Loading video operations...",
    emptyText: "No video jobs yet. Start from Generator image actions.",
    signalEmptyText: "No video signals available yet.",
  },
  director: {
    queueTitle: "Global Queue",
    signalTitle: "Director Signals",
    loadingText: "Loading global operations...",
    emptyText: "No active platform jobs.",
    signalEmptyText: "No director signals available yet.",
  },
  story: {
    queueTitle: "Director Queue",
    signalTitle: "Story Signals",
    loadingText: "Loading director operations...",
    emptyText: "No story render jobs yet.",
    signalEmptyText: "No story signals available yet.",
  },
  music: {
    queueTitle: "Sound Queue",
    signalTitle: "Sound Signals",
    loadingText: "Loading soundtrack operations...",
    emptyText: "No soundtrack jobs yet. Use Sound Lab uploads and scene sync.",
    signalEmptyText: "No sound signals available yet.",
  },
  about: {
    queueTitle: "System Queue",
    signalTitle: "System Signals",
    loadingText: "Loading system operations...",
    emptyText: "No system jobs yet.",
    signalEmptyText: "No system signals available yet.",
  },
};

const PIXNOVEL_MASONRY_BASE_IMAGES = [
  {
    id: "ea7018c3",
    src: "https://images-ng.pixai.art/images/orig/ea7018c3-eb73-41f7-aae6-0080cc2ef6b3",
  },
  {
    id: "9067cc18",
    src: "https://images-ng.pixai.art/images/orig/9067cc18-7378-4499-9da2-38c30d1ee560",
  },
  {
    id: "2c9d0346",
    src: "https://images-ng.pixai.art/images/orig/2c9d0346-8b5b-4486-94b7-f862c9ceb74d",
  },
  {
    id: "c47362e0",
    src: "https://images-ng.pixai.art/images/orig/c47362e0-18ff-4703-9352-95b2164154d4",
  },
];

const PIXNOVEL_MASONRY_COLUMNS = [
  {
    id: "column-a",
    durationSeconds: 54,
    startOffset: "0%",
  },
  {
    id: "column-b",
    durationSeconds: 58,
    startOffset: "-11%",
  },
  {
    id: "column-c",
    durationSeconds: 63,
    startOffset: "-22%",
  },
];

const PIXNOVEL_MASONRY_REPEAT_COUNT = 3;
const PIXNOVEL_OPS_POLL_INTERVAL_MS = 12000;
const PIXNOVEL_DEFAULT_CHARACTER = "Frieren from Beyond Journey's End";

const uniqueNonEmpty = (values = []) => {
  const seen = new Set();
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const buildPixnovelPositivePrompt = ({
  character = "",
  outfit = "",
  pose = "",
  background = "",
  imageSize = "Portrait",
}) => {
  const aspectTag =
    imageSize === "Portrait"
      ? "portrait framing"
      : imageSize === "16:9"
        ? "cinematic wide frame"
        : "square composition";
  return [
    "1girl",
    "solo",
    character || PIXNOVEL_DEFAULT_CHARACTER,
    outfit || null,
    pose || null,
    background || null,
    aspectTag,
    "anime key visual",
    "cinematic lighting",
    "clean lineart",
    "high detail",
  ]
    .filter(Boolean)
    .join(", ");
};

const buildLoopedMasonryImages = (images, repeatCount) => {
  const safeRepeatCount = Math.max(1, repeatCount);
  return Array.from({ length: safeRepeatCount }, (_, repeatIndex) => repeatIndex).reduce(
    (accumulator, repeatIndex) =>
      accumulator.concat(
        images.map((image) => ({
          ...image,
          loopId: `${image.id}-${repeatIndex}`,
        }))
      ),
    []
  );
};

const PIXNOVEL_MASONRY_IMAGES = buildLoopedMasonryImages(
  PIXNOVEL_MASONRY_BASE_IMAGES,
  PIXNOVEL_MASONRY_REPEAT_COUNT
);

const resolveActivePane = (pathname) => {
  if (pathname === "/" || pathname === "/whisk") {
    return "whisk";
  }
  if (pathname === "/story") {
    return "story";
  }
  if (pathname === "/videos") {
    return "videos";
  }
  if (pathname === "/director") {
    return "director";
  }
  if (pathname === "/music-library") {
    return "music";
  }
  if (pathname === "/about") {
    return "about";
  }
  return "whisk";
};

const isVideoQueueItem = (item) =>
  String(item?.detail || "").toLowerCase().includes("video");

const formatAverageRender = (seconds) =>
  Number.isFinite(Number(seconds)) ? `${Math.round(Number(seconds))}s` : "n/a";

const summarizeQueue = (items = []) =>
  items.reduce(
    (accumulator, item) => {
      const status = String(item?.status || "").toLowerCase();
      if (status === "running") accumulator.running += 1;
      else if (status === "queued") accumulator.queued += 1;
      else if (status === "completed") accumulator.completed += 1;
      else if (status === "failed") accumulator.failed += 1;
      return accumulator;
    },
    { queued: 0, running: 0, completed: 0, failed: 0 }
  );

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

const PixnovelHeroMasonry = () => {
  return (
    <div className="pixnovel-hero-masonry" aria-hidden="true">
      <div className="pixnovel-masonry-grid">
        {PIXNOVEL_MASONRY_COLUMNS.map((column) => (
          <div
            key={column.id}
            className="pixnovel-masonry-column"
            style={{
              "--pix-masonry-duration": `${column.durationSeconds}s`,
              "--pix-masonry-start-offset": column.startOffset,
            }}
          >
            {PIXNOVEL_MASONRY_IMAGES.map((image) => (
              <figure key={`${column.id}-${image.loopId}`} className="pixnovel-masonry-card">
                <img src={image.src} alt="" loading="lazy" decoding="async" />
              </figure>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const PixnovelHero = ({ activePane, userEmail, onLogout }) => {
  return (
    <section className="pixnovel-hero" aria-label="Creative hero section">
      <PixnovelHeroMasonry />
      <div className="pixnovel-hero-copy">
        <div className="pixnovel-hero-topbar">
          <Link to="/" className="pixnovel-brand">
            Whisk Studio
          </Link>
          <nav className="pixnovel-top-nav">
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
          <div className="pixnovel-user-chip">
            <span>{userEmail || "Signed in"}</span>
            <button type="button" className="btn-ghost px-4 py-1 text-xs" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </div>

        <p className="pixnovel-hero-kicker">PixNovel Studio</p>
        <h1 className="pixnovel-hero-title">
          Anime-first creation cockpit with cinematic flow controls
        </h1>
        <p className="pixnovel-hero-subtitle">
          Blend PixAI-style visual impact with NovelAI-style generation depth while
          keeping your existing Whisk, Story, and Music workflows in one place.
        </p>
        <div className="pixnovel-tag-row">
          {PIXNOVEL_STYLE_TAGS.map((tag) => (
            <span key={tag} className="pixnovel-tag-chip">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

const PixnovelWorkspace = ({ apiBaseUrl, activePane, userEmail, onLogout }) => {
  const [opsSnapshot, setOpsSnapshot] = useState({
    queue: [],
    signalCards: [],
    summary: DEFAULT_OPS_SUMMARY,
  });
  const [opsLoading, setOpsLoading] = useState(true);
  const [opsError, setOpsError] = useState("");

  const paneByKey = {
    whisk: <Whisk apiBaseUrl={apiBaseUrl} />,
    videos: <WhiskVideos apiBaseUrl={apiBaseUrl} />,
    director: (
      <Director
        apiBaseUrl={apiBaseUrl}
        opsSnapshot={opsSnapshot}
        opsLoading={opsLoading}
        opsError={opsError}
      />
    ),
    story: <Story apiBaseUrl={apiBaseUrl} forcedViewMode="reader" pageVariant="story" />,
    music: <StoryMusicLibrary apiBaseUrl={apiBaseUrl} />,
    about: <About />,
  };

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
    if (activePane === "music") {
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

    if (activePane === "whisk" || activePane === "about") {
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
      <PixnovelHero activePane={activePane} userEmail={userEmail} onLogout={onLogout} />

      <div className={`pixnovel-grid${isExpandedStudioPane ? " pixnovel-grid--expanded" : ""}`}>
        {isExpandedStudioPane ? null : sidePanel}

        <section
          className={`pixnovel-stage${isExpandedStudioPane ? " pixnovel-stage--expanded" : ""}`}
          key={activePane}
        >
          <header className="pixnovel-stage-head">
            <p className="pixnovel-stage-kicker">{PIXNOVEL_PANE_META[activePane].label}</p>
            <h2>{PIXNOVEL_PANE_META[activePane].subtitle}</h2>
          </header>
          <div className="pixnovel-stage-body">{paneByKey[activePane]}</div>
        </section>

        {isExpandedStudioPane ? null : feedPanel}
      </div>
    </div>
  );
};

const AppShell = ({ apiBaseUrl }) => {
  const { logout, user } = useAuth();
  const location = useLocation();
  const activePane = resolveActivePane(location.pathname);

  return (
    <div className="pixnovel-shell relative min-h-screen overflow-hidden">
      <div className="pixnovel-atmosphere" aria-hidden="true">
        <span className="pixnovel-orb pixnovel-orb--one" />
        <span className="pixnovel-orb pixnovel-orb--two" />
        <span className="pixnovel-grid-shimmer" />
      </div>

      <main className="pixnovel-main relative z-10">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <PixnovelWorkspace
                  apiBaseUrl={apiBaseUrl}
                  activePane="whisk"
                  userEmail={user?.email}
                  onLogout={logout}
                />
              </RequireAuth>
            }
          />
          <Route
            path="/whisk"
            element={
              <RequireAuth>
                <PixnovelWorkspace
                  apiBaseUrl={apiBaseUrl}
                  activePane="whisk"
                  userEmail={user?.email}
                  onLogout={logout}
                />
              </RequireAuth>
            }
          />
          <Route
            path="/videos"
            element={
              <RequireAuth>
                <PixnovelWorkspace
                  apiBaseUrl={apiBaseUrl}
                  activePane="videos"
                  userEmail={user?.email}
                  onLogout={logout}
                />
              </RequireAuth>
            }
          />
          <Route
            path="/story"
            element={
              <RequireAuth>
                <PixnovelWorkspace
                  apiBaseUrl={apiBaseUrl}
                  activePane="story"
                  userEmail={user?.email}
                  onLogout={logout}
                />
              </RequireAuth>
            }
          />
          <Route
            path="/director"
            element={
              <RequireAuth>
                <PixnovelWorkspace
                  apiBaseUrl={apiBaseUrl}
                  activePane="director"
                  userEmail={user?.email}
                  onLogout={logout}
                />
              </RequireAuth>
            }
          />
          <Route
            path="/music-library"
            element={
              <RequireAuth>
                <PixnovelWorkspace
                  apiBaseUrl={apiBaseUrl}
                  activePane="music"
                  userEmail={user?.email}
                  onLogout={logout}
                />
              </RequireAuth>
            }
          />
          <Route
            path="/about"
            element={
              <RequireAuth>
                <PixnovelWorkspace
                  apiBaseUrl={apiBaseUrl}
                  activePane="about"
                  userEmail={user?.email}
                  onLogout={logout}
                />
              </RequireAuth>
            }
          />
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
  const envCognito = {
    domain: process.env.REACT_APP_COGNITO_DOMAIN || "",
    clientId: process.env.REACT_APP_COGNITO_CLIENT_ID || "",
    userPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID || "",
    region: process.env.REACT_APP_COGNITO_REGION || "",
  };

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
        <AppShell apiBaseUrl={resolvedApiBaseUrl} />
      </Router>
    </AuthProvider>
  );
}

export default App;
