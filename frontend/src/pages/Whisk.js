import React, { useEffect, useMemo, useState } from "react";
import ImageSourceSelector from "../components/home/ImageSourceSelector";
import ImageGenerationPanel from "../components/home/ImageGenerationPanel";
import ImageUploadPanel from "../components/home/ImageUploadPanel";
import VideoGenerationPanel from "../components/home/VideoGenerationPanel";
import { deleteImage, listImages } from "../services/s3";
import {
  generateBedrockImage,
  generateNovaReelVideo,
  generatePromptHelper,
  getNovaReelJobStatus,
} from "../services/bedrock";
import {
  generateReplicateImage,
  generateReplicateVideo,
  getReplicateVideoStatus,
} from "../services/replicate";
import {
  putFileToUrl,
  requestImageUploadUrl,
} from "../services/s3";
import {
  createVideoReadyImage,
  selectGeneratedImage,
} from "../services/images";
import promptBackgrounds from "../data/prompt-helper/backgrounds.json";
import promptCharacters from "../data/prompt-helper/characters.json";
import promptPoses from "../data/prompt-helper/poses.json";
import promptArchetypes from "../data/prompt-helper/archetypes.json";
import promptTraits from "../data/prompt-helper/traits.json";
import promptOutfits from "../data/prompt-helper/outfits.json";
import promptPalettes from "../data/prompt-helper/palettes.json";
import promptStyles from "../data/prompt-helper/styles.json";
import promptFaceDetails from "../data/prompt-helper/face-details.json";
import promptEyeDetails from "../data/prompt-helper/eye-details.json";
import promptHairDetails from "../data/prompt-helper/hair-details.json";
import promptExpressions from "../data/prompt-helper/expressions.json";
import characterPresets from "../data/prompt-helper/character-presets.json";

const buildSafeFileName = (name = "") =>
  name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");

