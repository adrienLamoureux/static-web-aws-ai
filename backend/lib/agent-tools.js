"use strict";

/**
 * agent-tools — Bedrock Converse tool specs + dispatcher for Agent mode.
 *
 * v1.2 ships seven tools:
 *   - generate_image       (Replicate, server-dispatch)
 *   - set_theme            (client-action — applied via ThemeContext)
 *   - continue_story       (intent — user confirms)
 *   - illustrate_scene     (intent — user confirms)
 *   - recall_favorites     (server-dispatch — user's IMG history)
 *   - generate_music       (intent — story-scoped, user confirms)
 *   - browse_gallery       (server-dispatch — public shared images)
 *
 * The heavy generate_image dispatcher lives in `./agent-tools/generate-image.js`.
 * The smaller dispatchers live in `./agent-tools/dispatchers.js`. This file
 * holds the tool specs (sent to Bedrock) and the top-level dispatch router.
 */

const {
  STYLE_TO_MODEL_KEY,
  ASPECT_TO_SIZE,
  dispatchGenerateImage,
} = require("./agent-tools/generate-image");
const {
  SUPPORTED_THEMES,
  dispatchSetTheme,
  dispatchContinueStory,
  dispatchIllustrateScene,
  dispatchRecallFavorites,
  dispatchGenerateMusic,
  dispatchBrowseGallery,
} = require("./agent-tools/dispatchers");

// ─── generate_image tool spec ──────────────────────────────────────────────
const generateImageToolSpec = {
  toolSpec: {
    name: "generate_image",
    description:
      "Generate an image. Pick sensible defaults for unspecified fields based on the user's intent. " +
      "Style 'anime' is the default — use 'manga' for ink-heavy/B&W vibes, 'chibi' for cute SD-style " +
      "characters, 'photoreal' for cinematic/realistic shots. Aspect '3:4' is the portrait default; " +
      "use '16:9' for wide cinematic shots and '1:1' for square posts.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "A concise English Stable Diffusion prompt (≤500 chars).",
          },
          style: {
            type: "string",
            enum: ["anime", "photoreal", "manga", "chibi"],
            description: "Visual style. Defaults to 'anime'.",
          },
          aspect: {
            type: "string",
            enum: ["1:1", "3:4", "16:9"],
            description: "Image aspect ratio. Defaults to '3:4'.",
          },
        },
        required: ["prompt"],
      },
    },
  },
};

// ─── set_theme tool spec (client-action) ──────────────────────────────────
const setThemeToolSpec = {
  toolSpec: {
    name: "set_theme",
    description:
      "Switch the app's visual theme. Use when the user asks for a different mood/vibe " +
      "('something darker', 'more romantic', 'spookier'). Map their request to the closest theme. " +
      "Themes: sakura (pink/warm), moonrise (cool blue), bamboo (green), ember (orange/warm), " +
      "void (black/purple), glacier (icy blue), dusk (twilight), aurora (multicolor), " +
      "crimson (deep red), storm (slate grey).",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          theme: { type: "string", enum: SUPPORTED_THEMES, description: "Theme id." },
          brightness: {
            type: "string",
            enum: ["dark", "light"],
            description: "Optional brightness mode. Defaults to keeping the current.",
          },
        },
        required: ["theme"],
      },
    },
  },
};

// ─── continue_story tool spec ──────────────────────────────────────────────
const continueStoryToolSpec = {
  toolSpec: {
    name: "continue_story",
    description:
      "Continue an active story session by adding the next user turn. Use when the user " +
      "naturally narrates a story beat ('let's have her open the door', 'they fall asleep'). " +
      "Returns a confirm intent — the frontend surfaces a button so the user can verify before " +
      "the turn is committed to their Chronicle session.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          sessionId: {
            type: "string",
            description:
              "Story session id. Pass the most recent if you're unsure — the user will confirm.",
          },
          content: {
            type: "string",
            description: "The story beat to add as the user's next turn (≤400 chars).",
          },
        },
        required: ["content"],
      },
    },
  },
};

