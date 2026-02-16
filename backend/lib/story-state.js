const {
  STORY_LOREBOOK_VERSION,
  STORY_STATE_VERSION,
  clampNumber,
  normalizeStringArray,
  uniqueStringArray,
  deepMerge,
} = require("./story-state/shared");
const {
  buildDefaultLorebook,
  resolveStoryLorebook,
} = require("./story-state/lorebook");
const {
  buildInitialStoryState,
  applyStateDelta,
} = require("./story-state/state-core");
const {
  TAG_METRIC_BIASES,
  applyMetricBias,
  metricInRange,
  matchesAll,
  matchesAny,
  computeEventWeight,
  pickWeighted,
  buildDirectorCue,
  selectStoryEvent,
  updateStoryMeta,
} = require("./story-state/event-selection");

module.exports = {
  STORY_LOREBOOK_VERSION,
  STORY_STATE_VERSION,
  clampNumber,
  normalizeStringArray,
  uniqueStringArray,
  deepMerge,
  buildDefaultLorebook,
  resolveStoryLorebook,
  buildInitialStoryState,
  applyStateDelta,
  TAG_METRIC_BIASES,
  applyMetricBias,
  metricInRange,
  matchesAll,
  matchesAny,
  computeEventWeight,
  pickWeighted,
  buildDirectorCue,
  selectStoryEvent,
  updateStoryMeta,
};
