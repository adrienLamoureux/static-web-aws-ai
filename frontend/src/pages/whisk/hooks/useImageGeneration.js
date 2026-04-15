import { useMemo, useRef, useEffect, useState } from "react";
import { generateBedrockImage } from "../../../services/bedrock";
import { generateReplicateImage, getReplicateImageStatus } from "../../../services/replicate";
import { generateCivitaiImage, getCivitaiImageStatus } from "../../../services/civitai";
import { generateHuggingFaceImage } from "../../../services/huggingface";
import { createVideoReadyImage } from "../../../services/images";
import { putFileToUrl, requestImageUploadUrl } from "../../../services/s3";
import { buildSafeFileName } from "../../../utils/fileName";
import { CIVITAI_LORA_MODE_QUICK, CIVITAI_RUNTIME_PROFILE_ID } from "./image-studio-constants";

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

export const useImageGeneration = ({
  apiBaseUrl,
  imageSource,
  imageModel,
  imageSize,
  imageScheduler,
  imageSchedulerOptions,
  imageCount,
  imagePrompt,
  imageNegativePrompt,
  imageGenerationName,
  selectedLoraProfileId,
  civitaiLoraMode,
  civitaiRuntimeLoras,
  persistRuntimeCivitaiProfileIfNeeded,
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
}) => {
  const [imageGenerationStatus, setImageGenerationStatus] = useState("idle");
  const [imageGenerationNotice, setImageGenerationNotice] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [uploadKey, setUploadKey] = useState("");
  const [uploadStatus, setUploadStatus] = useState("idle");

  const replicatePollRef = useRef(null);

  const isUploading = uploadStatus === "uploading";
  const isGeneratingImage = imageGenerationStatus === "loading";

  const clearReplicatePoll = () => {
    if (replicatePollRef.current) {
      clearTimeout(replicatePollRef.current);
      replicatePollRef.current = null;
    }
  };

  // Cleanup poll on unmount
  useEffect(() => () => clearReplicatePoll(), []);

  // Object URL lifecycle for file preview
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  const loraSupportBySourceModel = useMemo(
    () => ({
      replicate: loraImageSupportByProviderModel?.replicate || loraImageSupportByModel || {},
      civitai: loraImageSupportByProviderModel?.civitai || {},
    }),
    [loraImageSupportByModel, loraImageSupportByProviderModel]
  );

  const supportedLoraModelsBySource = useMemo(
    () => ({
      replicate: supportedImageLoraModelsByProvider?.replicate || supportedImageLoraModels || [],
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

  const startReplicateImagePolling = ({
    predictionId,
    batchId,
    imageName: pollImageName,
    prompt,
    negativePrompt,
  }) => {
    if (!apiBaseUrl) return;
    const poll = async () => {
      try {
        const data = await getReplicateImageStatus(apiBaseUrl, {
          predictionId,
          batchId,
          imageName: pollImageName,
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
          onError?.(data?.error || "Replicate image generation failed.");
          return;
        }
        setImageGenerationNotice("Replicate is still generating the image...");
      } catch (_error) {
        setImageGenerationNotice("Replicate is still generating the image...");
      }
      replicatePollRef.current = setTimeout(poll, 2500);
    };
    clearReplicatePoll();
    replicatePollRef.current = setTimeout(poll, 2500);
  };

  const startCivitaiImagePolling = ({
    token,
    batchId,
    imageName: pollImageName,
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
          imageName: pollImageName,
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

      const videoReadyData = await createVideoReadyImage(apiBaseUrl, presignData.key);
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
        characterId: resolvedCharacterId || activeCharacterIdForGeneration || undefined,
        width,
        height,
        numImages:
          imageSource === "replicate" || imageSource === "civitai" ? Number(imageCount) || 1 : 1,
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
      if (data?.predictionId && data?.status && data.status !== "succeeded") {
        if (data.status === "failed" || data.status === "canceled") {
          setImageGenerationStatus("error");
          onError?.(data?.error || "Replicate image generation failed.");
          return;
        }
        setImageGenerationNotice(
          data?.notice || "Replicate is processing the image. We'll keep checking."
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

  const resetImageGeneration = () => {
    setImageGenerationStatus("idle");
    setImageGenerationNotice("");
    setSelectedFile(null);
    setPreviewUrl("");
    setImageName("");
    setUploadKey("");
    setUploadStatus("idle");
    clearReplicatePoll();
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
    imageGenerationStatus,
    setImageGenerationStatus,
    imageGenerationNotice,
    isGeneratingImage,
    isUploading,
    localLoraSupportNotice,
    loraUnsupportedForCurrentSelection,
    handleGenerateImage,
    imageUploadProps,
    resetImageGeneration,
    clearReplicatePoll,
  };
};
