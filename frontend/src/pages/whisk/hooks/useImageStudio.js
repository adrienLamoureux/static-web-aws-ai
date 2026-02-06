import { useEffect, useMemo, useState } from "react";
import {
  generateBedrockImage,
  generatePromptHelper,
} from "../../../services/bedrock";
import { generateReplicateImage } from "../../../services/replicate";
import { createVideoReadyImage } from "../../../services/images";
import {
  putFileToUrl,
  requestImageUploadUrl,
} from "../../../services/s3";
import { buildSafeFileName } from "../../../utils/fileName";
import promptBackgrounds from "../../../data/prompt-helper/backgrounds.json";
import promptPoses from "../../../data/prompt-helper/poses.json";
import promptArchetypes from "../../../data/prompt-helper/archetypes.json";
import promptTraits from "../../../data/prompt-helper/traits.json";
import promptOutfits from "../../../data/prompt-helper/outfits.json";
import promptPalettes from "../../../data/prompt-helper/palettes.json";
import promptStyles from "../../../data/prompt-helper/styles.json";
import promptFaceDetails from "../../../data/prompt-helper/face-details.json";
import promptEyeDetails from "../../../data/prompt-helper/eye-details.json";
import promptHairDetails from "../../../data/prompt-helper/hair-details.json";
import promptExpressions from "../../../data/prompt-helper/expressions.json";
import { listStoryCharacters } from "../../../services/story";
import { listPromptHelperOptions } from "../../../services/promptHelper";

const DEFAULT_IMAGE_SOURCE = "replicate";
const DEFAULT_IMAGE_MODEL = "animagine";
const DEFAULT_IMAGE_PROMPT =
  "Anime key visual, cinematic lighting, clean line art, soft gradients";
const DEFAULT_IMAGE_NEGATIVE_PROMPT =
  "photorealistic, 3d render, text, watermark";
const DEFAULT_IMAGE_SIZE = "1280x720";
const DEFAULT_IMAGE_SCHEDULER = "DPM++ 2M Karras";
const DEFAULT_PROMPT_HELPER_SELECTIONS = {
  background: "",
  character: "",
  pose: "",
  archetype: "",
  signatureTraits: "",
  faceDetails: "",
  eyeDetails: "",
  hairDetails: "",
  expression: "",
  outfitMaterials: "",
  colorPalette: "",
  styleReference: "",
};