// ─── illustrate_scene tool spec ────────────────────────────────────────────
const illustrateSceneToolSpec = {
  toolSpec: {
    name: "illustrate_scene",
    description:
      "Generate an illustration for a specific story scene. Use when the user wants to see " +
      "a scene they've already written ('show me chapter 2', 'illustrate the rooftop fight'). " +
      "Returns a confirm intent — frontend surfaces a button so the user can verify the target " +
      "scene before the illustration job is queued.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Story session id." },
          sceneId: { type: "string", description: "Scene id within the session." },
          style: {
            type: "string",
            enum: ["anime", "manga", "photoreal", "chibi"],
            description: "Visual style for the illustration. Defaults to the agent's lastStyle.",
          },
        },
        required: ["sessionId", "sceneId"],
      },
    },
  },
};

// ─── recall_favorites tool spec ────────────────────────────────────────────
const recallFavoritesToolSpec = {
  toolSpec: {
    name: "recall_favorites",
    description:
      "Pull the user's recent image generations so you can spot patterns in their taste and " +
      "reference them in your next reply. Use when the user mentions 'my favorites', 'what I " +
      "usually like', or asks for variations on prior style. Returns prompts + thumbnails — " +
      "use the prompts to detect themes (e.g. 'lots of forest scenes lately').",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max items to recall (1–12, default 8)." },
        },
      },
    },
  },
};

// ─── generate_music tool spec ──────────────────────────────────────────────
const generateMusicToolSpec = {
  toolSpec: {
    name: "generate_music",
    description:
      "Generate background music for a story scene. Use when the user asks for music, a theme, " +
      "or wants to score a scene ('something melancholic for chapter 3'). The user confirms before " +
      "the music job is queued. Requires an active story session — falls back to the user's most " +
      "recent session + last scene if not specified.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          mood: {
            type: "string",
            description: "Single-word mood (melancholic, epic, peaceful, playful, tense, romantic).",
          },
          description: {
            type: "string",
            description: "Short phrase describing the music (≤200 chars).",
          },
          sessionId: { type: "string", description: "Story session id (optional)." },
          sceneId: { type: "string", description: "Scene id within the session (optional)." },
        },
        required: ["mood"],
      },
    },
  },
};

// ─── browse_gallery tool spec ──────────────────────────────────────────────
const browseGalleryToolSpec = {
  toolSpec: {
    name: "browse_gallery",
    description:
      "Pull recent images from the public shared gallery to show the user what others are making " +
      "for inspiration. Use when the user asks 'what's been popular', 'show me ideas', or seems " +
      "stuck for direction. Returns up to 12 thumbnails. The closing turn lets you comment on " +
      "what you see.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max items (1–12, default 8)." },
        },
      },
    },
  },
};

const ALL_TOOL_SPECS = [
  generateImageToolSpec,
  setThemeToolSpec,
  continueStoryToolSpec,
  illustrateSceneToolSpec,
  recallFavoritesToolSpec,
  generateMusicToolSpec,
  browseGalleryToolSpec,
];

// ─── Top-level router ──────────────────────────────────────────────────────
const dispatchTool = async ({ name, args = {}, deps, userId }) => {
  if (name === "generate_image") return dispatchGenerateImage({ args, deps, userId });
  if (name === "set_theme") return dispatchSetTheme({ args, deps, userId });
  if (name === "continue_story") return dispatchContinueStory({ args, deps, userId });
  if (name === "illustrate_scene") return dispatchIllustrateScene({ args, deps, userId });
  if (name === "recall_favorites") return dispatchRecallFavorites({ args, deps, userId });
  if (name === "generate_music") return dispatchGenerateMusic({ args, deps, userId });
  if (name === "browse_gallery") return dispatchBrowseGallery({ args, deps, userId });
  return { ok: false, error: `unknown_tool:${name}` };
};

module.exports = {
  ALL_TOOL_SPECS,
  generateImageToolSpec,
  setThemeToolSpec,
  continueStoryToolSpec,
  illustrateSceneToolSpec,
  recallFavoritesToolSpec,
  generateMusicToolSpec,
  browseGalleryToolSpec,
  SUPPORTED_THEMES,
  dispatchTool,
  STYLE_TO_MODEL_KEY,
  ASPECT_TO_SIZE,
};
