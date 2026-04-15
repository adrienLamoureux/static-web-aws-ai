import { useState } from "react";
import { useImageModels } from "./useImageModels";
import { usePromptBuilder } from "./usePromptBuilder";
import { useCivitaiLora } from "./useCivitaiLora";
import { useImageGeneration } from "./useImageGeneration";
import {
  DEFAULT_IMAGE_SOURCE,
  DEFAULT_IMAGE_PROMPT,
  CIVITAI_MAX_RUNTIME_LORAS,
} from "./image-studio-constants";

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
  const [imagePrompt, setImagePrompt] = useState(DEFAULT_IMAGE_PROMPT);
  const [imageNegativePrompt, setImageNegativePrompt] = useState("");
  const [imageGenerationName, setImageGenerationName] = useState("");

  // ─── Sub-hooks ──────────────────────────────────────────────────────────────

  const models = useImageModels({
    imageSource,
    directorImageModels,
    directorCivitaiModels,
    directorGenerationByModel,
  });

  const promptBuilder = usePromptBuilder({
    apiBaseUrl,
    imagePrompt,
    setImagePrompt,
    imageNegativePrompt,
    setImageNegativePrompt,
    onError,
  });

  const civitaiLora = useCivitaiLora({
    apiBaseUrl,
    imageSource,
    loraCatalogEntries,
  });

  const generation = useImageGeneration({
    apiBaseUrl,
    imageSource,
    imageModel: models.imageModel,
    imageSize: models.imageSize,
    imageScheduler: models.imageScheduler,
    imageSchedulerOptions: models.imageSchedulerOptions,
    imageCount: models.imageCount,
    imagePrompt,
    imageNegativePrompt,
    imageGenerationName,
    selectedLoraProfileId,
    civitaiLoraMode: civitaiLora.civitaiLoraMode,
    civitaiRuntimeLoras: civitaiLora.civitaiRuntimeLoras,
    persistRuntimeCivitaiProfileIfNeeded: civitaiLora.persistRuntimeCivitaiProfileIfNeeded,
    loraImageSupportByModel,
    loraImageSupportByProviderModel,
    supportedImageLoraModels,
    supportedImageLoraModelsByProvider,
    onError,
    onVideoReady,
    onResetVideoReady,
    onAddVideoReadyImage,
    onCloseImageModal,
    onGenerationComplete,
  });

  // ─── Cross-cutting reset ─────────────────────────────────────────────────────

  const resetImageForm = () => {
    setImageSource(DEFAULT_IMAGE_SOURCE);
    setImageGenerationName("");
    models.resetModels();
    generation.resetImageGeneration();
    civitaiLora.resetCivitaiLora();
    promptBuilder.resetPromptBuilder();
    setImagePrompt(DEFAULT_IMAGE_PROMPT);
    setImageNegativePrompt(promptBuilder.defaultNegativePrompt);
    onResetVideoReady?.();
  };

  // ─── Composed props objects ──────────────────────────────────────────────────

  const imageGenerationProps = {
    imageSource,
    imageModel: models.imageModel,
    imageModelOptions: models.imageModelOptions,
    onSelectModel: models.setImageModel,
    imageGenerationName,
    onImageNameChange: setImageGenerationName,
    promptHelperProps: promptBuilder.promptHelperProps,
    imagePrompt,
    onImagePromptChange: setImagePrompt,
    imageNegativePrompt,
    onImageNegativePromptChange: setImageNegativePrompt,
    imageSize: models.imageSize,
    imageSizeOptions: models.imageSizeOptions,
    onImageSizeChange: models.setImageSize,
    imageCount: models.imageCount,
    imageCountOptions: models.imageCountOptions,
    onImageCountChange: models.setImageCount,
    imageScheduler: models.imageScheduler,
    imageSchedulerOptions: models.imageSchedulerOptions,
    onImageSchedulerChange: models.setImageScheduler,
    onGenerateImage: generation.handleGenerateImage,
    isGeneratingImage: generation.isGeneratingImage,
    imageGenerationNotice: generation.imageGenerationNotice,
    loraSupportNotice: generation.localLoraSupportNotice,
    civitaiLoraMode: civitaiLora.civitaiLoraMode,
    onCivitaiLoraModeChange: civitaiLora.setCivitaiLoraMode,
    civitaiCatalogQuery: civitaiLora.civitaiCatalogQuery,
    onCivitaiCatalogQueryChange: civitaiLora.setCivitaiCatalogQuery,
    civitaiCatalogResults: civitaiLora.civitaiCatalogResults,
    civitaiRuntimeLoras: civitaiLora.civitaiRuntimeLoras,
    onAddCivitaiRuntimeLora: civitaiLora.addCivitaiRuntimeLora,
    onRemoveCivitaiRuntimeLora: civitaiLora.removeCivitaiRuntimeLora,
    onCivitaiRuntimeLoraStrengthChange: civitaiLora.updateCivitaiRuntimeLoraStrength,
    civitaiRuntimeLoraLimit: CIVITAI_MAX_RUNTIME_LORAS,
  };

  // ─── Public API (identical shape to original) ────────────────────────────────

  return {
    imageSource,
    setImageSource,
    imageSourceOptions: models.imageSourceOptions,
    imageGenerationProps,
    imageUploadProps: generation.imageUploadProps,
    isGeneratingImage: generation.isGeneratingImage,
    isUploading: generation.isUploading,
    resetImageForm,
  };
};
