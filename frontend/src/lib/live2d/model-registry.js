/**
 * Live2D model registry — defines every model the companion system supports.
 *
 * Each entry must implement the full Interaction vocabulary via `interactionMap`.
 * Keys match Interaction.* constants from character-interactions.js.
 *
 * interactionMap values:
 *   { motion: <group name in model3.json>, emotion: <emotionMap key> }
 *   Either field may be omitted.
 *
 * hitZones: vertical bands of the canvas (normalised 0–1 top→bottom)
 *   mapped to a touch interaction name (must match an interactionMap key).
 *
 * idleVariants: motion groups played periodically to break the static idle.
 */

const MODELS = [
  {
    id: "xuefeng_3",
    name: "Xuefeng (雪枫·婚礼)",
    thumbnail: null,
    modelPath: "/live2d/xuefeng_3/runtime/xuefeng_3.model3.json",
    cubismVersion: 3,
    scale: 0.85,
    anchor: { x: 0.5, y: 1 },

    // ── Emotion map ────────────────────────────────────────────────────────
    // motion-group dispatch (no expression files in this model)
    emotionMap: {
      happy: { motion: "home" },
      sad: { motion: "mission" },
      surprised: { motion: "touch_special" },
      thinking: { motion: "idle" },
      neutral: { motion: "idle" },
    },

    // ── Interaction map (full Interaction vocabulary) ──────────────────────
    interactionMap: {
      idle: { motion: "idle" },
      idle_variant: { motion: "main_1" /* rotated in engine */ },

      touch_head: { motion: "touch_head", emotion: "surprised" },
      touch_body: { motion: "touch_body", emotion: "happy" },

      greet: { motion: "home", emotion: "happy" },
      acknowledge: { motion: "touch_body", emotion: "happy" },
      dismiss: { motion: "touch_head" },
      react: { motion: "touch_special", emotion: "surprised" },

      task_start: { motion: "mail", emotion: "thinking" },
      task_done: { motion: "mission_complete", emotion: "happy" },
      task_fail: { motion: "mission", emotion: "sad" },
      celebrate: { motion: "complete", emotion: "happy" },

      story_moment: { motion: "effect", emotion: "surprised" },

      happy: { motion: "home", emotion: "happy" },
      sad: { motion: "mission", emotion: "sad" },
      surprised: { motion: "touch_special", emotion: "surprised" },
      thinking: { motion: "idle", emotion: "thinking" },
    },

    // ── Idle variety — played randomly every 10–25 s ──────────────────────
    idleVariants: ["main_1", "main_2", "main_3"],

    // ── Hit zones (normalised canvas Y, top = 0, bottom = 1) ─────────────
    hitZones: [
      { name: "touch_head", yMin: 0, yMax: 0.42 },
      { name: "touch_body", yMin: 0.42, yMax: 1.0 },
    ],

    // ── Look-at weights ───────────────────────────────────────────────────
    lookAt: {
      headWeight: { x: 25, y: 18 },
      eyeWeight: { x: 1, y: 1 },
      bodyWeight: { x: 10, y: 5 },
      smoothing: 0.1,
    },
  },

  {
    id: "hiyori_free",
    name: "Hiyori Momose",
    thumbnail: null,
    modelPath: "/live2d/hiyori/runtime/hiyori_free_t08.model3.json",
    scale: 0.85,
    anchor: { x: 0.5, y: 1 },

    // ── Emotion map ────────────────────────────────────────────────────────
    // parameter-override (no expression files in free tier)
    emotionMap: {
      happy: { ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1, ParamCheek: 1 },
      sad: {
        ParamEyeLOpen: 0.4,
        ParamEyeROpen: 0.4,
        ParamBrowLForm: -0.5,
        ParamBrowRForm: -0.5,
        ParamMouthForm: -0.5,
      },
      surprised: {
        ParamEyeLOpen: 1.2,
        ParamEyeROpen: 1.2,
        ParamBrowLForm: 0.5,
        ParamBrowRForm: 0.5,
        ParamMouthOpenY: 0.6,
      },
      thinking: { ParamEyeBallX: -0.3, ParamEyeBallY: 0.2, ParamBrowLForm: 0.3, ParamAngleZ: -5 },
      neutral: {},
    },

    // ── Interaction map ────────────────────────────────────────────────────
    interactionMap: {
      idle: { motion: "Idle" },
      idle_variant: { motion: "Idle" /* 3-file group auto-cycles */ },

      touch_head: { motion: "Tap", emotion: "surprised" },
      touch_body: { motion: "Flick@Body", emotion: "happy" },

      greet: { motion: "Tap", emotion: "happy" },
      acknowledge: { motion: "Tap@Body", emotion: "happy" },
      dismiss: { motion: "FlickDown", emotion: "sad" },
      react: { motion: "Flick", emotion: "surprised" },

      task_start: { motion: "Tap@Body", emotion: "thinking" },
      task_done: { motion: "Tap", emotion: "happy" },
      task_fail: { motion: "FlickDown", emotion: "sad" },
      celebrate: { motion: "Tap", emotion: "happy" },

      story_moment: { motion: "Flick", emotion: "surprised" },

      happy: { motion: "Tap", emotion: "happy" },
      sad: { motion: "FlickDown", emotion: "sad" },
      surprised: { motion: "Flick", emotion: "surprised" },
      thinking: { motion: "Idle", emotion: "thinking" },
    },

    // Idle group has 3 files — calling motion("Idle") again picks a new one
    idleVariants: ["Idle"],

    hitZones: [
      { name: "touch_head", yMin: 0, yMax: 0.44 },
      { name: "touch_body", yMin: 0.44, yMax: 1.0 },
    ],

    lookAt: {
      headWeight: { x: 30, y: 20 },
      eyeWeight: { x: 1, y: 1 },
      bodyWeight: { x: 12, y: 6 },
      smoothing: 0.1,
    },
  },
];

export function getModelById(id) {
  return MODELS.find((m) => m.id === id) || null;
}

export function getDefaultModel() {
  return MODELS[0];
}

export function getAllModels() {
  return [...MODELS];
}
