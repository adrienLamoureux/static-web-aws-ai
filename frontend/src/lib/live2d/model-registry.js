/**
 * Live2D model registry — defines every model the companion system supports.
 * To add a new model: add an entry here and place assets under public/live2d/{id}/runtime/.
 */

const MODELS = [
  {
    id: "hiyori_free",
    name: "Hiyori Momose",
    thumbnail: null,
    modelPath: "live2d/hiyori/runtime/hiyori_free_t08.model3.json",
    scale: 0.85,
    anchor: { x: 0.5, y: 1 },
    // Parameter-override emotions (no expression files in free tier)
    emotionMap: {
      happy:     { ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1, ParamCheek: 1 },
      sad:       { ParamEyeLOpen: 0.4, ParamEyeROpen: 0.4, ParamBrowLForm: -0.5, ParamBrowRForm: -0.5, ParamMouthForm: -0.5 },
      surprised: { ParamEyeLOpen: 1.2, ParamEyeROpen: 1.2, ParamBrowLForm: 0.5, ParamBrowRForm: 0.5, ParamMouthOpenY: 0.6 },
      thinking:  { ParamEyeBallX: -0.3, ParamEyeBallY: 0.2, ParamBrowLForm: 0.3, ParamAngleZ: -5 },
      neutral:   {},
    },
    motionMap: {
      idle:        "Idle",
      greet:       "Tap",
      react:       "Flick",
      acknowledge: "Tap@Body",
      dismiss:     "FlickDown",
    },
    lookAt: {
      headWeight: { x: 30, y: 20 },
      eyeWeight:  { x: 1,  y: 1  },
      bodyWeight: { x: 12, y: 6  },
      smoothing:  0.1,
    },
  },
  {
    id: "xuefeng_3",
    name: "Xuefeng (雪枫·婚礼)",
    thumbnail: null,
    modelPath: "live2d/xuefeng_3/runtime/xuefeng_3.model3.json",
    cubismVersion: 3,
    scale: 0.85,
    anchor: { x: 0.5, y: 1 },
    // Same motion groups as xuefeng (patched model3.json with named groups)
    emotionMap: {
      happy:     { motion: "complete" },
      sad:       { motion: "mission" },
      surprised: { motion: "touch_special" },
      thinking:  { motion: "idle" },
      neutral:   { motion: "idle" },
    },
    motionMap: {
      idle:        "idle",
      greet:       "home",
      react:       "touch_special",
      acknowledge: "touch_body",
      dismiss:     "touch_head",
      complete:    "complete",
    },
    lookAt: {
      headWeight: { x: 25, y: 18 },
      eyeWeight:  { x: 1,  y: 1  },
      bodyWeight: { x: 10, y: 5  },
      smoothing:  0.1,
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
