export const STORY_VIEW_MODE = {
  READER: "reader",
  DIRECTOR: "director",
};

export const STORY_GROUP_TYPES = [
  { value: "chapter", label: "Chapter" },
  { value: "act", label: "Act" },
  { value: "arc", label: "Arc" },
];

export const MEMORY_TABS = {
  TIMELINE: "timeline",
  RELEVANCE: "relevance",
};

export const CONTEXT_SOURCES_BY_MODE = {
  scene: ["Scene prompt"],
  summary: ["Story summary"],
  "summary+scene": ["Story summary", "Scene prompt"],
  "summary+latest": ["Story summary", "Latest reply"],
  "summary+recent": ["Story summary", "Recent turns"],
  recent: ["Recent turns"],
};

export const ILLUSTRATION_CONTEXT_OPTIONS = [
  { value: "scene", label: "Scene prompt only" },
  { value: "summary", label: "Summary only (Haiku)" },
  { value: "summary+scene", label: "Summary + scene" },
  { value: "summary+latest", label: "Summary + latest reply" },
  { value: "summary+recent", label: "Summary + recent turns" },
  { value: "recent", label: "Recent turns only" },
];

export const STORY_ILLUSTRATION_MODEL_OPTIONS = [
  {
    value: "wai-nsfw-illustrious-v11",
    label: "WAI NSFW Illustrious v11",
  },
  {
    value: "animagine",
    label: "Animagine XL v4 Opt",
  },
];
