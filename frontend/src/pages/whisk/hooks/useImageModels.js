import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_SIZE,
  DEFAULT_IMAGE_SCHEDULER,
  DEFAULT_IMAGE_COUNT,
  FALLBACK_REPLICATE_IMAGE_MODELS,
  FALLBACK_CIVITAI_IMAGE_MODELS,
} from "./image-studio-constants";

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

export const useImageModels = ({
  imageSource,
  directorImageModels = [],
  directorCivitaiModels = [],
  directorGenerationByModel = {},
}) => {
  const [imageModel, setImageModel] = useState(DEFAULT_IMAGE_MODEL);
  const [imageSize, setImageSize] = useState(DEFAULT_IMAGE_SIZE);
  const [imageScheduler, setImageScheduler] = useState(DEFAULT_IMAGE_SCHEDULER);
  const [imageCount, setImageCount] = useState(DEFAULT_IMAGE_COUNT);

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

  const imageCountOptions = useMemo(
    () => [
      { value: "1", label: "1 image" },
      { value: "2", label: "2 images" },
    ],
    []
  );

  // Sync model when available options change
  useEffect(() => {
    const allowedModels = imageModelOptions.map((option) => option.key);
    if (!allowedModels.includes(imageModel)) {
      setImageModel(
        imageModelOptions[0]?.key ||
          (imageSource === "bedrock" ? "titan" : DEFAULT_IMAGE_MODEL)
      );
    }
  }, [imageModel, imageModelOptions, imageSource]);

  // Sync size when available options change
  useEffect(() => {
    const allowedValues = imageSizeOptions.map((option) => option.value);
    if (!allowedValues.includes(imageSize)) {
      setImageSize(imageSizeOptions[0]?.value || "1024x1024");
    }
  }, [imageModel, imageSizeOptions, imageSize]);

  // Sync scheduler when available options change
  useEffect(() => {
    if (imageSchedulerOptions.length === 0) return;
    const allowedValues = imageSchedulerOptions.map((option) => option.value);
    if (!allowedValues.includes(imageScheduler)) {
      setImageScheduler(imageSchedulerOptions[0]?.value || "Euler a");
    }
  }, [imageScheduler, imageSchedulerOptions]);

  // Auto-set count to 2 when "diff" (both schedulers) is selected
  useEffect(() => {
    if (imageScheduler === "diff") {
      setImageCount("2");
    }
  }, [imageScheduler]);

  // Reset count when leaving replicate
  useEffect(() => {
    if (imageSource !== "replicate") {
      setImageCount(DEFAULT_IMAGE_COUNT);
    }
  }, [imageSource]);

  const resetModels = () => {
    setImageModel(DEFAULT_IMAGE_MODEL);
    setImageSize(DEFAULT_IMAGE_SIZE);
    setImageScheduler(DEFAULT_IMAGE_SCHEDULER);
    setImageCount(DEFAULT_IMAGE_COUNT);
  };

  return {
    imageModel,
    setImageModel,
    imageModelOptions,
    imageSourceOptions,
    imageSize,
    setImageSize,
    imageSizeOptions,
    imageScheduler,
    setImageScheduler,
    imageSchedulerOptions,
    imageCount,
    setImageCount,
    imageCountOptions,
    resetModels,
  };
};
