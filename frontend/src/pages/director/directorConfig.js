export const EMPTY_SUMMARY = Object.freeze({
  queued: 0,
  running: 0,
  completed: 0,
  failed: 0,
  queueDepth: 0,
});

export const DIRECTOR_DEFAULT_THEME = "pink";
export const DIRECTOR_THEME_OPTIONS = Object.freeze([
  { key: "pink", label: "Pink" },
  { key: "purple", label: "Purple" },
  { key: "yellow", label: "Yellow" },
]);

export const normalizeDirectorTheme = (
  value,
  fallback = DIRECTOR_DEFAULT_THEME
) => {
  const normalized = String(value || "").trim().toLowerCase();
  return DIRECTOR_THEME_OPTIONS.some((theme) => theme.key === normalized)
    ? normalized
    : fallback;
};

export const buildSizeKey = (width, height) => `${Number(width)}x${Number(height)}`;

export const parseSizeKey = (sizeKey) => {
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

export const formatSizeLabel = (width, height) => {
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

export const formatTimestamp = (value) => {
  const parsed = Date.parse(value || "");
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toLocaleString();
};

export const splitTags = (value = "") =>
  String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const normalizeTagsForInput = (value = []) =>
  Array.isArray(value) ? value.join(", ") : "";

export const buildInitialDrafts = () => ({
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
  app: {
    theme: DIRECTOR_DEFAULT_THEME,
  },
});

export const DIRECTOR_SECTION_DEFS = Object.freeze([
  {
    key: "generation",
    id: "director-section-generation",
    tabLabel: "Generation",
    titleNumber: "01",
    title: "Generation Ops",
  },
  {
    key: "video",
    id: "director-section-video",
    tabLabel: "Video",
    titleNumber: "02",
    title: "Video Pipeline",
  },
  {
    key: "story",
    id: "director-section-story",
    tabLabel: "Story",
    titleNumber: "03",
    title: "Story Control",
  },
  {
    key: "sound",
    id: "director-section-sound",
    tabLabel: "Sound",
    titleNumber: "04",
    title: "Sound Governance",
  },
  {
    key: "experience",
    id: "director-section-experience",
    tabLabel: "Experience",
    titleNumber: "05",
    title: "Experience Controls",
  },
]);

export const DIRECTOR_SECTION_META = Object.freeze(
  DIRECTOR_SECTION_DEFS.reduce((accumulator, section) => {
    accumulator[section.key] = section;
    return accumulator;
  }, {})
);

export const DIRECTOR_OBSERVER_TOP_MARGIN_PCT = 20;
export const DIRECTOR_OBSERVER_BOTTOM_MARGIN_PCT = 60;
export const DIRECTOR_OBSERVER_THRESHOLD = [0.2, 0.4, 0.6];
export const DIRECTOR_TABS_ACTIVE_OFFSET_PX = 24;
