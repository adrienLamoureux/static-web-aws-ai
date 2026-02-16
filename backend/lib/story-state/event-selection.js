const {
  clampNumber,
  normalizeStringArray,
  uniqueStringArray,
} = require("./shared");

const TAG_METRIC_BIASES = {
  quiet: { tension: -0.6, urgency: -0.3 },
  reflection: { fatigue: 0.5, tension: -0.2 },
  conflict: { tension: 0.7, urgency: 0.4 },
  danger: { tension: 0.6, urgency: 0.5 },
  discovery: { mystery: 0.6 },
  mystery: { mystery: 0.5 },
  travel: { progress: -0.4 },
  goal: { progress: -0.5, urgency: 0.3 },
};

const applyMetricBias = (weight, metrics = {}, bias = {}) => {
  let adjusted = weight;
  Object.entries(bias).forEach(([metric, factor]) => {
    const value =
      typeof metrics[metric] === "number"
        ? clampNumber(metrics[metric], 0, 1)
        : 0.5;
    const delta = (value - 0.5) * factor;
    adjusted *= 1 + delta;
  });
  return adjusted;
};

const metricInRange = (value, range) => {
  if (range === undefined || range === null) return true;
  if (typeof range === "number") return value >= range;
  if (typeof range !== "object") return true;
  if (typeof range.min === "number" && value < range.min) return false;
  if (typeof range.max === "number" && value > range.max) return false;
  return true;
};

const matchesAll = (needles = [], haystack = []) =>
  normalizeStringArray(needles).every((item) =>
    haystack.includes(item)
  );

const matchesAny = (needles = [], haystack = []) =>
  normalizeStringArray(needles).some((item) =>
    haystack.includes(item)
  );

const computeEventWeight = (event = {}, state = {}, selection = {}) => {
  const baseWeight =
    typeof event.baseWeight === "number" ? event.baseWeight : 1;
  if (baseWeight <= 0) return 0;

  const scene = state.scene || {};
  const metrics = state.metrics || {};
  const flags = uniqueStringArray(state.flags || []);
  const npcsPresent = uniqueStringArray(state.npcs?.present || []);
  const tags = uniqueStringArray(scene.tags || []);

  const when = event.when || {};
  if (
    Array.isArray(when.locationIds) &&
    when.locationIds.length > 0 &&
    !when.locationIds.includes(scene.locationId)
  ) {
    return 0;
  }
  if (
    Array.isArray(when.timeOfDay) &&
    when.timeOfDay.length > 0 &&
    !when.timeOfDay.includes(scene.timeOfDay)
  ) {
    return 0;
  }
  if (
    Array.isArray(when.weather) &&
    when.weather.length > 0 &&
    !when.weather.includes(scene.weather)
  ) {
    return 0;
  }
  if (
    Array.isArray(when.mood) &&
    when.mood.length > 0 &&
    !when.mood.includes(scene.mood)
  ) {
    return 0;
  }
  if (Array.isArray(when.sceneTagsAll) && when.sceneTagsAll.length > 0) {
    if (!matchesAll(when.sceneTagsAll, tags)) return 0;
  }
  if (Array.isArray(when.sceneTagsAny) && when.sceneTagsAny.length > 0) {
    if (!matchesAny(when.sceneTagsAny, tags)) return 0;
  }
  if (Array.isArray(when.flagsAll) && when.flagsAll.length > 0) {
    if (!matchesAll(when.flagsAll, flags)) return 0;
  }
  if (Array.isArray(when.flagsAny) && when.flagsAny.length > 0) {
    if (!matchesAny(when.flagsAny, flags)) return 0;
  }
  if (Array.isArray(when.npcsPresentAll) && when.npcsPresentAll.length > 0) {
    if (!matchesAll(when.npcsPresentAll, npcsPresent)) return 0;
  }
  if (Array.isArray(when.npcsPresentAny) && when.npcsPresentAny.length > 0) {
    if (!matchesAny(when.npcsPresentAny, npcsPresent)) return 0;
  }

  const metricsWhen = when.metrics || {};
  const metricKeys = Object.keys(metricsWhen);
  for (const key of metricKeys) {
    const value =
      typeof metrics[key] === "number" ? metrics[key] : 0;
    if (!metricInRange(value, metricsWhen[key])) return 0;
  }

  let weight = baseWeight;
  const eventTags = normalizeStringArray(event.tags || []);
  eventTags.forEach((tag) => {
    if (TAG_METRIC_BIASES[tag]) {
      weight = applyMetricBias(weight, metrics, TAG_METRIC_BIASES[tag]);
    }
  });

  const recentIds = selection.recentIds || [];
  const cooldownTurns =
    typeof event.cooldownTurns === "number"
      ? event.cooldownTurns
      : selection.cooldownTurns;
  const allowRepeat = selection.allowRepeat;
  if (recentIds.includes(event.id)) {
    if (!allowRepeat && cooldownTurns > 0) return 0;
    weight *= 0.2;
  }

  const initiativeFocus = selection.initiativeFocus;
  if (initiativeFocus) {
    if (event.initiative === "protagonist") {
      const bias =
        typeof selection.protagonistBias === "number"
          ? selection.protagonistBias
          : 1.4;
      weight *= bias;
    } else {
      weight *= 0.7;
    }
  }

  return Math.max(weight, 0);
};

