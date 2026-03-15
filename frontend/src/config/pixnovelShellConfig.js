import PIXNOVEL_MASONRY_DEFAULTS from "../data/pixnovel-masonry-defaults.json";

export const mergeCognitoConfig = (base = {}, override = {}) => ({
  domain: override.domain || base.domain || "",
  clientId: override.clientId || base.clientId || "",
  userPoolId: override.userPoolId || base.userPoolId || "",
  region: override.region || base.region || "",
});

export const PIXNOVEL_PANE_META = {
  shared: {
    label: "Library",
    route: "/",
    subtitle: "Community-shared image and video library",
  },
  whisk: {
    label: "Generator",
    route: "/whisk",
    subtitle: "Realtime visual prompt studio",
  },
  lora: {
    label: "LoRA",
    route: "/lora",
    subtitle: "Character LoRA catalog and profile management",
  },
  videos: {
    label: "Videos",
    route: "/videos",
    subtitle: "Generated clips and playback controls",
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
  director: {
    label: "Director",
    route: "/director",
    subtitle: "Global orchestration across all creative workflows",
  },
  about: {
    label: "Core",
    route: "/about",
    subtitle: "Project profile and architecture brief",
  },
};

export const PIXNOVEL_MODEL_OPTIONS = [
  "Animagine XL v4 Opt",
  "WAI NSFW Illustrious v11",
];

export const PIXNOVEL_IMAGE_SIZE_OPTIONS = ["Portrait", "Square", "16:9"];
export const PIXNOVEL_SCHEDULER_OPTIONS = ["Euler a", "DPM++ 2M Karras"];
export const PIXNOVEL_MODEL_KEY_MAP = {
  "Animagine XL v4 Opt": "animagine",
  "WAI NSFW Illustrious v11": "wai-nsfw-illustrious-v11",
};
export const PIXNOVEL_SIZE_DIMENSIONS_MAP = {
  Portrait: { width: 768, height: 1024 },
  Square: { width: 1024, height: 1024 },
  "16:9": { width: 1280, height: 720 },
};
export const PIXNOVEL_FALLBACK_NEGATIVE_PROMPT =
  "lowres, bad anatomy, bad hands, text, watermark, blurry";

export const DEFAULT_OPS_SUMMARY = {
  queueDepth: 0,
  queued: 0,
  running: 0,
  completed: 0,
  failed: 0,
  recentFailedJobs: 0,
  errorRatePct: 0,
  averageRenderSeconds: null,
};
export const PIXNOVEL_CONTEXT_PANEL_CONFIG = {
  shared: {
    kicker: "Shared",
    title: "Community Library Focus",
    sections: [
      {
        label: "Discovery",
        items: [
          { title: "Images", value: "Shared wall with fast search" },
          { title: "Favorites", value: "Pin reusable visual references" },
          { title: "Videos", value: "Review community clips quickly" },
        ],
      },
      {
        label: "Contribute",
        items: [
          { title: "From Generator", value: "Use share action on image cards" },
          { title: "From Videos", value: "Share completed clips to library" },
          { title: "Refresh", value: "Pull latest public assets instantly" },
        ],
      },
    ],
    footer: "Shared library is the default landing page for curated assets.",
  },
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
  lora: {
    kicker: "LoRA",
    title: "LoRA Management",
    sections: [
      {
        label: "Catalog Sync",
        items: [
          { title: "Source", value: "CivitAI search and sync" },
          { title: "Filter", value: "Query, base model, NSFW toggle" },
          { title: "Curate", value: "Attach to character modalities" },
        ],
      },
      {
        label: "Profile Binding",
        items: [
          { title: "Character", value: "Story character id mapping" },
          { title: "Modality", value: "Separate image and video LoRA sets" },
          { title: "Strength", value: "Per-LoRA strength tuning (0-2)" },
        ],
      },
    ],
    footer: "Profiles are consumed by Replicate generation when a LoRA profile is selected.",
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
export const PIXNOVEL_FEED_CONFIG = {
  shared: {
    queueTitle: "Share Queue",
    signalTitle: "Library Signals",
    loadingText: "Loading shared library signals...",
    emptyText: "No queue items for shared library.",
    signalEmptyText: "No shared library signals available yet.",
  },
  whisk: {
    queueTitle: "Render Queue",
    signalTitle: "Creation Signals",
    loadingText: "Loading operational queue...",
    emptyText: "No active jobs yet.",
    signalEmptyText: "No signals available yet.",
  },
  lora: {
    queueTitle: "LoRA Queue",
    signalTitle: "LoRA Signals",
    loadingText: "Loading LoRA operations...",
    emptyText: "No active LoRA-related jobs.",
    signalEmptyText: "No LoRA signals available yet.",
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

export const PIXNOVEL_MASONRY_BASE_IMAGES = (PIXNOVEL_MASONRY_DEFAULTS || [])
  .map((item, index) => ({
    id: item?.id || `default-${index + 1}`,
    src: item?.src || "",
  }))
  .filter((item) => item.src);

export const PIXNOVEL_MASONRY_COLUMNS = [
  {
    id: "column-a",
    durationSeconds: 86,
    startOffset: "0%",
  },
  {
    id: "column-b",
    durationSeconds: 94,
    startOffset: "-11%",
  },
  {
    id: "column-c",
    durationSeconds: 102,
    startOffset: "-22%",
  },
  {
    id: "column-d",
    durationSeconds: 110,
    startOffset: "-33%",
  },
];

export const PIXNOVEL_MASONRY_REPEAT_COUNT = 3;
export const PIXNOVEL_OPS_POLL_INTERVAL_MS = 12000;
export const PIXNOVEL_DEFAULT_CHARACTER = "Frieren from Beyond Journey's End";
export const PIXNOVEL_THEME_STORAGE_KEY = "pixnovel_theme";
export const PIXNOVEL_DEFAULT_THEME = "pink";
export const PIXNOVEL_ALLOWED_THEMES = ["pink", "purple", "yellow"];

export const normalizePixnovelTheme = (
  value,
  fallback = PIXNOVEL_DEFAULT_THEME
) => {
  const normalized = String(value || "").trim().toLowerCase();
  return PIXNOVEL_ALLOWED_THEMES.includes(normalized) ? normalized : fallback;
};

export const mapMasonryApiImages = (images = []) =>
  (Array.isArray(images) ? images : [])
    .map((item, index) => ({
      id: item?.key || `global-${index + 1}`,
      src: item?.url || "",
    }))
    .filter((item) => item.src);

export const uniqueNonEmpty = (values = []) => {
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

export const buildPixnovelPositivePrompt = ({
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

export const buildLoopedMasonryImages = (images, repeatCount) => {
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

export const isVideoQueueItem = (item) =>
  String(item?.detail || "").toLowerCase().includes("video");

export const formatAverageRender = (seconds) =>
  Number.isFinite(Number(seconds)) ? `${Math.round(Number(seconds))}s` : "n/a";

export const summarizeQueue = (items = []) =>
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