function Whisk({ apiBaseUrl = "" }) {
  const [images, setImages] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [featuredKey, setFeaturedKey] = useState("");
  const [activeModal, setActiveModal] = useState("");
  const [videoSelectStatus, setVideoSelectStatus] = useState("idle");
  const [imageSource, setImageSource] = useState("replicate");
  const [imageModel, setImageModel] = useState("animagine");
  const [imageGenerationName, setImageGenerationName] = useState("");
  const [imagePrompt, setImagePrompt] = useState(
    "Anime key visual, cinematic lighting, clean line art, soft gradients"
  );
  const [imageNegativePrompt, setImageNegativePrompt] = useState(
    "photorealistic, 3d render, text, watermark"
  );
  const [imageSize, setImageSize] = useState("1280x720");
  const [imageScheduler, setImageScheduler] = useState("diff");
  const [imageNumImages, setImageNumImages] = useState(2);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [imageGenerationStatus, setImageGenerationStatus] = useState("idle");
  const [promptHelperStatus, setPromptHelperStatus] = useState("idle");
  const [imageSelectionStatus, setImageSelectionStatus] = useState("idle");
  const [selectingImageKey, setSelectingImageKey] = useState("");
  const [selectedGeneratedKey, setSelectedGeneratedKey] = useState("");
  const [imageGenerationNotice, setImageGenerationNotice] = useState("");
  const [promptHelperSelections, setPromptHelperSelections] = useState({
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
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [prompt, setPrompt] = useState("A cinematic push-in on the scene.");
  const [imageName, setImageName] = useState("");
  const [uploadKey, setUploadKey] = useState("");
  const [selectedImageKey, setSelectedImageKey] = useState("");
  const [selectedImageUrl, setSelectedImageUrl] = useState("");
  const [videoProvider, setVideoProvider] = useState("bedrock");
  const [videoModel, setVideoModel] = useState("nova-reel");
  const [videoGenerateAudio, setVideoGenerateAudio] = useState(true);
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [generationStatus, setGenerationStatus] = useState("idle");
  const [generationResponse, setGenerationResponse] = useState(null);
  const [invocationArn, setInvocationArn] = useState("");
  const [outputPrefix, setOutputPrefix] = useState("");
  const [jobStatus, setJobStatus] = useState("");
  const [replicatePredictionId, setReplicatePredictionId] = useState("");
  const [replicateJobStatus, setReplicateJobStatus] = useState("");

  const resolvedApiBaseUrl =
    apiBaseUrl || process.env.REACT_APP_API_URL || "";

  const isUploading = uploadStatus === "uploading";
  const isGenerating = generationStatus === "loading";
  const isVideoInProgress =
    isGenerating ||
    jobStatus === "InProgress" ||
    (videoProvider === "replicate" &&
      (replicateJobStatus === "starting" ||
        replicateJobStatus === "processing"));
  const isGeneratingImage = imageGenerationStatus === "loading";
  const isPromptHelperLoading = promptHelperStatus === "loading";
  const isSelectingImage = imageSelectionStatus === "loading";
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

  const characterPresetMap = useMemo(() => {
    const entries = (characterPresets || []).map((preset) => [
      preset.name.toLowerCase(),
      preset,
    ]);
    return new Map(entries);
  }, []);

  useEffect(() => {
    if (!resolvedApiBaseUrl) return;
    let isMounted = true;
    const loadImages = async () => {
      setStatus("loading");
      setError("");
      try {
        const data = await listImages(resolvedApiBaseUrl);
        if (!isMounted) return;
        setImages(data.images || []);
        setStatus("success");
      } catch (err) {
        if (!isMounted) return;
        setStatus("error");
        setError(err?.message || "Failed to load images.");
      }
    };
    loadImages();
    return () => {
      isMounted = false;
    };
  }, [resolvedApiBaseUrl]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

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
        { value: "diff", label: "Diff (Euler a vs DPM++ 2M Karras)" },
        { value: "Euler a", label: "Euler a" },
        { value: "DPM++ 2M Karras", label: "DPM++ 2M Karras" },
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
    if (imageScheduler === "diff") {
      setImageNumImages(2);
    }
  }, [imageScheduler]);

  useEffect(() => {
    const allowedModels = imageModelOptions.map((option) => option.key);
    if (!allowedModels.includes(imageModel)) {
      setImageModel(imageModelOptions[0]?.key || "titan");
    }
  }, [imageModel, imageModelOptions]);

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

  const videoProviderOptions = [
    {
      key: "bedrock",
      name: "Bedrock",
      description: "Nova Reel",
    },
    {
      key: "replicate",
      name: "Replicate",
      description: "WAN i2v fast",
    },
  ];

  const videoModelOptions = useMemo(() => {
    if (videoProvider === "replicate") {
      return [
        {
          key: "wan-2.2-i2v-fast",
          name: "wan-2.2-i2v-fast",
          description: "Image-to-video fast",
        },
        {
          key: "veo-3.1-fast",
          name: "veo-3.1-fast",
          description: "Image-to-video with audio",
        },
        {
          key: "kling-v2.6",
          name: "kling-v2.6",
          description: "Text-to-video",
        },
        {
          key: "seedance-1.5-pro",
          name: "seedance-1.5-pro",
          description: "Text-to-video with audio",
        },
      ];
    }
    return [
      {
        key: "nova-reel",
        name: "amazon.nova-reel-v1:1",
        description: "Bedrock Nova Reel",
      },
    ];
  }, [videoProvider]);

  const isReplicateAudioOption =
    videoProvider === "replicate" &&
    (videoModel === "veo-3.1-fast" ||
      videoModel === "kling-v2.6" ||
      videoModel === "seedance-1.5-pro");

  useEffect(() => {
    const allowedModels = videoModelOptions.map((option) => option.key);
    if (!allowedModels.includes(videoModel)) {
      setVideoModel(videoModelOptions[0]?.key || "nova-reel");
    }
  }, [videoModel, videoModelOptions]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "image/jpeg") {
      setError("Please select a JPEG image.");
      setSelectedFile(null);
      return;
    }
    setError("");
    setSelectedFile(file);
    setUploadKey("");
    setSelectedImageKey("");
    setUploadStatus("idle");
    setGenerationStatus("idle");
    setGenerationResponse(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    if (!imageName.trim()) {
      setError("Image name is required.");
      return;
    }
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    setError("");
    setUploadStatus("uploading");
    setGenerationStatus("idle");
    setGenerationResponse(null);
    setInvocationArn("");
    setJobStatus("");

    const safeName = buildSafeFileName(imageName.trim()) || "upload";
    const key = `images/${safeName}.jpg`;
    const contentType = selectedFile.type || "application/octet-stream";

    try {
      const presignData = await requestImageUploadUrl(resolvedApiBaseUrl, {
        key,
        contentType,
      });

      await putFileToUrl(presignData.url, selectedFile, contentType);

      setUploadKey(presignData.key);
      setSelectedImageKey("");
      setUploadStatus("uploaded");

      const videoReadyData = await createVideoReadyImage(
        resolvedApiBaseUrl,
        presignData.key
      );
      if (videoReadyData?.videoReadyKey) {
        setSelectedImageKey(videoReadyData.videoReadyKey);
        setSelectedImageUrl(videoReadyData.url || "");
      }
      if (videoReadyData?.videoReadyKey && videoReadyData?.url) {
        setImages((prev) => {
          const exists = prev.some(
            (item) => item.key === videoReadyData.videoReadyKey
          );
          if (exists) return prev;
          return [
            { key: videoReadyData.videoReadyKey, url: videoReadyData.url },
            ...prev,
          ];
        });
      }
    } catch (err) {
      setUploadStatus("error");
      setError(err?.message || "Upload failed.");
    }
  };

  const handleGenerateImage = async () => {
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    if (!imageGenerationName.trim()) {
      setError("Image name is required.");
      return;
    }
    if (!imagePrompt.trim()) {
      setError("Prompt is required.");
      return;
    }
    setError("");
    setImageGenerationStatus("loading");
    setGeneratedImages([]);
    setSelectedImageKey("");
    setImageSelectionStatus("idle");
    setSelectingImageKey("");
    setSelectedGeneratedKey("");
    setImageGenerationNotice("");

    try {
      const [width, height] = imageSize.split("x").map(Number);
      const payload = {
        model: imageModel,
        imageName: imageGenerationName.trim(),
        prompt: imagePrompt.trim(),
        negativePrompt: imageNegativePrompt.trim() || undefined,
        width,
        height,
        numImages: imageNumImages,
        ...(imageSource === "replicate" && imageSchedulerOptions.length > 0
          ? { scheduler: imageScheduler }
          : {}),
      };
      const data =
        imageSource === "bedrock"
          ? await generateBedrockImage(resolvedApiBaseUrl, payload)
          : await generateReplicateImage(resolvedApiBaseUrl, payload);
      const nextImages = data?.images || [];
      setGeneratedImages(nextImages);
      setImageGenerationNotice(data?.notice || "");
      setImageGenerationStatus("success");
    } catch (err) {
      setImageGenerationStatus("error");
      setError(err?.message || "Image generation failed.");
    }
  };

  const handleSelectGeneratedImage = async (image) => {
    if (!image?.key) return;
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    setError("");
    setImageSelectionStatus("loading");
    setSelectingImageKey(image.key);

    try {
      const data = await selectGeneratedImage(resolvedApiBaseUrl, image.key);
      if (data?.videoReadyKey) {
        setSelectedImageKey(data.videoReadyKey);
      }
      if (image?.url) {
        setSelectedImageUrl(image.url);
      }
      setSelectedGeneratedKey(image.key);
      setGeneratedImages([image]);
      setImageSelectionStatus("success");
    } catch (err) {
      setImageSelectionStatus("error");
      setError(err?.message || "Image selection failed.");
    } finally {
      setSelectingImageKey("");
    }
  };

  const handlePromptHelperGenerate = async () => {
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    if (!hasPromptHelperSelection) {
      setError("Select at least one prompt helper field.");
      return;
    }
    setError("");
    setPromptHelperStatus("loading");

    try {
      const data = await generatePromptHelper(resolvedApiBaseUrl, {
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
    } catch (err) {
      setPromptHelperStatus("error");
      setError(err?.message || "Prompt helper failed.");
    }
  };

  const handlePromptSelectionChange = (field, value) => {
    setPromptHelperSelections((prev) => ({
      ...prev,
      [field]: value,
    }));
    setPromptHelperStatus("idle");
  };

  const handleCharacterSelection = (value) => {
    const preset = characterPresetMap.get(value.trim().toLowerCase());
    if (preset) {
      setPromptHelperSelections((prev) => ({
        ...prev,
        character: preset.name || value,
        archetype: preset.archetype || "",
        signatureTraits: preset.signatureTraits || "",
        faceDetails: preset.faceDetails || "",
        eyeDetails: preset.eyeDetails || "",
        hairDetails: preset.hairDetails || "",
        expression: preset.expression || "",
      }));
    } else {
      setPromptHelperSelections((prev) => ({
        ...prev,
        character: value,
      }));
    }
    setPromptHelperStatus("idle");
  };

  const handleGenerate = async () => {
    if (!selectedImageKey) {
      setError("Select an image before generating a video.");
      return;
    }
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    setError("");
    setGenerationStatus("loading");
    setGenerationResponse(null);
    setInvocationArn("");
    setJobStatus("");
    setReplicatePredictionId("");
    setReplicateJobStatus("");

    try {
      if (videoProvider === "replicate") {
        if (
          videoModel === "veo-3.1-fast" ||
          videoModel === "kling-v2.6" ||
          videoModel === "seedance-1.5-pro"
        ) {
          const confirmed = window.confirm(
            "This Replicate model can be expensive to run. Do you want to continue?"
          );
          if (!confirmed) {
            setGenerationStatus("idle");
            return;
          }
        }
        if (!selectedImageUrl) {
          throw new Error("Selected image URL is missing.");
        }
        const data = await generateReplicateVideo(resolvedApiBaseUrl, {
          model: videoModel,
          prompt: prompt?.trim() || undefined,
          inputKey: selectedImageKey,
          imageUrl: selectedImageUrl,
          ...(isReplicateAudioOption
            ? { generateAudio: videoGenerateAudio }
            : {}),
        });
        setGenerationResponse(data);
        if (data?.predictionId && data?.status !== "succeeded") {
          setReplicatePredictionId(data.predictionId);
          setReplicateJobStatus(data.status || "starting");
        } else {
          setGenerationStatus("success");
        }
        if (activeModal === "video") {
          setActiveModal("");
        }
      } else {
        const newOutputPrefix = `videos/${Date.now()}/`;
        const data = await generateNovaReelVideo(resolvedApiBaseUrl, {
          prompt: prompt?.trim() || undefined,
          inputKey: selectedImageKey,
          outputPrefix: newOutputPrefix,
          model: videoModel,
        });
        setGenerationResponse(data);
        setGenerationStatus("success");
        setInvocationArn(data?.response?.invocationArn || "");
        setOutputPrefix(newOutputPrefix);
        if (activeModal === "video") {
          setActiveModal("");
        }
      }
    } catch (err) {
      setGenerationStatus("error");
      setError(err?.message || "Video generation failed.");
    }
  };

  useEffect(() => {
    if (!invocationArn || !resolvedApiBaseUrl) return undefined;
    let timeoutId;
    let isCancelled = false;

    const pollStatus = async () => {
      if (isCancelled) return;
      try {
        const data = await getNovaReelJobStatus(resolvedApiBaseUrl, {
          invocationArn,
          inputKey: selectedImageKey,
          outputPrefix,
        });
        const statusValue = data?.status || "";
        setJobStatus(statusValue);
        if (statusValue === "Completed") {
          return;
        }
        if (statusValue === "Failed") {
          return;
        }
      } catch (err) {
        console.error(err);
      }
      timeoutId = setTimeout(pollStatus, 5000);
    };

    pollStatus();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [invocationArn, outputPrefix, resolvedApiBaseUrl, selectedImageKey]);

  useEffect(() => {
    if (!replicatePredictionId || !resolvedApiBaseUrl) return undefined;
    let timeoutId;
    let isCancelled = false;

    const pollReplicateStatus = async () => {
      if (isCancelled) return;
      try {
        const data = await getReplicateVideoStatus(resolvedApiBaseUrl, {
          predictionId: replicatePredictionId,
          inputKey: selectedImageKey,
        });
        const statusValue = data?.status || "";
        setReplicateJobStatus(statusValue);
        if (statusValue === "succeeded") {
          setGenerationStatus("success");
          return;
        }
        if (statusValue === "failed" || statusValue === "canceled") {
          setGenerationStatus("error");
          return;
        }
      } catch (err) {
        console.error(err);
      }
      timeoutId = setTimeout(pollReplicateStatus, 5000);
    };

    pollReplicateStatus();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [replicatePredictionId, resolvedApiBaseUrl, selectedImageKey]);

  const displayImages = useMemo(
    () =>
      images.filter(
        (image) => !image.key?.startsWith("images/video-ready/")
      ),
    [images]
  );
  const heroImages = useMemo(() => displayImages.slice(0, 12), [displayImages]);
  const showcaseImage =
    displayImages.find((image) => image.key === featuredKey) || heroImages[0];
  const promptHelperProps = {
    selections: promptHelperSelections,
    onSelectionChange: handlePromptSelectionChange,
    onCharacterChange: handleCharacterSelection,
    onGenerate: handlePromptHelperGenerate,
    isLoading: isPromptHelperLoading,
    status: promptHelperStatus,
    hasSelection: hasPromptHelperSelection,
    promptBackgrounds,
    promptCharacters,
    promptPoses,
    promptArchetypes,
    promptTraits,
    promptFaceDetails,
    promptEyeDetails,
    promptHairDetails,
    promptExpressions,
    promptOutfits,
    promptPalettes,
    promptStyles,
  };

  const closeModal = () => setActiveModal("");

  const handleSelectImageForVideo = async (image) => {
    if (!image?.key) return;
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    setError("");
    setVideoSelectStatus("loading");
    try {
      const data = await selectGeneratedImage(resolvedApiBaseUrl, image.key);
      if (data?.videoReadyKey) {
        setSelectedImageKey(data.videoReadyKey);
      }
      if (image?.url) {
        setSelectedImageUrl(image.url);
      }
      setVideoSelectStatus("success");
    } catch (err) {
      setError(err?.message || "Image selection failed.");
      setVideoSelectStatus("error");
    }
  };

  const openVideoModalForImage = async (image) => {
    await handleSelectImageForVideo(image);
    setActiveModal("video");
  };

  const handleDeleteImage = async (image) => {
    if (!image?.key || !resolvedApiBaseUrl) return;
    try {
      await deleteImage(resolvedApiBaseUrl, image.key);
      setImages((prev) => prev.filter((item) => item.key !== image.key));
      if (featuredKey === image.key) {
        setFeaturedKey("");
      }
    } catch (err) {
      setError(err?.message || "Failed to delete image.");
    }
  };

  return (
    <section className="whisk-page">
      <header className="whisk-hero-block">
        <p className="whisk-eyebrow">Whisk Studio</p>
        <h1 className="whisk-title-main">Turn images into motion studies</h1>
        <p className="whisk-subtitle-main">
          A gallery-first workspace inspired by creative image tools. Load your
          S3 library instantly and start exploring.
        </p>
        <div className="whisk-status-row">
          <span className="whisk-pill">
            {resolvedApiBaseUrl
              ? status === "loading"
                ? "Loading library..."
                : "Library connected"
              : "Set API URL in config.json or .env"}
          </span>
          {error && <span className="whisk-error">{error}</span>}
        </div>
      </header>

      <div className="whisk-gallery">
        <div className="whisk-wall">
          {heroImages.length > 0 ? (
            heroImages.map((image, index) => (
              <div
                key={image.key || `${image.url}-${index}`}
                role="button"
                tabIndex={0}
                className={`whisk-tile ${index === 0 ? "is-feature" : ""}`}
                onClick={() => setFeaturedKey(image.key)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setFeaturedKey(image.key);
                  }
                }}
              >
                <img src={image.url} alt={image.key || "Generated image"} />
                <div className="whisk-tile-overlay" />
                <span className="whisk-tile-meta">
                  {image.key?.split("/").pop() || "frame"}
                </span>
                <span className="whisk-tile-actions">
                  <button
                    type="button"
                    className="whisk-icon-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openVideoModalForImage(image);
                    }}
                    aria-label="Generate video from image"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M5 4h10a2 2 0 0 1 2 2v2l4-2v12l-4-2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {image.url && (
                    <a
                      className="whisk-icon-button"
                      href={image.url}
                      download
                      onClick={(event) => event.stopPropagation()}
                      aria-label="Download image"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M12 3v11m0 0l4-4m-4 4l-4-4M4 17v3h16v-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </a>
                  )}
                  <button
                    type="button"
                    className="whisk-icon-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteImage(image);
                    }}
                    aria-label="Delete image"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M4 7h16M9 7V5h6v2m-7 0l1 12h8l1-12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </span>
              </div>
            ))
          ) : (
            <div className="whisk-empty">
              {status === "loading"
                ? "Loading images from S3..."
                : "No images found yet. Generate or upload to populate the wall."}
            </div>
          )}
          <button
            type="button"
            className="whisk-tile whisk-tile-cta"
            onClick={() => setActiveModal("image")}
          >
            <div className="whisk-tile-plus">+</div>
            <span className="whisk-tile-cta-text">Create an image</span>
          </button>
        </div>

        <div className="whisk-side">
          <div className="whisk-spotlight">
            <div className="whisk-spotlight-card">
              <p className="whisk-eyebrow">Spotlight</p>
              {showcaseImage ? (
                <>
                  <img
                    src={showcaseImage.url}
                    alt={showcaseImage.key || "Spotlight"}
                  />
                <div className="whisk-spotlight-meta">
                  <span className="whisk-pill">Featured</span>
                  <span className="whisk-meta-text">
                    {showcaseImage.key || "untitled"}
                  </span>
                  <button
                    type="button"
                    className="whisk-icon-button"
                    onClick={() => openVideoModalForImage(showcaseImage)}
                    aria-label="Generate video from featured image"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M5 4h10a2 2 0 0 1 2 2v2l4-2v12l-4-2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {showcaseImage.url && (
                    <a
                      className="whisk-icon-button"
                      href={showcaseImage.url}
                        download
                        aria-label="Download featured image"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M12 3v11m0 0l4-4m-4 4l-4-4M4 17v3h16v-3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </a>
                    )}
                    <button
                      type="button"
                      className="whisk-icon-button"
                      onClick={() => handleDeleteImage(showcaseImage)}
                      aria-label="Delete featured image"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M4 7h16M9 7V5h6v2m-7 0l1 12h8l1-12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </>
              ) : (
                <div className="whisk-empty">
                  Your spotlight will appear here once images are available.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {displayImages.length > 0 && (
        <div className="whisk-carousel">
          <div className="whisk-carousel-track">
            {displayImages.map((image) => (
              <button
                key={image.key}
                type="button"
                className="whisk-carousel-card"
                onClick={() => setFeaturedKey(image.key)}
              >
                <img src={image.url} alt={image.key || "Carousel image"} />
                <span className="whisk-carousel-meta">
                  {image.key?.split("/").pop() || "frame"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="whisk-panel whisk-error-panel">
          {error}
        </div>
      )}

      {activeModal && (
        <div className="whisk-modal-backdrop" onClick={closeModal}>
          <div
            className="whisk-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="whisk-modal-header">
              <div>
                <p className="whisk-label">
                  {activeModal === "image" ? "Studio" : "Motion"}
                </p>
                <h2 className="whisk-heading">
                  {activeModal === "image"
                    ? "Create an image"
                    : "Generate the video"}
                </h2>
              </div>
              <button
                type="button"
                className="whisk-modal-close"
                onClick={closeModal}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="whisk-modal-body">
              {activeModal === "image" ? (
                <>
                  <ImageSourceSelector
                    options={imageSourceOptions}
                    value={imageSource}
                    onChange={setImageSource}
                  />
                  {imageSource !== "upload" ? (
                    <ImageGenerationPanel
                      imageModel={imageModel}
                      imageModelOptions={imageModelOptions}
                      onSelectModel={setImageModel}
                      imageGenerationName={imageGenerationName}
                      onImageNameChange={setImageGenerationName}
                      promptHelperProps={promptHelperProps}
                      imagePrompt={imagePrompt}
                      onImagePromptChange={setImagePrompt}
                      imageNegativePrompt={imageNegativePrompt}
                      onImageNegativePromptChange={setImageNegativePrompt}
                      imageSize={imageSize}
                      imageSizeOptions={imageSizeOptions}
                      onImageSizeChange={setImageSize}
                      imageScheduler={imageScheduler}
                      imageSchedulerOptions={imageSchedulerOptions}
                      onImageSchedulerChange={setImageScheduler}
                      imageNumImages={imageNumImages}
                      onImageNumImagesChange={setImageNumImages}
                      onGenerateImage={handleGenerateImage}
                      isGeneratingImage={isGeneratingImage}
                      imageGenerationNotice={imageGenerationNotice}
                      generatedImages={generatedImages}
                      selectedGeneratedKey={selectedGeneratedKey}
                      selectingImageKey={selectingImageKey}
                      isSelectingImage={isSelectingImage}
                      onSelectGeneratedImage={handleSelectGeneratedImage}
                    />
                  ) : (
                    <ImageUploadPanel
                      imageName={imageName}
                      onImageNameChange={setImageName}
                      selectedFile={selectedFile}
                      previewUrl={previewUrl}
                      onFileChange={handleFileChange}
                      onUpload={handleUpload}
                      uploadKey={uploadKey}
                      isUploading={isUploading}
                    />
                  )}
                </>
              ) : (
                <>
                  {selectedImageUrl && (
                    <div className="whisk-selected-preview">
                      <img
                        src={selectedImageUrl}
                        alt="Selected for video"
                      />
                      <div>
                        <p className="whisk-label">Selected image</p>
                        <p className="whisk-meta-text">
                          {selectedImageKey || "Preparing video-ready key"}
                        </p>
                        {videoSelectStatus === "loading" && (
                          <p className="whisk-selecting">Preparing video-ready...</p>
                        )}
                        {videoSelectStatus === "error" && (
                          <p className="whisk-selecting whisk-selecting--error">
                            Failed to prepare video-ready key.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  <VideoGenerationPanel
                    videoProvider={videoProvider}
                    videoProviderOptions={videoProviderOptions}
                    onSelectVideoProvider={setVideoProvider}
                    videoModel={videoModel}
                    videoModelOptions={videoModelOptions}
                    onSelectVideoModel={setVideoModel}
                    imageListStatus="success"
                    onRefreshImages={() => {}}
                    availableImages={displayImages}
                    selectedImageKey={selectedImageKey}
                    onSelectImage={handleSelectImageForVideo}
                    onDeleteImage={handleDeleteImage}
                    hideImageSelector
                    prompt={prompt}
                    onPromptChange={setPrompt}
                    isReplicateAudioOption={isReplicateAudioOption}
                    videoGenerateAudio={videoGenerateAudio}
                    onToggleAudio={setVideoGenerateAudio}
                    onGenerateVideo={handleGenerate}
                    isVideoInProgress={isVideoInProgress}
                    isGenerating={isGenerating}
                    generationResponse={generationResponse}
                    availableVideos={[]}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default Whisk;
