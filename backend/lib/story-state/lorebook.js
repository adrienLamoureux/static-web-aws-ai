const { STORY_LOREBOOK_VERSION, deepMerge } = require("./shared");
const { applyPresetLorebook } = require("./lorebook-presets");

const buildDefaultLorebook = (preset = {}, protagonistName = "Protagonist") => {
  const base = {
    version: STORY_LOREBOOK_VERSION,
    overview: {
      title: preset.name || "Untitled Story",
      synopsis: preset.synopsis || "",
      tone: "quiet, reflective, character-driven",
      themes: ["memory", "journey", "choice"],
    },
    initialScene: {
      locationId: "starting-point",
      locationName: "Starting point",
      description: preset.worldPrompt || preset.opening || "",
      timeOfDay: "late afternoon",
      weather: "clear",
      mood: "calm",
      direction: "forward",
      tags: ["journey", "quiet"],
      nearby: [],
      npcsPresent: [],
    },
    directions: ["north", "south", "east", "west", "uphill", "downhill"],
    locations: [],
    npcs: [],
    goals: {
      primary: "Continue the journey",
      secondary: [],
      longTerm: "Uncover the deeper meaning behind the quest",
    },
    rules: {
      initiative: {
        baseRate: 0.45,
        minTurnsBetween: 1,
        maxTurnsBetween: 3,
        protagonistBias: 1.6,
      },
      eventSelection: {
        cooldownTurns: 2,
        recentLimit: 4,
        allowRepeat: false,
        fallbackEventId: "quiet-beat",
      },
    },
    events: [
      {
        id: "quiet-beat",
        title: "A quiet beat",
        type: "quiet",
        baseWeight: 1,
        tags: ["quiet", "reflection"],
        initiative: "protagonist",
        prompt: {
          beat: `${protagonistName} notices a small detail in the environment and shares a quiet observation.`,
          focus: "environment detail + character reflection",
          sensory: "soft wind, distant sounds",
          hooks: ["invite a response from the player"],
        },
        effects: {
          metricsDelta: { tension: -0.05, mystery: 0.03 },
        },
      },
    ],
  };

  return applyPresetLorebook(preset, base, protagonistName);
};

const resolveStoryLorebook = (preset = {}, protagonistName = "Protagonist") => {
  const base = buildDefaultLorebook(preset, protagonistName);
  if (!preset?.lorebook) return base;
  return deepMerge(base, preset.lorebook);
};

module.exports = {
  buildDefaultLorebook,
  resolveStoryLorebook,
};
