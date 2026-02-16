const {
  STORY_STATE_VERSION,
  clampNumber,
  normalizeStringArray,
  uniqueStringArray,
} = require("./shared");

const buildInitialStoryState = (lorebook = {}) => {
  const scene = lorebook.initialScene || {};
  const goals = lorebook.goals || {};
  return {
    version: STORY_STATE_VERSION,
    scene: {
      locationId: scene.locationId || "starting-point",
      locationName: scene.locationName || "Starting point",
      description: scene.description || "",
      timeOfDay: scene.timeOfDay || "late afternoon",
      weather: scene.weather || "clear",
      mood: scene.mood || "calm",
      direction: scene.direction || "forward",
      tags: uniqueStringArray(scene.tags || []),
      nearby: uniqueStringArray(scene.nearby || []),
    },
    metrics: {
      tension: clampNumber(scene.tension ?? lorebook?.initialMetrics?.tension ?? 0.2, 0, 1),
      mystery: clampNumber(scene.mystery ?? lorebook?.initialMetrics?.mystery ?? 0.35, 0, 1),
      urgency: clampNumber(scene.urgency ?? lorebook?.initialMetrics?.urgency ?? 0.2, 0, 1),
      progress: clampNumber(scene.progress ?? lorebook?.initialMetrics?.progress ?? 0.1, 0, 1),
      fatigue: clampNumber(scene.fatigue ?? lorebook?.initialMetrics?.fatigue ?? 0.1, 0, 1),
    },
    goals: {
      active: uniqueStringArray([
        goals.primary,
        ...(goals.secondary || []),
      ]),
      completed: [],
    },
    flags: [],
    npcs: {
      present: uniqueStringArray(scene.npcsPresent || []),
    },
    meta: {
      turn: 0,
      lastEventId: "",
      recentEvents: [],
      turnsSinceInitiative: 0,
    },
  };
};

const applyStateDelta = (state = {}, delta = {}) => {
  if (!delta || typeof delta !== "object") return state;
  const next = {
    ...state,
    scene: { ...(state.scene || {}) },
    metrics: { ...(state.metrics || {}) },
    goals: { ...(state.goals || {}) },
    flags: uniqueStringArray(state.flags || []),
    npcs: { ...(state.npcs || {}) },
    meta: { ...(state.meta || {}) },
  };

  const sceneDelta = delta.scene || {};
  if (typeof sceneDelta.locationId === "string") next.scene.locationId = sceneDelta.locationId;
  if (typeof sceneDelta.locationName === "string") next.scene.locationName = sceneDelta.locationName;
  if (typeof sceneDelta.description === "string") next.scene.description = sceneDelta.description;
  if (typeof sceneDelta.timeOfDay === "string") next.scene.timeOfDay = sceneDelta.timeOfDay;
  if (typeof sceneDelta.weather === "string") next.scene.weather = sceneDelta.weather;
  if (typeof sceneDelta.mood === "string") next.scene.mood = sceneDelta.mood;
  if (typeof sceneDelta.direction === "string") next.scene.direction = sceneDelta.direction;

  const currentTags = uniqueStringArray(next.scene.tags || []);
  const addTags = normalizeStringArray(sceneDelta.tagsAdd || []);
  const removeTags = new Set(normalizeStringArray(sceneDelta.tagsRemove || []));
  next.scene.tags = uniqueStringArray(
    currentTags
      .filter((tag) => !removeTags.has(tag))
      .concat(addTags)
  );

  const currentNearby = uniqueStringArray(next.scene.nearby || []);
  const addNearby = normalizeStringArray(sceneDelta.nearbyAdd || []);
  const removeNearby = new Set(normalizeStringArray(sceneDelta.nearbyRemove || []));
  next.scene.nearby = uniqueStringArray(
    currentNearby
      .filter((item) => !removeNearby.has(item))
      .concat(addNearby)
  );

  const metricsDelta = delta.metricsDelta || {};
  const metricsSet = delta.metrics || {};
  ["tension", "mystery", "urgency", "progress", "fatigue"].forEach((key) => {
    const baseValue =
      typeof next.metrics[key] === "number" ? next.metrics[key] : 0;
    if (typeof metricsDelta[key] === "number") {
      next.metrics[key] = clampNumber(baseValue + metricsDelta[key], 0, 1);
    }
    if (typeof metricsSet[key] === "number") {
      next.metrics[key] = clampNumber(metricsSet[key], 0, 1);
    }
  });

  const goalsDelta = delta.goals || {};
  const activeGoals = uniqueStringArray(next.goals.active || []);
  const completedGoals = uniqueStringArray(next.goals.completed || []);
  const addGoals = normalizeStringArray(goalsDelta.activeAdd || []);
  const removeGoals = new Set(normalizeStringArray(goalsDelta.activeRemove || []));
  const completeGoals = normalizeStringArray(goalsDelta.completedAdd || []);
  next.goals.active = uniqueStringArray(
    activeGoals
      .filter((goal) => !removeGoals.has(goal))
      .concat(addGoals)
      .filter((goal) => !completeGoals.includes(goal))
  );
  next.goals.completed = uniqueStringArray(
    completedGoals.concat(completeGoals)
  );

  const flagsDelta = delta.flags || {};
  const flagsAdd = normalizeStringArray(flagsDelta.add || []);
  const flagsRemove = new Set(normalizeStringArray(flagsDelta.remove || []));
  next.flags = uniqueStringArray(
    next.flags
      .filter((flag) => !flagsRemove.has(flag))
      .concat(flagsAdd)
  );

  const npcsDelta = delta.npcs || {};
  const presentNpcs = uniqueStringArray(next.npcs.present || []);
  const npcsAdd = normalizeStringArray(npcsDelta.presentAdd || []);
  const npcsRemove = new Set(normalizeStringArray(npcsDelta.presentRemove || []));
  next.npcs.present = uniqueStringArray(
    presentNpcs
      .filter((npc) => !npcsRemove.has(npc))
      .concat(npcsAdd)
  );

  return next;
};


module.exports = {
  buildInitialStoryState,
  applyStateDelta,
};