export const useImageStudio = ({
  apiBaseUrl,
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
  const [imageNegativePrompt, setImageNegativePrompt] = useState(
    DEFAULT_IMAGE_NEGATIVE_PROMPT
  );
  const [imageSize, setImageSize] = useState(DEFAULT_IMAGE_SIZE);
  const [imageScheduler, setImageScheduler] = useState(
    DEFAULT_IMAGE_SCHEDULER
  );
  const [imageGenerationStatus, setImageGenerationStatus] = useState("idle");
  const [promptHelperStatus, setPromptHelperStatus] = useState("idle");
  const [imageGenerationNotice, setImageGenerationNotice] = useState("");
  const [promptHelperSelections, setPromptHelperSelections] = useState(
    DEFAULT_PROMPT_HELPER_SELECTIONS
  );
  const [promptHelperOptions, setPromptHelperOptions] = useState({
    backgrounds: promptBackgrounds,
    poses: promptPoses,
    archetypes: promptArchetypes,
    traits: promptTraits,
    faceDetails: promptFaceDetails,
    eyeDetails: promptEyeDetails,
    hairDetails: promptHairDetails,
    expressions: promptExpressions,
    outfits: promptOutfits,
    palettes: promptPalettes,
    styles: promptStyles,
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [uploadKey, setUploadKey] = useState("");
  const [uploadStatus, setUploadStatus] = useState("idle");

  const isUploading = uploadStatus === "uploading";
  const isGeneratingImage = imageGenerationStatus === "loading";
  const isPromptHelperLoading = promptHelperStatus === "loading";
  const hasPromptHelperSelection = Boolean(
    promptHelperSelections.background ||
      promptHelperSelections.character ||
      promptHelperSelections.pose ||
      promptHelperSelections.archetype ||
      promptHelperSelections.signatureTraits ||
      promptHelperSelections.faceDetails ||
      promptHelperSelections.eyeDetails ||
      promptHelperSelections.hairDetails ||
      promptHelperSelections.expression ||
      promptHelperSelections.outfitMaterials ||
      promptHelperSelections.colorPalette ||
      promptHelperSelections.styleReference
  );

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
        setPromptHelperOptions((prev) => ({
          backgrounds: Array.isArray(data.backgrounds)
            ? data.backgrounds
            : prev.backgrounds,
          poses: Array.isArray(data.poses) ? data.poses : prev.poses,
          archetypes: Array.isArray(data.archetypes)
            ? data.archetypes
            : prev.archetypes,
          traits: Array.isArray(data.traits) ? data.traits : prev.traits,
          faceDetails: Array.isArray(data.faceDetails)
            ? data.faceDetails
            : prev.faceDetails,
          eyeDetails: Array.isArray(data.eyeDetails)
            ? data.eyeDetails
            : prev.eyeDetails,
          hairDetails: Array.isArray(data.hairDetails)
            ? data.hairDetails
            : prev.hairDetails,
          expressions: Array.isArray(data.expressions)
            ? data.expressions
            : prev.expressions,
          outfits: Array.isArray(data.outfits) ? data.outfits : prev.outfits,
          palettes: Array.isArray(data.palettes) ? data.palettes : prev.palettes,
          styles: Array.isArray(data.styles) ? data.styles : prev.styles,
        }));
      })
      .catch((error) => {
        onError?.(error?.message || "Failed to load prompt helper options.");
      });
  }, [apiBaseUrl, onError]);

  const resetImageForm = () => {
    setImageSource(DEFAULT_IMAGE_SOURCE);
    setImageModel(DEFAULT_IMAGE_MODEL);
    setImageGenerationName("");
    setImagePrompt(DEFAULT_IMAGE_PROMPT);
    setImageNegativePrompt(DEFAULT_IMAGE_NEGATIVE_PROMPT);
    setImageSize(DEFAULT_IMAGE_SIZE);
    setImageScheduler(DEFAULT_IMAGE_SCHEDULER);
    setImageGenerationStatus("idle");
    setImageGenerationNotice("");
    setPromptHelperStatus("idle");
    setPromptHelperSelections({ ...DEFAULT_PROMPT_HELPER_SELECTIONS });
    setSelectedFile(null);
    setPreviewUrl("");
    setImageName("");
    setUploadKey("");
    setUploadStatus("idle");
    onResetVideoReady?.();
  };

  const characterPresetMap = useMemo(() => {
    const entries = (characterPresets || []).map((preset) => [
      (preset.name || "").toLowerCase(),
      preset,
    ]);
    return new Map(entries);
  }, [characterPresets]);

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
      key: "upload",
      name: "Upload a JPEG",
      description: "Send your own image to S3",
    },
  ];

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
    return [
      {
        key: "animagine",
        name: "Animagine XL v4 Opt",
        description: "High-fidelity anime characters",
      },
      {
        key: "seedream-4.5",
        name: "Seedream 4.5",
        description: "High-resolution cinematic scenes",
      },
      {
        key: "proteus",
        name: "Proteus v0.3",
        description: "Stylized anime portraits",
      },
    ];
  }, [imageSource]);

  const imageSizeOptions = useMemo(() => {
    if (imageModel === "animagine") {
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
  }, [imageSource, imageModel]);

  const imageSchedulerOptions = useMemo(() => {
    if (imageSource === "replicate" && imageModel === "animagine") {
      return [
        { value: "DPM++ 2M Karras", label: "DPM++ 2M Karras" },
        { value: "Euler a", label: "Euler a" },
      ];
    }
    return [];
  }, [imageSource, imageModel]);

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
    const allowedModels = imageModelOptions.map((option) => option.key);
    if (!allowedModels.includes(imageModel)) {
      setImageModel(imageModelOptions[0]?.key || "titan");
    }
  }, [imageModel, imageModelOptions]);

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
    onError?.("");
    setImageGenerationStatus("loading");
    onResetVideoReady?.();
    setImageGenerationNotice("");
    onCloseImageModal?.();

    try {
      const [width, height] = imageSize.split("x").map(Number);
      const payload = {
        model: imageModel,
        imageName: imageGenerationName.trim(),
        prompt: imagePrompt.trim(),
        negativePrompt: imageNegativePrompt.trim() || undefined,
        width,
        height,
        numImages: 1,
        ...(imageSource === "replicate" && imageSchedulerOptions.length > 0
          ? { scheduler: imageScheduler }
          : {}),
      };
      const data =
        imageSource === "bedrock"
          ? await generateBedrockImage(apiBaseUrl, payload)
          : await generateReplicateImage(apiBaseUrl, payload);
      setImageGenerationNotice(data?.notice || "");
      setImageGenerationStatus("success");
      onGenerationComplete?.();
    } catch (error) {
      setImageGenerationStatus("error");
      onError?.(error?.message || "Image generation failed.");
    }
  };

  const buildPromptFromSelections = () => {
    const parts = [];
    const pushTrimmed = (value) => {
      const trimmed = value?.trim();
      if (trimmed) {
        parts.push(trimmed);
      }
    };
    pushTrimmed(promptHelperSelections.background);
    if (promptHelperSelections.character?.trim()) {
      parts.push("1girl, solo");
      const characterValue = promptHelperSelections.character.trim();
      const preset = characterPresetMap.get(characterValue.toLowerCase());
      if (preset?.name) {
        parts.push(`(${preset.name}:1.4)`);
      } else {
        parts.push(characterValue);
      }
    }
    pushTrimmed(promptHelperSelections.archetype);
    pushTrimmed(promptHelperSelections.signatureTraits);
    pushTrimmed(promptHelperSelections.faceDetails);
    pushTrimmed(promptHelperSelections.eyeDetails);
    pushTrimmed(promptHelperSelections.hairDetails);
    pushTrimmed(promptHelperSelections.expression);
    pushTrimmed(promptHelperSelections.pose);
    pushTrimmed(promptHelperSelections.outfitMaterials);
    pushTrimmed(promptHelperSelections.colorPalette);
    pushTrimmed(promptHelperSelections.styleReference);
    return parts.filter(Boolean).join(", ");
  };

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
    const selectedPreset = characterPresetMap.get(
      (promptHelperSelections.character || "").trim().toLowerCase()
    );
    if (selectedPreset?.storyNegativePrompt) {
      setImageNegativePrompt(selectedPreset.storyNegativePrompt);
    }
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
        archetype: promptHelperSelections.archetype.trim() || undefined,
        signatureTraits:
          promptHelperSelections.signatureTraits.trim() || undefined,
        faceDetails: promptHelperSelections.faceDetails.trim() || undefined,
        eyeDetails: promptHelperSelections.eyeDetails.trim() || undefined,
        hairDetails: promptHelperSelections.hairDetails.trim() || undefined,
        expression: promptHelperSelections.expression.trim() || undefined,
        outfitMaterials:
          promptHelperSelections.outfitMaterials.trim() || undefined,
        colorPalette: promptHelperSelections.colorPalette.trim() || undefined,
        styleReference:
          promptHelperSelections.styleReference.trim() || undefined,
      });
      if (data?.prompt) {
        setImagePrompt(data.prompt);
      }
      if (data?.negativePrompt) {
        setImageNegativePrompt(data.negativePrompt);
      }
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
        pose: preset.pose || prev.pose,
        archetype: preset.archetype || "",
        signatureTraits: preset.signatureTraits || "",
        faceDetails: preset.faceDetails || "",
        eyeDetails: preset.eyeDetails || "",
        hairDetails: preset.hairDetails || "",
        expression: preset.expression || "",
        outfitMaterials: preset.outfitMaterials || "",
        colorPalette: preset.colorPalette || "",
        styleReference: preset.styleReference || "",
      }));
      if (preset.storyNegativePrompt) {
        setImageNegativePrompt(preset.storyNegativePrompt);
      }
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
    promptArchetypes: promptHelperOptions.archetypes,
    promptTraits: promptHelperOptions.traits,
    promptFaceDetails: promptHelperOptions.faceDetails,
    promptEyeDetails: promptHelperOptions.eyeDetails,
    promptHairDetails: promptHelperOptions.hairDetails,
    promptExpressions: promptHelperOptions.expressions,
    promptOutfits: promptHelperOptions.outfits,
    promptPalettes: promptHelperOptions.palettes,
    promptStyles: promptHelperOptions.styles,
  };

  const imageGenerationProps = {
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
    imageScheduler,
    imageSchedulerOptions,
    onImageSchedulerChange: setImageScheduler,
    onGenerateImage: handleGenerateImage,
    isGeneratingImage,
    imageGenerationNotice,
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
