const { deepMerge } = require("./shared");

const applyPresetLorebook = (preset = {}, base = {}, protagonistName = "Protagonist") => {
  if (preset.id === "frieren-road") {
    return deepMerge(base, {
      overview: {
        tone: "gentle, wistful, contemplative",
        themes: ["journey", "memory", "quiet companionship"],
      },
      initialScene: {
        locationId: "road-valley",
        locationName: "Misty valley road",
        description:
          "A soft mist settles over a winding road, with distant bells and open fields.",
        timeOfDay: "late afternoon",
        weather: "mist",
        mood: "quiet",
        direction: "northbound",
        tags: ["travel", "quiet", "countryside"],
        nearby: ["ridge-overlook", "village-outer"],
      },
      locations: [
        {
          id: "road-valley",
          name: "Misty valley road",
          description: "A winding path through open fields and low hills.",
          tags: ["travel", "open", "quiet"],
          neighbors: ["ridge-overlook", "village-outer"],
        },
        {
          id: "ridge-overlook",
          name: "Ridge overlook",
          description: "A high path with a view of lakes and distant mountains.",
          tags: ["scenic", "windy", "quiet"],
          neighbors: ["road-valley"],
        },
        {
          id: "village-outer",
          name: "Village outskirts",
          description: "Stone roads, lanterns, and soft smoke from chimneys.",
          tags: ["settlement", "warm", "safe"],
          neighbors: ["road-valley"],
        },
      ],
      npcs: [
        {
          id: "traveler",
          name: "Traveling merchant",
          role: "wayfarer",
          disposition: "cautious but friendly",
          tags: ["road", "rumors"],
          goals: ["trade", "share rumors"],
        },
        {
          id: "elder",
          name: "Village elder",
          role: "guide",
          disposition: "warm, deliberate",
          tags: ["village", "knowledge"],
          goals: ["warn travelers", "protect village"],
        },
      ],
      goals: {
        primary: "Reach the next village before nightfall",
        secondary: ["Decide on the ridge or village path"],
        longTerm: "Trace the echoes of ancient magic across the countryside",
      },
      events: [
        {
          id: "road-choice",
          title: "A fork in the road",
          type: "choice",
          baseWeight: 1.2,
          tags: ["travel", "choice", "quiet"],
          initiative: "protagonist",
          when: { locationIds: ["road-valley"], sceneTagsAny: ["travel"] },
          prompt: {
            beat:
              "The road splits toward a ridge and a village, inviting a calm decision.",
            focus: "path choice + landscape",
            sensory: "distant bells, soft wind",
            hooks: ["ridge view", "village lights"],
          },
          effects: {
            flags: { add: ["path-choice"] },
            goals: { activeAdd: ["Choose the route forward"] },
            metricsDelta: { progress: 0.05 },
          },
        },
        {
          id: "passing-traveler",
          title: "A passing traveler",
          type: "npc",
          baseWeight: 0.9,
          tags: ["npc", "rumor", "travel"],
          initiative: "npc",
          when: { locationIds: ["road-valley", "village-outer"] },
          prompt: {
            beat:
              "A traveler crosses paths and offers a small rumor about nearby ruins.",
            focus: "npc encounter + hint",
            sensory: "footsteps on stone, muted chatter",
            hooks: ["rumor", "direction hint"],
          },
          effects: {
            npcs: { presentAdd: ["traveler"] },
            flags: { add: ["rumor-ruins"] },
            metricsDelta: { mystery: 0.08 },
          },
        },
        {
          id: "weather-shift",
          title: "Weather shifts",
          type: "environment",
          baseWeight: 0.8,
          tags: ["environment", "travel"],
          initiative: "environment",
          prompt: {
            beat: "The mist thickens, changing the mood and visibility.",
            focus: "environment shift",
            sensory: "cool damp air, muted sounds",
            hooks: ["slower pace", "closer voices"],
          },
          effects: {
            scene: { weather: "thick mist", tagsAdd: ["mist"] },
            metricsDelta: { tension: 0.05 },
          },
        },
        {
          id: "quiet-memory",
          title: "A quiet memory",
          type: "reflection",
          baseWeight: 0.95,
          tags: ["quiet", "reflection", "memory"],
          initiative: "protagonist",
          when: { sceneTagsAny: ["quiet", "countryside"] },
          prompt: {
            beat:
              `${protagonistName} shares a small memory tied to the landscape.`,
            focus: "character reflection",
            sensory: "soft light, distant birds",
            hooks: ["memory link", "gentle question"],
          },
          effects: {
            metricsDelta: { mystery: 0.04, tension: -0.03 },
          },
        },
        {
          id: "ruin-hint",
          title: "A hint of ruins",
          type: "discovery",
          baseWeight: 0.85,
          tags: ["discovery", "mystery"],
          initiative: "protagonist",
          when: { flagsAny: ["rumor-ruins"] },
          prompt: {
            beat:
              "A distant silhouette or carved stone hints at ancient ruins nearby.",
            focus: "discovery + environment",
            sensory: "faint glow, stone texture",
            hooks: ["investigation", "detour"],
          },
          effects: {
            goals: { activeAdd: ["Investigate the ruins"] },
            metricsDelta: { mystery: 0.1 },
          },
        },
      ],
    });
  }

  if (preset.id === "moonlit-tavern") {
    return deepMerge(base, {
      overview: {
        tone: "warm, intimate, slowly unfolding",
        themes: ["rumor", "comfort", "choice"],
      },
      initialScene: {
        locationId: "tavern-hall",
        locationName: "Moonlit tavern",
        description:
          "A warm tavern glow contrasts with rain-soaked windows and muted chatter.",
        timeOfDay: "night",
        weather: "rain",
        mood: "cozy",
        direction: "inward",
        tags: ["interior", "warm", "rain"],
        nearby: ["tavern-backroom", "rainy-alley"],
      },
      locations: [
        {
          id: "tavern-hall",
          name: "Tavern hall",
          description: "Lantern light, wooden beams, hushed conversations.",
          tags: ["interior", "warm"],
          neighbors: ["tavern-backroom", "rainy-alley"],
        },
        {
          id: "tavern-backroom",
          name: "Backroom",
          description: "A quieter space with hidden whispers and secrets.",
          tags: ["interior", "secret"],
          neighbors: ["tavern-hall"],
        },
        {
          id: "rainy-alley",
          name: "Rainy alley",
          description: "Wet stone, dripping eaves, and shadowed corners.",
          tags: ["exterior", "rain", "urban"],
          neighbors: ["tavern-hall"],
        },
      ],
      npcs: [
        {
          id: "traveler",
          name: "Mysterious traveler",
          role: "informant",
          disposition: "guarded",
          tags: ["rumor", "quest"],
          goals: ["test trust", "share clue"],
        },
        {
          id: "bartender",
          name: "Bartender",
          role: "host",
          disposition: "steady, observant",
          tags: ["tavern", "local"],
          goals: ["keep peace", "share local lore"],
        },
      ],
      goals: {
        primary: "Learn about the old ruins from the traveler",
        secondary: ["Decide whether to trust the rumor"],
        longTerm: "Unlock the hidden quest tied to the ruins",
      },
      events: [
        {
          id: "whispered-rumor",
          title: "Whispered rumor",
          type: "npc",
          baseWeight: 1.05,
          tags: ["npc", "rumor", "mystery"],
          initiative: "npc",
          when: { locationIds: ["tavern-hall", "tavern-backroom"] },
          prompt: {
            beat:
              "A traveler shares a rumor about the ruins, testing the mood.",
            focus: "npc encounter + clue",
            sensory: "low voices, clinking cups",
            hooks: ["cryptic hint", "request"],
          },
          effects: {
            npcs: { presentAdd: ["traveler"] },
            flags: { add: ["rumor-ruins"] },
            metricsDelta: { mystery: 0.1 },
          },
        },
        {
          id: "lantern-flicker",
          title: "Lanterns flicker",
          type: "environment",
          baseWeight: 0.85,
          tags: ["environment", "quiet"],
          initiative: "environment",
          prompt: {
            beat:
              "The lanterns flicker, adding a hush to the tavern's warmth.",
            focus: "environment shift",
            sensory: "warm glow, rain tapping glass",
            hooks: ["subtle tension", "closer conversation"],
          },
          effects: {
            scene: { mood: "intimate" },
            metricsDelta: { tension: 0.04 },
          },
        },
        {
          id: "sealed-letter",
          title: "A sealed letter",
          type: "discovery",
          baseWeight: 0.9,
          tags: ["discovery", "mystery"],
          initiative: "protagonist",
          when: { sceneTagsAny: ["interior", "warm"] },
          prompt: {
            beat:
              `${protagonistName} notices a sealed letter tied to the ruins.`,
            focus: "discovery + prop",
            sensory: "wax seal, old parchment",
            hooks: ["investigation", "decision"],
          },
          effects: {
            flags: { add: ["letter-found"] },
            goals: { activeAdd: ["Decipher the letter"] },
            metricsDelta: { mystery: 0.08 },
          },
        },
        {
          id: "backroom-invite",
          title: "Backroom invitation",
          type: "choice",
          baseWeight: 0.95,
          tags: ["choice", "npc"],
          initiative: "npc",
          when: { flagsAny: ["rumor-ruins"] },
          prompt: {
            beat: "An invitation to the backroom suggests a private talk.",
            focus: "npc request + decision",
            sensory: "muffled voices, warm shadows",
            hooks: ["trust", "risk"],
          },
          effects: {
            goals: { activeAdd: ["Decide on the backroom meeting"] },
            metricsDelta: { tension: 0.06 },
          },
        },
      ],
    });
  }

  if (preset.id === "celestial-ruins") {
    return deepMerge(base, {
      overview: {
        tone: "ethereal, ancient, quietly tense",
        themes: ["mystery", "wonder", "ancient power"],
      },
      initialScene: {
        locationId: "ruins-entrance",
        locationName: "Celestial ruins",
        description:
          "Ancient stones float above the clouds, glowing with starlit runes.",
        timeOfDay: "night",
        weather: "clear",
        mood: "awe",
        direction: "upward",
        tags: ["ancient", "mystic", "high-altitude"],
        nearby: ["ruins-hall", "starlit-platform"],
      },
      locations: [
        {
          id: "ruins-entrance",
          name: "Ruins entrance",
          description: "A broad stairway carved with glowing runes.",
          tags: ["ancient", "mystic"],
          neighbors: ["ruins-hall"],
        },
        {
          id: "ruins-hall",
          name: "Ruins hall",
          description: "Echoing chambers with suspended stone bridges.",
          tags: ["ancient", "echo"],
          neighbors: ["ruins-entrance", "starlit-platform"],
        },
        {
          id: "starlit-platform",
          name: "Starlit platform",
          description: "An open platform bathed in pale starlight.",
          tags: ["open", "mystic"],
          neighbors: ["ruins-hall"],
        },
      ],
      npcs: [
        {
          id: "sentinel",
          name: "Silent sentinel",
          role: "guardian spirit",
          disposition: "watchful",
          tags: ["ancient", "guardian"],
          goals: ["test worthiness", "protect relic"],
        },
      ],
      goals: {
        primary: "Trace the runes and locate the relic",
        secondary: ["Understand the ruins' purpose"],
        longTerm: "Recover the ancient relic safely",
      },
      events: [
        {
          id: "runic-pulse",
          title: "Runic pulse",
          type: "environment",
          baseWeight: 1.05,
          tags: ["environment", "mystery", "ancient"],
          initiative: "environment",
          prompt: {
            beat:
              "The runes pulse with light, hinting at a hidden path or pattern.",
            focus: "environment shift + mystery",
            sensory: "cold light, humming stones",
            hooks: ["investigate pattern", "touch the runes"],
          },
          effects: {
            metricsDelta: { mystery: 0.1 },
          },
        },
        {
          id: "echoing-voice",
          title: "Echoing voice",
          type: "npc",
          baseWeight: 0.9,
          tags: ["npc", "ancient", "warning"],
          initiative: "npc",
          prompt: {
            beat:
              "A disembodied voice offers a warning about the relic's cost.",
            focus: "npc encounter + warning",
            sensory: "echoing whispers, distant chimes",
            hooks: ["risk", "resolve"],
          },
          effects: {
            npcs: { presentAdd: ["sentinel"] },
            metricsDelta: { tension: 0.08 },
          },
        },
        {
          id: "fractured-stair",
          title: "Fractured stair",
          type: "conflict",
          baseWeight: 0.85,
          tags: ["conflict", "danger"],
          initiative: "environment",
          when: { locationIds: ["ruins-hall", "starlit-platform"] },
          prompt: {
            beat:
              "A stone stair fractures, forcing careful movement or quick action.",
            focus: "hazard + movement",
            sensory: "cracking stone, falling dust",
            hooks: ["leap", "stabilize"],
          },
          effects: {
            metricsDelta: { tension: 0.12, urgency: 0.08 },
          },
        },
        {
          id: "starlit-relic",
          title: "Starlit relic",
          type: "discovery",
          baseWeight: 0.95,
          tags: ["discovery", "goal", "mystery"],
          initiative: "protagonist",
          when: { sceneTagsAny: ["mystic", "open"] },
          prompt: {
            beat:
              `${protagonistName} notices a relic glinting under starlight.`,
            focus: "discovery + relic",
            sensory: "cold light, metallic shimmer",
            hooks: ["approach", "inspect"],
          },
          effects: {
            goals: { activeAdd: ["Secure the relic"] },
            metricsDelta: { mystery: 0.08, progress: 0.1 },
          },
        },
      ],
    });
  }

  return base;
};

module.exports = {
  applyPresetLorebook,
};
