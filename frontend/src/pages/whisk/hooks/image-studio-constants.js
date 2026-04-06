// ─── Image Studio Constants ───────────────────────────────────────────────────
// All module-level constants shared across image studio hooks.

export const DEFAULT_IMAGE_SOURCE = "replicate";
export const DEFAULT_IMAGE_MODEL = "animagine";
export const DEFAULT_IMAGE_PROMPT =
  "Anime key visual, cinematic lighting, clean line art, soft gradients";
export const DEFAULT_IMAGE_SIZE = "1280x720";
export const DEFAULT_IMAGE_SCHEDULER = "Euler a";
export const DEFAULT_IMAGE_COUNT = "1";
export const DEFAULT_CHARACTER_ID = "frieren";

export const CIVITAI_LORA_MODE_PROFILE = "profile";
export const CIVITAI_LORA_MODE_QUICK = "quick";
export const CIVITAI_RUNTIME_PROFILE_ID = "__whisk_civitai_runtime__";
export const CIVITAI_RUNTIME_PROFILE_NAME = "Whisk Runtime CivitAI LoRA";
export const CIVITAI_MAX_RUNTIME_LORAS = 9;
export const CIVITAI_CATALOG_RESULT_LIMIT = 12;
export const DEFAULT_CIVITAI_LORA_STRENGTH = 0.8;

export const FALLBACK_REPLICATE_IMAGE_MODELS = Object.freeze([
  {
    key: "wai-nsfw-illustrious-v11",
    name: "WAI NSFW Illustrious v11",
    description: "Cheapest, uncensored",
  },
  {
    key: "wai-nsfw-illustrious-v12",
    name: "WAI NSFW Illustrious v12",
    description: "Cheap, uncensored",
  },
  {
    key: "animagine",
    name: "Animagine XL v4 Opt",
    description: "Cheapest, balanced composition",
  },
  {
    key: "seedream-4.5",
    name: "Seedream 4.5",
    description: "Expensive, high landscape quality",
  },
  {
    key: "anillustrious-v4",
    name: "Anillustrious v4",
    description: "Expensive, high details character, uncensored",
  },
]);

export const FALLBACK_CIVITAI_IMAGE_MODELS = Object.freeze([
  {
    key: "civitai-sd15-anime",
    name: "CivitAI SD 1.5 Anime",
    description: "LoRA-ready CivitAI model",
  },
  {
    key: "civitai-pony-sdxl",
    name: "CivitAI Pony SDXL",
    description: "LoRA-ready CivitAI model",
  },
]);

export const DEFAULT_PROMPT_HELPER_SELECTIONS = {
  background: "",
  character: "",
  pose: "",
  signatureTraits: "",
  faceDetails: "",
  eyeDetails: "",
  breastSize: "",
  ears: "",
  tails: "",
  horns: "",
  wings: "",
  hairStyles: "",
  viewDistance: "",
  accessories: "",
  markings: "",
  outfitMaterials: "",
  styleReference: "",
};
