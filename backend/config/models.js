const DEFAULT_NEGATIVE_PROMPT =
  "low quality, worst quality, lowres, pixelated, jpeg artifacts, compression artifacts, blurry, blurry face, out of focus, oversharpened, grainy, noisy, dithering, flat shading, muddy colors, bad anatomy, bad proportions, tiny face, distant face, empty room, empty scene, scenery only, no person, no character, face obscured, faceless, cropped face, multiple characters, extra people, clone, twin, reflection, mirror, big eyes, wide eyes, sparkly eyes";
const DEFAULT_GRADIO_NEGATIVE_PROMPT =
  "lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]";

const parseOptionalNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const CIVITAI_DEFAULT_SIZES = Object.freeze([
  { width: 1024, height: 1024 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
]);


const imageModelConfig = {
  titan: {
    modelId:
      process.env.BEDROCK_TITAN_IMAGE_MODEL_ID ||
      "amazon.titan-image-generator-v2:0",
    provider: "titan",
    sizes: [
      { width: 1024, height: 1024 },
    ],
  },
  // Stability option removed until AWS Marketplace subscription is enabled.
};

const replicateModelConfig = {
  animagine: {
    modelId:
      "aisha-ai-official/animagine-xl-v4-opt:cfd0f86fbcd03df45fca7ce83af9bb9c07850a3317303fe8dcf677038541db8a",
    usePredictions: false,
    sizes: [
      { width: 1280, height: 720 },
      { width: 1024, height: 1024 },
      { width: 768, height: 1024 },
    ],
    schedulers: ["Euler a", "DPM++ 2M Karras"],
    buildInput: ({
      prompt,
      negativePrompt,
      width,
      height,
      numOutputs,
      seed,
      scheduler,
    }) => ({
      vae: "Animagine-XL-v4-Opt",
      model: "Animagine-XL-v4-Opt",
      seed: seed ?? -1,
      steps: 30,
      width,
      height,
      prompt,
      cfg_scale: 5,
      clip_skip: 1,
      pag_scale: 1,
      scheduler: scheduler || "Euler a",
      batch_size: numOutputs,
      negative_prompt: negativePrompt || DEFAULT_NEGATIVE_PROMPT,
      guidance_rescale: 1,
      prepend_preprompt: true,
    }),
  },
  "seedream-4.5": {
    modelId: "bytedance/seedream-4.5",
    usePredictions: true,
    sizes: [
      { width: 2048, height: 2048 },
      { width: 2048, height: 1152 },
    ],
    buildInput: ({ prompt, width, height, numOutputs }) => {
      const aspectRatio =
        width === 2048 && height === 1152
          ? "16:9"
          : "1:1";
      return {
        size: "4K",
        width,
        height,
        prompt,
        max_images: numOutputs,
        image_input: [],
        aspect_ratio: aspectRatio,
        sequential_image_generation: "disabled",
      };
    },
  },
  "wai-nsfw-illustrious-v11": {
    modelId:
      process.env.REPLICATE_WAI_NSFW_ILLUSTRIOUS_V11_MODEL_ID ||
      "aisha-ai-official/wai-nsfw-illustrious-v11:c1d5b02687df6081c7953c74bcc527858702e8c153c9382012ccc3906752d3ec",
    usePredictions: false,
    sizes: [
      { width: 1280, height: 720 },
      { width: 1024, height: 1024 },
      { width: 768, height: 1024 },
    ],
    schedulers: ["Euler a"],
    buildInput: ({
      prompt,
      negativePrompt,
      width,
      height,
      numOutputs,
      seed,
      scheduler,
    }) => ({
      vae: "WAI-NSFW-illustrious-SDXL-v11",
      seed: seed ?? -1,
      model: "WAI-NSFW-illustrious-SDXL-v11",
      steps: 30,
      width,
      height,
      prompt,
      cfg_scale: 7,
      clip_skip: 2,
      pag_scale: 3,
      scheduler: scheduler || "Euler a",
      batch_size: numOutputs,
      negative_prompt: negativePrompt || "nsfw, naked",
      guidance_rescale: 0.5,
      prepend_preprompt: true,
    }),
  },
  "wai-nsfw-illustrious-v12": {
    modelId:
      process.env.REPLICATE_WAI_NSFW_ILLUSTRIOUS_V12_MODEL_ID || "aisha-ai-official/wai-nsfw-illustrious-v12:0fc0fa9885b284901a6f9c0b4d67701fd7647d157b88371427d63f8089ce140e",
    usePredictions: true,
    sizes: [
      { width: 1280, height: 720 },
      { width: 1024, height: 1024 },
      { width: 768, height: 1024 },
    ],
    buildInput: ({
      prompt,
      negativePrompt,
      width,
      height,
      numOutputs,
      seed,
      scheduler,
    }) => ({
      batch_size: numOutputs,
      cfg_scale: 7,
      clip_skip: 2,
      guidance_rescale: 1,
      height,
      model: "WAI-NSFW-Illustrious-SDXL-v12",
      negative_prompt: negativePrompt || DEFAULT_NEGATIVE_PROMPT,
      pag_scale: 0,
      prepend_preprompt: true,
      prompt,
      scheduler: scheduler || "Euler a",
      seed: seed ?? -1,
      steps: 30,
      vae: "WAI-NSFW-Illustrious-SDXL-v12",
      width,
    }),
  },
  "anillustrious-v4": {
    modelId:
      process.env.REPLICATE_ANILLUSTRIOUS_V4_MODEL_ID ||
      "aisha-ai-official/anillustrious-v4:80441e2c32a55f2fcf9b77fa0a74c6c86ad7deac51eed722b9faedb253265cb4",
    usePredictions: true,
    sizes: [
      { width: 1280, height: 720 },
      { width: 1024, height: 1024 },
      { width: 768, height: 1024 },
    ],
    buildInput: ({
      prompt,
      negativePrompt,
      width,
      height,
      numOutputs,
      seed,
      scheduler,
    }) => ({
      vae: "NeptuniaXL-VAE-ContrastSaturation",
      seed: seed ?? -1,
      model: "Anillustrious-v4",
      steps: 30,
      width,
      height,
      prompt,
      refiner: false,
      upscale: "x4",
      cfg_scale: 7,
      clip_skip: 2,
      pag_scale: 0,
      scheduler: scheduler || "Euler",
      adetailer_face: false,
      adetailer_hand: false,
      refiner_prompt: "",
      negative_prompt: negativePrompt || DEFAULT_NEGATIVE_PROMPT,
      adetailer_person: false,
      guidance_rescale: 1,
      refiner_strength: 0.8,
      prepend_preprompt: true,
      prompt_conjunction: true,
      adetailer_face_prompt: "",
      adetailer_hand_prompt: "",
      adetailer_person_prompt: "",
      negative_prompt_conjunction: false,
      adetailer_face_negative_prompt: "",
      adetailer_hand_negative_prompt: "",
      adetailer_person_negative_prompt: "",
      batch_size: numOutputs,
    }),
  },
};

const civitaiModelConfig = {
  "civitai-sd15-anime": {
    provider: "civitai",
    modelId:
      process.env.CIVITAI_SD15_MODEL_URN ||
      "urn:air:sd1:checkpoint:civitai:4384@128713",
    baseModel: "SD_1_5",
    loraAirModelFamily: "sd1",
    supportsLora: true,
    estimatedUnitCostUsd: parseOptionalNumber(
      process.env.CIVITAI_SD15_ESTIMATED_UNIT_COST_USD
    ),
    sizes: CIVITAI_DEFAULT_SIZES,
    buildInput: ({ prompt, negativePrompt, width, height, seed }) => ({
      prompt,
      ...(negativePrompt ? { negativePrompt } : {}),
      scheduler: "EulerA",
      steps: 28,
      cfgScale: 7,
      width,
      height,
      ...(Number.isFinite(Number(seed)) ? { seed: Number(seed) } : {}),
      clipSkip: 2,
    }),
  },
  "civitai-pony-sdxl": {
    provider: "civitai",
    modelId:
      process.env.CIVITAI_PONY_MODEL_URN ||
      "urn:air:pony:checkpoint:civitai:372465@534642",
    baseModel: "SDXL",
    loraAirModelFamily: "sdxl",
    supportsLora: true,
    estimatedUnitCostUsd: parseOptionalNumber(
      process.env.CIVITAI_PONY_ESTIMATED_UNIT_COST_USD
    ),
    sizes: CIVITAI_DEFAULT_SIZES,
    buildInput: ({ prompt, negativePrompt, width, height, seed }) => ({
      prompt,
      ...(negativePrompt ? { negativePrompt } : {}),
      scheduler: "EulerA",
      steps: 28,
      cfgScale: 7,
      width,
      height,
      ...(Number.isFinite(Number(seed)) ? { seed: Number(seed) } : {}),
      clipSkip: 2,
    }),
  },
};

const gradioSpaceConfig = {
  wainsfw: {
    spaceId: "Menyu/wainsfw",
    apiName: "/infer",
    defaultWidth: 832,
    defaultHeight: 1216,
    guidanceScale: 7,
    numInferenceSteps: 28,
    buildInput: ({
      prompt,
      negativePrompt,
      width,
      height,
      seed,
      randomizeSeed,
      guidanceScale,
      numInferenceSteps,
      useNegativePrompt,
    }) => ({
      prompt,
      negative_prompt: negativePrompt,
      use_negative_prompt: useNegativePrompt,
      seed: Number.isFinite(Number(seed)) ? Number(seed) : 0,
      width,
      height,
      guidance_scale: guidanceScale,
      num_inference_steps: numInferenceSteps,
      randomize_seed: randomizeSeed,
    }),
  },
  "animagine-xl-3.1": {
    spaceId: "Asahina2K/animagine-xl-3.1",
    apiName: "/run",
    defaultWidth: 1024,
    defaultHeight: 1024,
    guidanceScale: 7,
    numInferenceSteps: 28,
    sampler: "DPM++ 2M Karras",
    aspectRatio: "1024 x 1024",
    stylePreset: "(None)",
    qualityTagsPreset: "(None)",
    useUpscaler: false,
    upscalerStrength: 0,
    upscaleBy: 1,
    addQualityTags: false,
    buildInput: ({
      prompt,
      negativePrompt,
      width,
      height,
      seed,
      randomizeSeed,
      guidanceScale,
      numInferenceSteps,
      sampler,
      aspectRatio,
      stylePreset,
      qualityTagsPreset,
      useUpscaler,
      upscalerStrength,
      upscaleBy,
      addQualityTags,
    }) => {
      const resolvedSeed = Number.isFinite(Number(seed))
        ? Number(seed)
        : randomizeSeed
          ? Math.floor(Math.random() * 2147483647)
          : 0;
      return [
        prompt,
        negativePrompt,
        resolvedSeed,
        width,
        height,
        guidanceScale,
        numInferenceSteps,
        sampler,
        aspectRatio,
        stylePreset,
        qualityTagsPreset,
        useUpscaler,
        upscalerStrength,
        upscaleBy,
        addQualityTags,
      ];
    },
  },
};

let gradioClientPromise;

const replicateVideoConfig = {
  "wan-2.2-i2v-fast": {
    modelId: "wan-video/wan-2.2-i2v-fast",
    requiresImage: true,
    loraInjection: {
      scaleFieldNames: [
        "lora_scale_transformer",
        "lora_scale_transformer_2",
      ],
    },
    buildInput: ({ imageUrl, prompt }) => ({
      image: imageUrl,
      prompt,
      go_fast: true,
      num_frames: 81,
      resolution: "480p",
      sample_shift: 12,
      frames_per_second: 16,
      interpolate_output: false,
      lora_scale_transformer: 1,
      lora_scale_transformer_2: 1,
      disable_safety_checker: true,
    }),
  },
  "veo-3.1-fast": {
    modelId: "google/veo-3.1-fast",
    requiresImage: true,
    buildInput: ({ imageUrl, prompt, generateAudio }) => ({
      image: imageUrl,
      prompt,
      duration: 8,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: generateAudio ?? true,
      last_frame: imageUrl,
    }),
  },
  "kling-v2.6": {
    modelId: "kwaivgi/kling-v2.6",
    requiresImage: true,
    buildInput: ({ prompt, imageUrl, generateAudio }) => ({
      prompt,
      start_image: imageUrl,
      duration: 5,
      aspect_ratio: "16:9",
      generate_audio: generateAudio ?? true,
      negative_prompt: "",
    }),
  },
  "seedance-1.5-pro": {
    modelId: "bytedance/seedance-1.5-pro",
    requiresImage: false,
    buildInput: ({ prompt, generateAudio }) => ({
      fps: 24,
      prompt,
      duration: 5,
      resolution: "480p",
      aspect_ratio: "16:9",
      camera_fixed: false,
      generate_audio: generateAudio ?? false,
    }),
  },
};


module.exports = {
  DEFAULT_NEGATIVE_PROMPT,
  DEFAULT_GRADIO_NEGATIVE_PROMPT,
  imageModelConfig,
  replicateModelConfig,
  civitaiModelConfig,
  gradioSpaceConfig,
  replicateVideoConfig,
};
