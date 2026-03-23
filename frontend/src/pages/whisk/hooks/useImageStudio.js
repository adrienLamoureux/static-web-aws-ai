import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  generateBedrockImage,
  generatePromptHelper,
} from "../../../services/bedrock";
import {
  generateReplicateImage,
  getReplicateImageStatus,
} from "../../../services/replicate";
import {
  generateCivitaiImage,
  getCivitaiImageStatus,
} from "../../../services/civitai";
import { generateHuggingFaceImage } from "../../../services/huggingface";
import { createVideoReadyImage } from "../../../services/images";
import {
  putFileToUrl,
  requestImageUploadUrl,
} from "../../../services/s3";
import { buildSafeFileName } from "../../../utils/fileName";
import { listStoryCharacters } from "../../../services/story";
import { listPromptHelperOptions } from "../../../services/promptHelper";
import { saveLoraProfile } from "../../../services/lora";

const DEFAULT_IMAGE_SOURCE = "replicate";
const DEFAULT_IMAGE_MODEL = "animagine";
const DEFAULT_IMAGE_PROMPT =
  "Anime key visual, cinematic lighting, clean line art, soft gradients";
const DEFAULT_IMAGE_SIZE = "1280x720";
const DEFAULT_IMAGE_SCHEDULER = "Euler a";
const DEFAULT_IMAGE_COUNT = "1";
const DEFAULT_CHARACTER_ID = "frieren";
const CIVITAI_LORA_MODE_PROFILE = "profile";
const CIVITAI_LORA_MODE_QUICK = "quick";
const CIVITAI_RUNTIME_PROFILE_ID = "__whisk_civitai_runtime__";
const CIVITAI_RUNTIME_PROFILE_NAME = "Whisk Runtime CivitAI LoRA";
const CIVITAI_MAX_RUNTIME_LORAS = 9;
const CIVITAI_CATALOG_RESULT_LIMIT = 12;
const DEFAULT_CIVITAI_LORA_STRENGTH = 0.8;
const FALLBACK_REPLICATE_IMAGE_MODELS = Object.freeze([
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
const FALLBACK_CIVITAI_IMAGE_MODELS = Object.freeze([
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
const DEFAULT_PROMPT_HELPER_SELECTIONS = {
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

const buildUnsupportedLoraMessage = ({
  modelKey = "",
  modality = "image",
  supportedModels = [],
}) => {
  const normalizedModelKey = String(modelKey || "").trim() || "selected model";
  const options = Array.isArray(supportedModels)
    ? supportedModels.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const supportedText = options.length
    ? `Compatible models: ${options.join(", ")}.`
    : `No ${modality} models are currently configured with LoRA support.`;
  return `The selected LoRA profile cannot be used with "${normalizedModelKey}". ${supportedText}`;
};

const buildSizeLabel = (width, height) => {
  const numericWidth = Number(width);
  const numericHeight = Number(height);
  if (!Number.isFinite(numericWidth) || !Number.isFinite(numericHeight)) {
    return "Custom";
  }
  if (numericWidth === numericHeight) {
    return `${numericWidth}x${numericHeight} (Square)`;
  }
  if (numericWidth > numericHeight && numericWidth / numericHeight > 1.7) {
    return `${numericWidth}x${numericHeight} (16:9)`;
  }
  if (numericHeight > numericWidth) {
    return `${numericWidth}x${numericHeight} (Portrait)`;
  }
  return `${numericWidth}x${numericHeight}`;
};

const normalizeCivitaiLoraStrength = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_CIVITAI_LORA_STRENGTH;
  }
  return Math.max(0, Math.min(2, Math.round(numeric * 100) / 100));
};

const resolveDefaultPreset = (presets = []) =>
  presets.find((preset) => preset.id === DEFAULT_CHARACTER_ID) ||
  presets.find((preset) =>
    (preset.name || "").toLowerCase().includes("frieren")
  ) ||
  null;

const buildSelectionsFromPreset = (preset) => {
  if (!preset) {
    return { ...DEFAULT_PROMPT_HELPER_SELECTIONS };
  }
  return {
    ...DEFAULT_PROMPT_HELPER_SELECTIONS,
    character: preset.name || "",
    background: preset.background || "",
    pose: preset.pose || "",
    signatureTraits: preset.signatureTraits || "",
    faceDetails: preset.faceDetails || "",
    eyeDetails: preset.eyeDetails || "",
    breastSize: preset.breastSize || "",
    ears: preset.ears || "",
    tails: preset.tails || "",
    horns: preset.horns || "",
    wings: preset.wings || "",
    hairStyles: preset.hairStyles || "",
    viewDistance: preset.viewDistance || "",
    accessories: preset.accessories || "",
    markings: preset.markings || "",
    outfitMaterials: preset.outfitMaterials || "",
    styleReference: preset.styleReference || "",
  };
};

export const useImageStudio = ({
  apiBaseUrl,
  selectedLoraProfileId = "",
  loraCatalogEntries = [],
  loraImageSupportByModel = {},
  loraImageSupportByProviderModel = {},
  supportedImageLoraModels = [],
  supportedImageLoraModelsByProvider = {},
  directorImageModels = [],
  directorCivitaiModels = [],
  directorGenerationByModel = {},
  onError,
  onVideoReady,
  onResetVideoReady,
  onAddVideoReadyImage,
  onCloseImageModal,
  onGenerationComplete,
}) => {
  const [imageSource, setImageSource] = useState(DEFAULT_IMAGE_SOURCE);
  const [imageModel, setImageModel] = useState(DEFAULT_IMAGE_MODEL);
  const [imageGenerationName, setImageGenerationName] = useState("");
  const [imagePrompt, setImagePrompt] = useState(DEFAULT_IMAGE_PROMPT);
  const [imageNegativePrompt, setImageNegativePrompt] = useState("");
  const [imageSize, setImageSize] = useState(DEFAULT_IMAGE_SIZE);
  const [imageScheduler, setImageScheduler] = useState(
    DEFAULT_IMAGE_SCHEDULER
  );
  const [imageCount, setImageCount] = useState(DEFAULT_IMAGE_COUNT);
  const [imageGenerationStatus, setImageGenerationStatus] = useState("idle");
  const [promptHelperStatus, setPromptHelperStatus] = useState("idle");
  const [imageGenerationNotice, setImageGenerationNotice] = useState("");
  const [promptHelperSelections, setPromptHelperSelections] = useState(
    DEFAULT_PROMPT_HELPER_SELECTIONS
  );
  const [promptHelperOptions, setPromptHelperOptions] = useState({
    backgrounds: [],
    poses: [],
    traits: [],
    faceDetails: [],
    eyeDetails: [],
    breastSizes: [],
    ears: [],
    tails: [],
    horns: [],
    wings: [],
    hairStyles: [],
    viewDistance: [],
    accessories: [],
    markings: [],
    outfits: [],
    styles: [],
  });
  const [defaultNegativePrompt, setDefaultNegativePrompt] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [uploadKey, setUploadKey] = useState("");
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [civitaiLoraMode, setCivitaiLoraMode] = useState(
    CIVITAI_LORA_MODE_PROFILE
  );
  const [civitaiCatalogQuery, setCivitaiCatalogQuery] = useState("");
  const [civitaiRuntimeLoras, setCivitaiRuntimeLoras] = useState([]);
  const replicatePollRef = useRef(null);

  const isUploading = uploadStatus === "uploading";
  const isGeneratingImage = imageGenerationStatus === "loading";
  const isPromptHelperLoading = promptHelperStatus === "loading";
  const hasPromptHelperSelection = Boolean(
      promptHelperSelections.background ||
      promptHelperSelections.character ||
      promptHelperSelections.pose ||
      promptHelperSelections.signatureTraits ||
      promptHelperSelections.faceDetails ||
      promptHelperSelections.eyeDetails ||
      promptHelperSelections.breastSize ||
      promptHelperSelections.ears ||
      promptHelperSelections.tails ||
      promptHelperSelections.horns ||
      promptHelperSelections.wings ||
      promptHelperSelections.hairStyles ||
      promptHelperSelections.viewDistance ||
      promptHelperSelections.accessories ||
      promptHelperSelections.markings ||
      promptHelperSelections.outfitMaterials ||
      promptHelperSelections.styleReference
  );

  const clearReplicatePoll = () => {
    if (replicatePollRef.current) {
      clearTimeout(replicatePollRef.current);
      replicatePollRef.current = null;
    }
  };

  useEffect(() => () => clearReplicatePoll(), []);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  const [characterPresets, setCharacterPresets] = useState([]);
  const defaultCharacterPreset = useMemo(
    () => resolveDefaultPreset(characterPresets),
    [characterPresets]
  );

  useEffect(() => {
    if (!apiBaseUrl) return;
    listStoryCharacters(apiBaseUrl)
      .then((data) => {
        setCharacterPresets(data.characters || []);
      })
      .catch((error) => {
        onError?.(error?.message || "Failed to load character presets.");
      });
  }, [apiBaseUrl, onError]);

  useEffect(() => {
    if (!apiBaseUrl) return;
    listPromptHelperOptions(apiBaseUrl)
      .then((data) => {
        if (typeof data.negativePrompt === "string") {
          setDefaultNegativePrompt(data.negativePrompt);
          setImageNegativePrompt((prev) =>
            prev ? prev : data.negativePrompt
          );
        }
        setPromptHelperOptions((prev) => ({
          backgrounds: Array.isArray(data.backgrounds)
            ? data.backgrounds
            : prev.backgrounds,
          poses: Array.isArray(data.poses) ? data.poses : prev.poses,
          traits: Array.isArray(data.traits) ? data.traits : prev.traits,
          faceDetails: Array.isArray(data.faceDetails)
            ? data.faceDetails
            : prev.faceDetails,
          eyeDetails: Array.isArray(data.eyeDetails)
            ? data.eyeDetails
            : prev.eyeDetails,
          breastSizes: Array.isArray(data.breastSizes)
            ? data.breastSizes
            : prev.breastSizes,
          ears: Array.isArray(data.ears) ? data.ears : prev.ears,
          tails: Array.isArray(data.tails) ? data.tails : prev.tails,
          horns: Array.isArray(data.horns) ? data.horns : prev.horns,
          wings: Array.isArray(data.wings) ? data.wings : prev.wings,
          hairStyles: Array.isArray(data.hairStyles)
            ? data.hairStyles
            : prev.hairStyles,
          viewDistance: Array.isArray(data.viewDistance)
            ? data.viewDistance
            : prev.viewDistance,
          accessories: Array.isArray(data.accessories)
            ? data.accessories
            : prev.accessories,
          markings: Array.isArray(data.markings)
            ? data.markings
            : prev.markings,
          outfits: Array.isArray(data.outfits) ? data.outfits : prev.outfits,
          styles: Array.isArray(data.styles) ? data.styles : prev.styles,
        }));
      })
      .catch((error) => {
        onError?.(error?.message || "Failed to load prompt helper options.");
      });
  }, [apiBaseUrl, onError]);

  const characterPresetMap = useMemo(() => {
    const entries = (characterPresets || []).map((preset) => [
      (preset.name || "").toLowerCase(),
      preset,
    ]);
    return new Map(entries);
  }, [characterPresets]);
  const buildPromptFromSelectionsWithSelections = useCallback(
    (selections) => {
      const parts = [];
      const pushTrimmed = (value) => {
        const trimmed = value?.trim();
        if (trimmed) {
          parts.push(trimmed);
        }
      };
      pushTrimmed(selections.viewDistance);
      pushTrimmed(selections.background);
      const hasCharacter = Boolean(selections.character?.trim());
      if (hasCharacter) {
        parts.push("1girl, solo");
        pushTrimmed(selections.outfitMaterials);
        const characterValue = selections.character.trim();
        const preset = characterPresetMap.get(characterValue.toLowerCase());
        if (preset?.name) {
          const weight =
            typeof preset.weight === "number" ? preset.weight : 1.4;
          parts.push(`(${preset.name}:${weight})`);
        } else {
          parts.push(characterValue);
        }
      }
      pushTrimmed(selections.signatureTraits);
      pushTrimmed(selections.eyeDetails);
      pushTrimmed(selections.pose);
      pushTrimmed(selections.faceDetails);
      pushTrimmed(selections.breastSize);
      pushTrimmed(selections.ears);
      pushTrimmed(selections.tails);
      pushTrimmed(selections.horns);
      pushTrimmed(selections.wings);
      pushTrimmed(selections.hairStyles);
      pushTrimmed(selections.accessories);
      pushTrimmed(selections.markings);
      if (!hasCharacter) {
        pushTrimmed(selections.outfitMaterials);
      }
      pushTrimmed(selections.styleReference);
      return parts.filter(Boolean).join(", ");
    },
    [characterPresetMap]
  );

  const resetImageForm = () => {
    setImageSource(DEFAULT_IMAGE_SOURCE);
    setImageModel(DEFAULT_IMAGE_MODEL);
    setImageGenerationName("");
    setImageSize(DEFAULT_IMAGE_SIZE);
    setImageScheduler(DEFAULT_IMAGE_SCHEDULER);
    setImageCount(DEFAULT_IMAGE_COUNT);
    setImageGenerationStatus("idle");
    setImageGenerationNotice("");
    setPromptHelperStatus("idle");
    const defaultSelections = buildSelectionsFromPreset(defaultCharacterPreset);
    const defaultPrompt =
      buildPromptFromSelectionsWithSelections(defaultSelections);
    setPromptHelperSelections(defaultSelections);
    setImagePrompt(defaultPrompt || DEFAULT_IMAGE_PROMPT);
    setImageNegativePrompt(defaultNegativePrompt);
    setSelectedFile(null);
    setPreviewUrl("");
    setImageName("");
    setUploadKey("");
    setUploadStatus("idle");
    setCivitaiLoraMode(CIVITAI_LORA_MODE_PROFILE);
    setCivitaiCatalogQuery("");
    setCivitaiRuntimeLoras([]);
    onResetVideoReady?.();
  };

  useEffect(() => {
    if (!defaultCharacterPreset) return;
    setPromptHelperSelections((prev) => {
      const hasAny = Object.values(prev).some((value) => value);
      if (hasAny) return prev;
      return buildSelectionsFromPreset(defaultCharacterPreset);
    });
    if (!imageNegativePrompt && defaultNegativePrompt) {
      setImageNegativePrompt(defaultNegativePrompt);
    }
    if (!imagePrompt || imagePrompt === DEFAULT_IMAGE_PROMPT) {
      const defaultPrompt = buildPromptFromSelectionsWithSelections(
        buildSelectionsFromPreset(defaultCharacterPreset)
      );
      if (defaultPrompt) {
        setImagePrompt(defaultPrompt);
      }
    }
  }, [
    buildPromptFromSelectionsWithSelections,
    defaultCharacterPreset,
    imageNegativePrompt,
    imagePrompt,
    defaultNegativePrompt,
  ]);

  const imageSourceOptions = [
    {
      key: "bedrock",
      name: "Generate with Bedrock",
      description: "Amazon Titan Image Generator",
    },
    {
      key: "replicate",
      name: "Generate with Replicate",
      description: "Anime-focused models",
    },
    {
      key: "civitai",
      name: "Generate with CivitAI",
      description: "CivitAI orchestration runtime",
    },
    {
      key: "huggingface",
      name: "Generate with Hugging Face",
      description: "Gradio Space models",
    },
    {
      key: "upload",
      name: "Upload a JPEG",
      description: "Send your own image to S3",
    },
  ];

  const replicateModelOptionsFromDirector = useMemo(
    () =>
      (Array.isArray(directorImageModels) ? directorImageModels : [])
        .map((item) => {
          const key = String(item?.key || "").trim();
          if (!key) return null;
          return {
            key,
            name: String(item?.label || key).trim() || key,
            description: item?.supportsLora ? "LoRA-capable model" : "Replicate model",
          };
        })
        .filter(Boolean),
    [directorImageModels]
  );
  const civitaiModelOptionsFromDirector = useMemo(
    () =>
      (Array.isArray(directorCivitaiModels) ? directorCivitaiModels : [])
        .map((item) => {
          const key = String(item?.key || "").trim();
          if (!key) return null;
          const estimatedUnitCostUsd = Number(item?.estimatedUnitCostUsd);
          const costLabel = Number.isFinite(estimatedUnitCostUsd)
            ? `~$${estimatedUnitCostUsd.toFixed(4)} / image`
            : "Usage-based pricing";
          return {
            key,
            name: String(item?.label || key).trim() || key,
            description: item?.supportsLora
              ? `LoRA-capable model • ${costLabel}`
              : costLabel,
          };
        })
        .filter(Boolean),
    [directorCivitaiModels]
  );

  const imageModelOptions = useMemo(() => {
    if (imageSource === "bedrock") {
      return [
        {
          key: "titan",
          name: "Titan Image Generator",
          description: "Clean, consistent outputs",
        },
      ];
    }
    if (imageSource === "huggingface") {
      return [
        {
          key: "wainsfw",
          name: "WAI NSFW Illustrious v150",
          description: "Menyu Gradio Space",
        },
        {
          key: "animagine-xl-3.1",
          name: "Animagine XL 3.1",
          description: "Asahina2K Gradio Space",
        },
      ];
    }
    if (imageSource === "civitai") {
      return civitaiModelOptionsFromDirector.length
        ? civitaiModelOptionsFromDirector
        : FALLBACK_CIVITAI_IMAGE_MODELS;
    }
    return replicateModelOptionsFromDirector.length
      ? replicateModelOptionsFromDirector
      : FALLBACK_REPLICATE_IMAGE_MODELS;
  }, [
    imageSource,
    replicateModelOptionsFromDirector,
    civitaiModelOptionsFromDirector,
  ]);

  const imageSizeOptions = useMemo(() => {
    if (imageSource === "replicate" || imageSource === "civitai") {
      const modelConfig = directorGenerationByModel?.[imageModel] || {};
      const configuredSizes = Array.isArray(modelConfig?.sizes) ? modelConfig.sizes : [];
      if (configuredSizes.length) {
        return configuredSizes
          .map((size) => {
            const width = Number(size?.width);
            const height = Number(size?.height);
            if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
            return {
              value: `${width}x${height}`,
              label: buildSizeLabel(width, height),
            };
          })
          .filter(Boolean);
      }
    }
    if (imageSource === "huggingface") {
      if (imageModel === "wainsfw") {
        return [
          { value: "832x1216", label: "832x1216 (Portrait)" },
          { value: "1024x1024", label: "1024x1024 (Square)" },
          { value: "1216x832", label: "1216x832 (Landscape)" },
          { value: "1280x720", label: "1280x720 (16:9)" },
        ];
      }
      return [
        { value: "1024x1024", label: "1024x1024 (Square)" },
        { value: "832x1216", label: "832x1216 (Portrait)" },
        { value: "1216x832", label: "1216x832 (Landscape)" },
        { value: "1280x720", label: "1280x720 (16:9)" },
      ];
    }
    if (imageModel === "animagine") {
      return [
        { value: "1280x720", label: "1280x720 (16:9)" },
        { value: "1024x1024", label: "1024x1024 (Square)" },
        { value: "768x1024", label: "768x1024 (Portrait)" },
      ];
    }
    if (imageModel === "wai-nsfw-illustrious-v12") {
      return [
        { value: "1280x720", label: "1280x720 (16:9)" },
        { value: "1024x1024", label: "1024x1024 (Square)" },
        { value: "768x1024", label: "768x1024 (Portrait)" },
      ];
    }
    if (imageModel === "wai-nsfw-illustrious-v11") {
      return [
        { value: "1280x720", label: "1280x720 (16:9)" },
        { value: "1024x1024", label: "1024x1024 (Square)" },
        { value: "768x1024", label: "768x1024 (Portrait)" },
      ];
    }
    if (imageModel === "anillustrious-v4") {
      return [
        { value: "1280x720", label: "1280x720 (16:9)" },
        { value: "1024x1024", label: "1024x1024 (Square)" },
        { value: "768x1024", label: "768x1024 (Portrait)" },
      ];
    }
    if (imageModel === "seedream-4.5") {
      return [
        { value: "2048x2048", label: "2048x2048 (4K Square)" },
        { value: "2048x1152", label: "2048x1152 (4K 16:9)" },
      ];
    }
    if (imageSource === "bedrock") {
      return [{ value: "1024x1024", label: "1024x1024 (Square)" }];
    }
    return [{ value: "1024x1024", label: "1024x1024 (Square)" }];
  }, [imageSource, imageModel, directorGenerationByModel]);

  const imageSchedulerOptions = useMemo(() => {
    if (imageSource === "replicate") {
      const modelConfig = directorGenerationByModel?.[imageModel] || {};
      const configuredSchedulers = Array.isArray(modelConfig?.schedulers)
        ? modelConfig.schedulers
        : [];
      if (configuredSchedulers.length) {
        const schedulerOptions = configuredSchedulers.map((scheduler) => ({
          value: scheduler,
          label: scheduler,
        }));
        if (configuredSchedulers.length > 1) {
          schedulerOptions.push({
            value: "diff",
            label: `Both (${configuredSchedulers.join(" + ")})`,
          });
        }
        return schedulerOptions;
      }
      if (imageModel === "animagine") {
        return [
          { value: "Euler a", label: "Euler a" },
          { value: "DPM++ 2M Karras", label: "DPM++ 2M Karras" },
          { value: "diff", label: "Both (Euler a + DPM++ 2M Karras)" },
        ];
      }
    }
    return [];
  }, [imageSource, imageModel, directorGenerationByModel]);

  useEffect(() => {
    const allowedValues = imageSizeOptions.map((option) => option.value);
    if (!allowedValues.includes(imageSize)) {
      setImageSize(imageSizeOptions[0]?.value || "1024x1024");
    }
  }, [imageModel, imageSizeOptions, imageSize]);

  useEffect(() => {
    if (imageSchedulerOptions.length === 0) return;
    const allowedValues = imageSchedulerOptions.map((option) => option.value);
    if (!allowedValues.includes(imageScheduler)) {
      setImageScheduler(imageSchedulerOptions[0]?.value || "Euler a");
    }
  }, [imageScheduler, imageSchedulerOptions]);

  useEffect(() => {
    if (imageScheduler === "diff") {
      setImageCount("2");
    }
  }, [imageScheduler]);

  const imageCountOptions = useMemo(
    () => [
      { value: "1", label: "1 image" },
      { value: "2", label: "2 images" },
    ],
    []
  );

  const normalizedLoraCatalogEntries = useMemo(
    () =>
      (Array.isArray(loraCatalogEntries) ? loraCatalogEntries : [])
        .map((entry) => {
          const catalogId = String(entry?.catalogId || "").trim();
          if (!catalogId) return null;
          return {
            catalogId,
            name: String(entry?.name || entry?.modelName || catalogId).trim(),
            baseModel: String(entry?.baseModel || "").trim(),
            creatorName: String(entry?.creatorName || "").trim(),
            triggerWords: Array.isArray(entry?.triggerWords)
              ? entry.triggerWords
                  .map((word) => String(word || "").trim())
                  .filter(Boolean)
              : [],
            downloadUrl: String(entry?.downloadUrl || "").trim(),
          };
        })
        .filter(Boolean),
    [loraCatalogEntries]
  );

  const civitaiCatalogResults = useMemo(() => {
    const query = String(civitaiCatalogQuery || "")
      .trim()
      .toLowerCase();
    const filtered = query
      ? normalizedLoraCatalogEntries.filter((entry) => {
          const searchable = [
            entry.catalogId,
            entry.name,
            entry.baseModel,
            entry.creatorName,
            ...(entry.triggerWords || []),
          ]
            .join(" ")
            .toLowerCase();
          return searchable.includes(query);
        })
      : normalizedLoraCatalogEntries;
    return filtered.slice(0, CIVITAI_CATALOG_RESULT_LIMIT);
  }, [civitaiCatalogQuery, normalizedLoraCatalogEntries]);

  const addCivitaiRuntimeLora = useCallback((entry) => {
    if (!entry?.catalogId) return;
    setCivitaiRuntimeLoras((previous) => {
      if (previous.some((item) => item.catalogId === entry.catalogId)) {
        return previous;
      }
      if (previous.length >= CIVITAI_MAX_RUNTIME_LORAS) {
        return previous;
      }
      return [
        ...previous,
        {
          catalogId: entry.catalogId,
          name: entry.name,
          downloadUrl: entry.downloadUrl,
          triggerWords: entry.triggerWords || [],
          strength: DEFAULT_CIVITAI_LORA_STRENGTH,
        },
      ];
    });
  }, []);

  const removeCivitaiRuntimeLora = useCallback((catalogId) => {
    const resolvedCatalogId = String(catalogId || "").trim();
    if (!resolvedCatalogId) return;
    setCivitaiRuntimeLoras((previous) =>
      previous.filter((item) => item.catalogId !== resolvedCatalogId)
    );
  }, []);

  const updateCivitaiRuntimeLoraStrength = useCallback(
    (catalogId, strength) => {
      const resolvedCatalogId = String(catalogId || "").trim();
      if (!resolvedCatalogId) return;
      const normalizedStrength = normalizeCivitaiLoraStrength(strength);
      setCivitaiRuntimeLoras((previous) =>
        previous.map((item) =>
          item.catalogId === resolvedCatalogId
            ? { ...item, strength: normalizedStrength }
            : item
        )
      );
    },
    []
  );

  useEffect(() => {
    const allowedModels = imageModelOptions.map((option) => option.key);
    if (!allowedModels.includes(imageModel)) {
      setImageModel(
        imageModelOptions[0]?.key ||
          (imageSource === "bedrock" ? "titan" : DEFAULT_IMAGE_MODEL)
      );
    }
  }, [imageModel, imageModelOptions, imageSource]);

  useEffect(() => {
    if (imageSource !== "replicate") {
      setImageCount(DEFAULT_IMAGE_COUNT);
    }
  }, [imageSource]);

  useEffect(() => {
    if (imageSource !== "civitai") {
      setCivitaiLoraMode(CIVITAI_LORA_MODE_PROFILE);
      setCivitaiCatalogQuery("");
    }
  }, [imageSource]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "image/jpeg") {
      onError?.("Please select a JPEG image.");
      setSelectedFile(null);
      return;
    }
    onError?.("");
    onResetVideoReady?.();
    setSelectedFile(file);
    setUploadKey("");
    setUploadStatus("idle");
    setImageGenerationStatus("idle");
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    if (!imageName.trim()) {
      onError?.("Image name is required.");
      return;
    }
    if (!apiBaseUrl) {
      onError?.("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    onError?.("");
    setUploadStatus("uploading");
    setImageGenerationStatus("idle");

    const safeName = buildSafeFileName(imageName.trim()) || "upload";
    const safeBase = safeName.replace(/\.(jpg|jpeg|png)$/i, "");
    const contentType = selectedFile.type || "application/octet-stream";

    try {
      const presignData = await requestImageUploadUrl(apiBaseUrl, {
        fileName: safeBase,
        contentType,
      });

      await putFileToUrl(presignData.url, selectedFile, contentType);

      setUploadKey(presignData.key);
      setUploadStatus("uploaded");

      const videoReadyData = await createVideoReadyImage(
        apiBaseUrl,
        presignData.key
      );
      if (videoReadyData?.videoReadyKey) {
        onVideoReady?.({
          key: videoReadyData.videoReadyKey,
          url: videoReadyData.url || "",
          sourceKey: presignData.key,
        });
      }
      if (videoReadyData?.videoReadyKey && videoReadyData?.url) {
        onAddVideoReadyImage?.({
          key: videoReadyData.videoReadyKey,
          url: videoReadyData.url,
        });
      }
    } catch (error) {
      setUploadStatus("error");
      onError?.(error?.message || "Upload failed.");
    }
  };

  const startReplicateImagePolling = ({
    predictionId,
    batchId,
    imageName,
    prompt,
    negativePrompt,
  }) => {
    if (!apiBaseUrl) return;
    const poll = async () => {
      try {
        const data = await getReplicateImageStatus(apiBaseUrl, {
          predictionId,
          batchId,
          imageName,
          prompt,
          negativePrompt,
        });
        if (data?.status === "succeeded") {
          setImageGenerationNotice(data?.notice || "");
          setImageGenerationStatus("success");
          clearReplicatePoll();
          onGenerationComplete?.();
          return;
        }
        if (data?.status === "failed" || data?.status === "canceled") {
          clearReplicatePoll();
          setImageGenerationStatus("error");
          onError?.(
            data?.error || "Replicate image generation failed."
          );
          return;
        }
        setImageGenerationNotice(
          "Replicate is still generating the image..."
        );
      } catch (error) {
        setImageGenerationNotice(
          "Replicate is still generating the image..."
        );
      }
      replicatePollRef.current = setTimeout(poll, 2500);
    };
    clearReplicatePoll();
    replicatePollRef.current = setTimeout(poll, 2500);
  };

  const startCivitaiImagePolling = ({
    token,
    batchId,
    imageName,
    prompt,
    negativePrompt,
    characterId,
  }) => {
    if (!apiBaseUrl) return;
    const poll = async () => {
      try {
        const data = await getCivitaiImageStatus(apiBaseUrl, {
          token,
          batchId,
          imageName,
          prompt,
          negativePrompt,
          characterId,
        });
        if (data?.status === "succeeded") {
          setImageGenerationNotice(data?.notice || "");
          setImageGenerationStatus("success");
          clearReplicatePoll();
          onGenerationComplete?.();
          return;
        }
        if (data?.status === "failed") {
          clearReplicatePoll();
          setImageGenerationStatus("error");
          onError?.(data?.error || "CivitAI image generation failed.");
          return;
        }
        setImageGenerationNotice("CivitAI is still generating the image...");
      } catch (_error) {
        setImageGenerationNotice("CivitAI is still generating the image...");
      }
      replicatePollRef.current = setTimeout(poll, 2500);
    };
    clearReplicatePoll();
    replicatePollRef.current = setTimeout(poll, 2500);
  };

  const loraSupportBySourceModel = useMemo(
    () => ({
      replicate:
        loraImageSupportByProviderModel?.replicate || loraImageSupportByModel || {},
      civitai: loraImageSupportByProviderModel?.civitai || {},
    }),
    [loraImageSupportByModel, loraImageSupportByProviderModel]
  );

  const supportedLoraModelsBySource = useMemo(
    () => ({
      replicate:
        supportedImageLoraModelsByProvider?.replicate || supportedImageLoraModels || [],
      civitai: supportedImageLoraModelsByProvider?.civitai || [],
    }),
    [supportedImageLoraModels, supportedImageLoraModelsByProvider]
  );

  const activeCharacterIdForGeneration =
    imageSource === "civitai" && civitaiLoraMode === CIVITAI_LORA_MODE_QUICK
      ? civitaiRuntimeLoras.length
        ? CIVITAI_RUNTIME_PROFILE_ID
        : ""
      : selectedLoraProfileId;

  const loraUnsupportedForCurrentSelection = Boolean(
    activeCharacterIdForGeneration &&
      (!["replicate", "civitai"].includes(imageSource) ||
        !Boolean(loraSupportBySourceModel?.[imageSource]?.[imageModel]))
  );

  const localLoraSupportNotice = loraUnsupportedForCurrentSelection
    ? buildUnsupportedLoraMessage({
        modelKey: imageModel,
        modality: "image",
        supportedModels: supportedLoraModelsBySource?.[imageSource] || [],
      })
    : "";

  const persistRuntimeCivitaiProfileIfNeeded = useCallback(async () => {
    if (
      imageSource !== "civitai" ||
      civitaiLoraMode !== CIVITAI_LORA_MODE_QUICK ||
      civitaiRuntimeLoras.length === 0
    ) {
      return "";
    }
    const profileLoras = civitaiRuntimeLoras.map((item) => ({
      catalogId: item.catalogId,
      name: item.name,
      downloadUrl: item.downloadUrl,
      strength: normalizeCivitaiLoraStrength(item.strength),
      triggerWords: Array.isArray(item.triggerWords) ? item.triggerWords : [],
    }));
    await saveLoraProfile(apiBaseUrl, CIVITAI_RUNTIME_PROFILE_ID, {
      displayName: CIVITAI_RUNTIME_PROFILE_NAME,
      image: {
        modelKey: "",
        promptPrefix: "",
        loras: profileLoras,
      },
      video: {
        modelKey: "",
        promptPrefix: "",
        loras: [],
      },
    });
    return CIVITAI_RUNTIME_PROFILE_ID;
  }, [apiBaseUrl, civitaiLoraMode, civitaiRuntimeLoras, imageSource]);

  const handleGenerateImage = async () => {
    if (!apiBaseUrl) {
      onError?.("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    if (!imageGenerationName.trim()) {
      onError?.("Image name is required.");
      return;
    }
    if (!imagePrompt.trim()) {
      onError?.("Prompt is required.");
      return;
    }
    if (loraUnsupportedForCurrentSelection) {
      onError?.(
        buildUnsupportedLoraMessage({
          modelKey: imageModel,
          modality: "image",
          supportedModels: supportedLoraModelsBySource?.[imageSource] || [],
        })
      );
      return;
    }
    onError?.("");
    setImageGenerationStatus("loading");
    onResetVideoReady?.();
    setImageGenerationNotice("");
    clearReplicatePoll();

    try {
      const resolvedCharacterId = await persistRuntimeCivitaiProfileIfNeeded();
      const [width, height] = imageSize.split("x").map(Number);
      const payload = {
        model: imageModel,
        imageName: imageGenerationName.trim(),
        prompt: imagePrompt.trim(),
        negativePrompt: imageNegativePrompt.trim() || undefined,
        characterId:
          resolvedCharacterId || activeCharacterIdForGeneration || undefined,
        width,
        height,
        numImages:
          imageSource === "replicate" || imageSource === "civitai"
            ? Number(imageCount) || 1
            : 1,
        ...(imageSource === "replicate" && imageSchedulerOptions.length > 0
          ? { scheduler: imageScheduler }
          : {}),
      };
      onCloseImageModal?.();
      const data =
        imageSource === "bedrock"
          ? await generateBedrockImage(apiBaseUrl, payload)
          : imageSource === "civitai"
            ? await generateCivitaiImage(apiBaseUrl, payload)
          : imageSource === "huggingface"
            ? await generateHuggingFaceImage(apiBaseUrl, payload)
            : await generateReplicateImage(apiBaseUrl, payload);
      if (imageSource === "civitai" && data?.token && data?.status !== "succeeded") {
        if (data.status === "failed") {
          setImageGenerationStatus("error");
          onError?.(data?.error || "CivitAI image generation failed.");
          return;
        }
        setImageGenerationNotice(
          data?.notice || "CivitAI is processing the image. We'll keep checking."
        );
        setImageGenerationStatus("loading");
        startCivitaiImagePolling({
          token: data.token,
          batchId: data.batchId,
          imageName: payload.imageName,
          prompt: payload.prompt,
          negativePrompt: payload.negativePrompt || "",
          characterId: payload.characterId || "",
        });
        return;
      }
      if (
        data?.predictionId &&
        data?.status &&
        data.status !== "succeeded"
      ) {
        if (data.status === "failed" || data.status === "canceled") {
          setImageGenerationStatus("error");
          onError?.(
            data?.error || "Replicate image generation failed."
          );
          return;
        }
        setImageGenerationNotice(
          data?.notice ||
            "Replicate is processing the image. We'll keep checking."
        );
        setImageGenerationStatus("loading");
        startReplicateImagePolling({
          predictionId: data.predictionId,
          batchId: data.batchId,
          imageName: payload.imageName,
          prompt: payload.prompt,
          negativePrompt: payload.negativePrompt || "",
        });
        return;
      }
      setImageGenerationNotice(data?.notice || "");
      setImageGenerationStatus("success");
      onGenerationComplete?.();
    } catch (error) {
      setImageGenerationStatus("error");
      onError?.(error?.message || "Image generation failed.");
    }
  };

  const buildPromptFromSelections = () =>
    buildPromptFromSelectionsWithSelections(promptHelperSelections);

  const handlePromptHelperCreate = () => {
    if (!hasPromptHelperSelection) {
      onError?.("Select at least one prompt helper field.");
      return;
    }
    const prompt = buildPromptFromSelections();
    if (!prompt) {
      onError?.("Prompt helper fields are empty.");
      return;
    }
    setImageNegativePrompt(defaultNegativePrompt);
    setPromptHelperStatus("success");
    setImagePrompt(prompt);
  };

  const handlePromptHelperGenerateAi = async () => {
    if (!apiBaseUrl) {
      onError?.("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    if (!hasPromptHelperSelection) {
      onError?.("Select at least one prompt helper field.");
      return;
    }
    onError?.("");
    setPromptHelperStatus("loading");

    try {
      const data = await generatePromptHelper(apiBaseUrl, {
        background: promptHelperSelections.background.trim() || undefined,
        character: promptHelperSelections.character.trim() || undefined,
        pose: promptHelperSelections.pose.trim() || undefined,
        signatureTraits:
          promptHelperSelections.signatureTraits.trim() || undefined,
        faceDetails: promptHelperSelections.faceDetails.trim() || undefined,
        eyeDetails: promptHelperSelections.eyeDetails.trim() || undefined,
        breastSize: promptHelperSelections.breastSize.trim() || undefined,
        ears: promptHelperSelections.ears.trim() || undefined,
        tails: promptHelperSelections.tails.trim() || undefined,
        horns: promptHelperSelections.horns.trim() || undefined,
        wings: promptHelperSelections.wings.trim() || undefined,
        hairStyles: promptHelperSelections.hairStyles.trim() || undefined,
        viewDistance: promptHelperSelections.viewDistance.trim() || undefined,
        accessories: promptHelperSelections.accessories.trim() || undefined,
        markings: promptHelperSelections.markings.trim() || undefined,
        outfitMaterials:
          promptHelperSelections.outfitMaterials.trim() || undefined,
        styleReference:
          promptHelperSelections.styleReference.trim() || undefined,
      });
      if (data?.prompt) {
        setImagePrompt(data.prompt);
      }
      setImageNegativePrompt(defaultNegativePrompt);
      setPromptHelperStatus("success");
    } catch (error) {
      setPromptHelperStatus("error");
      onError?.(error?.message || "Prompt helper failed.");
    }
  };

  const handlePromptSelectionChange = (field, value) => {
    setPromptHelperSelections((prev) => ({
      ...prev,
      [field]: value,
    }));
    setPromptHelperStatus("idle");
  };

  const promptCharacterOptions = useMemo(
    () =>
      characterPresets.length
        ? characterPresets.map((preset) => preset.name).filter(Boolean)
        : [],
    [characterPresets]
  );

  const handleCharacterSelection = (value) => {
    const preset = characterPresetMap.get(value.trim().toLowerCase());
    if (preset) {
      setPromptHelperSelections((prev) => ({
        ...prev,
        character: preset.name || value,
        pose: preset.pose || "",
        signatureTraits: preset.signatureTraits || "",
        faceDetails: preset.faceDetails || "",
        eyeDetails: preset.eyeDetails || "",
        breastSize: preset.breastSize || "",
        ears: preset.ears || "",
        tails: preset.tails || "",
        horns: preset.horns || "",
        wings: preset.wings || "",
        hairStyles: preset.hairStyles || "",
        viewDistance: preset.viewDistance || "",
        accessories: preset.accessories || "",
        markings: preset.markings || "",
        outfitMaterials: preset.outfitMaterials || "",
        styleReference: preset.styleReference || "",
      }));
    setImageNegativePrompt(defaultNegativePrompt);
    } else {
      setPromptHelperSelections((prev) => ({
        ...prev,
        character: value,
      }));
    }
    setPromptHelperStatus("idle");
  };

  const promptHelperProps = {
    selections: promptHelperSelections,
    onSelectionChange: handlePromptSelectionChange,
    onCharacterChange: handleCharacterSelection,
    onCreate: handlePromptHelperCreate,
    onAiGenerate: handlePromptHelperGenerateAi,
    isLoading: isPromptHelperLoading,
    status: promptHelperStatus,
    hasSelection: hasPromptHelperSelection,
    promptBackgrounds: promptHelperOptions.backgrounds,
    promptCharacters: promptCharacterOptions,
    promptPoses: promptHelperOptions.poses,
    promptTraits: promptHelperOptions.traits,
    promptFaceDetails: promptHelperOptions.faceDetails,
    promptEyeDetails: promptHelperOptions.eyeDetails,
    promptBreastSizes: promptHelperOptions.breastSizes,
    promptEars: promptHelperOptions.ears,
    promptTails: promptHelperOptions.tails,
    promptHorns: promptHelperOptions.horns,
    promptWings: promptHelperOptions.wings,
    promptHairStyles: promptHelperOptions.hairStyles,
    promptViewDistance: promptHelperOptions.viewDistance,
    promptAccessories: promptHelperOptions.accessories,
    promptMarkings: promptHelperOptions.markings,
    promptOutfits: promptHelperOptions.outfits,
    promptStyles: promptHelperOptions.styles,
  };

  const imageGenerationProps = {
    imageSource,
    imageModel,
    imageModelOptions,
    onSelectModel: setImageModel,
    imageGenerationName,
    onImageNameChange: setImageGenerationName,
    promptHelperProps,
    imagePrompt,
    onImagePromptChange: setImagePrompt,
    imageNegativePrompt,
    onImageNegativePromptChange: setImageNegativePrompt,
    imageSize,
    imageSizeOptions,
    onImageSizeChange: setImageSize,
    imageCount,
    imageCountOptions,
    onImageCountChange: setImageCount,
    imageScheduler,
    imageSchedulerOptions,
    onImageSchedulerChange: setImageScheduler,
    onGenerateImage: handleGenerateImage,
    isGeneratingImage,
    imageGenerationNotice,
    loraSupportNotice: localLoraSupportNotice,
    civitaiLoraMode,
    onCivitaiLoraModeChange: setCivitaiLoraMode,
    civitaiCatalogQuery,
    onCivitaiCatalogQueryChange: setCivitaiCatalogQuery,
    civitaiCatalogResults,
    civitaiRuntimeLoras,
    onAddCivitaiRuntimeLora: addCivitaiRuntimeLora,
    onRemoveCivitaiRuntimeLora: removeCivitaiRuntimeLora,
    onCivitaiRuntimeLoraStrengthChange: updateCivitaiRuntimeLoraStrength,
    civitaiRuntimeLoraLimit: CIVITAI_MAX_RUNTIME_LORAS,
  };

  const imageUploadProps = {
    imageName,
    onImageNameChange: setImageName,
    selectedFile,
    previewUrl,
    onFileChange: handleFileChange,
    onUpload: handleUpload,
    uploadKey,
    isUploading,
  };

  return {
    imageSource,
    setImageSource,
    imageSourceOptions,
    imageGenerationProps,
    imageUploadProps,
    isGeneratingImage,
    isUploading,
    resetImageForm,
  };
};