const pickWeighted = (items = []) => {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1] || null;
};

const buildDirectorCue = (event) => {
  if (!event) return null;
  return {
    eventId: event.id,
    title: event.title,
    type: event.type,
    initiative: event.initiative,
    beat: event.prompt?.beat || "",
    focus: event.prompt?.focus || "",
    sensory: event.prompt?.sensory || "",
    hooks: event.prompt?.hooks || [],
  };
};

const selectStoryEvent = (lorebook = {}, storyState = {}, turnCount = 0) => {
  const events = Array.isArray(lorebook.events) ? lorebook.events : [];
  if (!events.length) {
    return { event: null, cue: null, initiativeFocus: false };
  }

  const policy = lorebook.rules?.eventSelection || {};
  const initiative = lorebook.rules?.initiative || {};
  const cooldownTurns =
    typeof policy.cooldownTurns === "number" ? policy.cooldownTurns : 2;
  const recentLimit =
    typeof policy.recentLimit === "number" ? policy.recentLimit : 4;
  const allowRepeat = Boolean(policy.allowRepeat);

  const recentEvents = Array.isArray(storyState?.meta?.recentEvents)
    ? storyState.meta.recentEvents
    : [];
  const recentIds = recentEvents
    .filter((item) =>
      typeof item?.turn === "number"
        ? turnCount - item.turn <= cooldownTurns
        : true
    )
    .map((item) => item.id)
    .filter(Boolean);

  const turnsSinceInitiative =
    typeof storyState?.meta?.turnsSinceInitiative === "number"
      ? storyState.meta.turnsSinceInitiative
      : 0;
  const minTurnsBetween =
    typeof initiative.minTurnsBetween === "number"
      ? initiative.minTurnsBetween
      : 1;
  const maxTurnsBetween =
    typeof initiative.maxTurnsBetween === "number"
      ? initiative.maxTurnsBetween
      : 3;
  const baseRate =
    typeof initiative.baseRate === "number" ? initiative.baseRate : 0.4;
  const protagonistBias =
    typeof initiative.protagonistBias === "number"
      ? initiative.protagonistBias
      : 1.4;
  const forceInitiative = turnsSinceInitiative >= maxTurnsBetween;
  const encourageInitiative =
    turnsSinceInitiative >= minTurnsBetween && Math.random() < baseRate;
  const initiativeFocus = forceInitiative || encourageInitiative;

  const weighted = events
    .map((event) => ({
      event,
      weight: computeEventWeight(event, storyState, {
        recentIds,
        cooldownTurns,
        allowRepeat,
        initiativeFocus,
        protagonistBias,
      }),
    }))
    .filter((item) => item.weight > 0);

  const picked =
    pickWeighted(weighted) ||
    events.find((event) => event.id === policy.fallbackEventId) ||
    events[0];
  const cue = buildDirectorCue(picked);
  return {
    event: picked,
    cue,
    initiativeFocus,
    recentLimit,
  };
};

const updateStoryMeta = (state = {}, event = null, turnCount = 0, recentLimit = 4) => {
  const next = {
    ...(state.meta || {}),
  };
  next.turn = turnCount;
  next.lastEventId = event?.id || "";
  const recentEvents = Array.isArray(state.meta?.recentEvents)
    ? state.meta.recentEvents.slice()
    : [];
  if (event?.id) {
    recentEvents.push({ id: event.id, turn: turnCount });
  }
  if (recentEvents.length > recentLimit) {
    next.recentEvents = recentEvents.slice(recentEvents.length - recentLimit);
  } else {
    next.recentEvents = recentEvents;
  }
  const turnsSinceInitiative =
    typeof state.meta?.turnsSinceInitiative === "number"
      ? state.meta.turnsSinceInitiative
      : 0;
  next.turnsSinceInitiative =
    event?.initiative === "protagonist" ? 0 : turnsSinceInitiative + 1;
  return next;
};



module.exports = {
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
