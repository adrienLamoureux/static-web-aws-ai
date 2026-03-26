/**
 * Live2D model registry — defines every model the companion system supports.
 * To add a new model: add an entry here and place assets under public/live2d/{id}/runtime/.
 */

const MODELS = [
  {
    id: "hiyori_free",
    name: "Hiyori Momose",
    thumbnail: null, // no thumbnail yet for free tier
    modelPath: "live2d/hiyori/runtime/hiyori_free_t08.model3.json",
    // Scale: fills this fraction of canvas height
    scale: 0.85,
    anchor: { x: 0.5, y: 1 },
    // Backend emotion name → Cubism parameter overrides
    emotionMap: {
      happy:     { ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1, ParamCheek: 1 },
      sad:       { ParamEyeLOpen: 0.4, ParamEyeROpen: 0.4, ParamBrowLForm: -0.5, ParamBrowRForm: -0.5, ParamMouthForm: -0.5 },
      surprised: { ParamEyeLOpen: 1.2, ParamEyeROpen: 1.2, ParamBrowLForm: 0.5, ParamBrowRForm: 0.5, ParamMouthOpenY: 0.6 },
      thinking:  { ParamEyeBallX: -0.3, ParamEyeBallY: 0.2, ParamBrowLForm: 0.3, ParamAngleZ: -5 },
      neutral:   {},
    },
    // Semantic action → motion group name defined in the model3.json
    motionMap: {
      idle:        "Idle",
      greet:       "Tap",
      react:       "Flick",
      acknowledge: "Tap@Body",
      dismiss:     "FlickDown",
    },
    // Look-at (cursor tracking) weights and smoothing
    lookAt: {
      headWeight: { x: 30, y: 20 }, // degrees for ParamAngleX/Y
      eyeWeight:  { x: 1,  y: 1  }, // range for ParamEyeBallX/Y
      smoothing:  0.1,               // lerp factor per frame (0=frozen, 1=instant)
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
