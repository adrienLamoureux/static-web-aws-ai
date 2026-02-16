const STORY_LOREBOOK_VERSION = 1;
const STORY_STATE_VERSION = 1;

const clampNumber = (value, min, max) => {
  if (typeof value !== "number" || Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
};

const normalizeStringArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
};

const uniqueStringArray = (value) => {
  const seen = new Set();
  return normalizeStringArray(value).filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const deepMerge = (base, override) => {
  if (override === undefined || override === null) return base;
  if (Array.isArray(base) || Array.isArray(override)) {
    return Array.isArray(override) ? override : base;
  }
  if (
    typeof base !== "object" ||
    base === null ||
    typeof override !== "object" ||
    override === null
  ) {
    return override;
  }
  const next = { ...base };
  Object.keys(override).forEach((key) => {
    next[key] = deepMerge(base[key], override[key]);
  });
  return next;
};

module.exports = {
  STORY_LOREBOOK_VERSION,
  STORY_STATE_VERSION,
  clampNumber,
  normalizeStringArray,
  uniqueStringArray,
  deepMerge,
};
