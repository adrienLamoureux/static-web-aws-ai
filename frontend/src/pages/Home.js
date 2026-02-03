import React, { useEffect, useMemo, useState } from "react";
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
import ImageSourceSelector from "../components/home/ImageSourceSelector";
import ImageGenerationPanel from "../components/home/ImageGenerationPanel";
import ImageUploadPanel from "../components/home/ImageUploadPanel";
import VideoGenerationPanel from "../components/home/VideoGenerationPanel";
import {
  fetchApiStatus,
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
  deleteImage,
  listImages,
  listVideos,
  putFileToUrl,
  requestImageUploadUrl,
} from "../services/s3";
import {
  createVideoReadyImage,
  selectGeneratedImage,
} from "../services/images";

const buildSafeFileName = (name = "") =>
  name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");

function Home({ apiBaseUrl = "" }) {
  const [message, setMessage] = useState("");
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
  const [imageListStatus, setImageListStatus] = useState("idle");
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
  const [videoProvider, setVideoProvider] = useState("bedrock");
  const [videoModel, setVideoModel] = useState("nova-reel");
  const [videoGenerateAudio, setVideoGenerateAudio] = useState(true);
  const [availableImages, setAvailableImages] = useState([]);
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [generationStatus, setGenerationStatus] = useState("idle");
  const [error, setError] = useState("");
  const [generationResponse, setGenerationResponse] = useState(null);
  const [invocationArn, setInvocationArn] = useState("");
  const [outputPrefix, setOutputPrefix] = useState("");
  const [jobStatus, setJobStatus] = useState("");
  const [availableVideos, setAvailableVideos] = useState([]);
  const [replicatePredictionId, setReplicatePredictionId] = useState("");
  const [replicateJobStatus, setReplicateJobStatus] = useState("");
  const [featuredKey, setFeaturedKey] = useState("");

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
    fetchApiStatus(resolvedApiBaseUrl)
      .then((data) => setMessage(data?.message || ""))
      .catch((err) => console.error(err));
  }, [resolvedApiBaseUrl]);

  const refreshImageList = async () => {
    if (!resolvedApiBaseUrl) return;
    setImageListStatus("loading");
    try {
      const data = await listImages(resolvedApiBaseUrl);
      const filteredImages = (data.images || []).filter((image) =>
        image.key?.startsWith("images/video-ready/")
      );
      setAvailableImages(filteredImages);
      setImageListStatus("success");
    } catch (err) {
      setImageListStatus("error");
      console.error(err);
    }
  };

  const refreshVideoList = async () => {
    if (!resolvedApiBaseUrl) return;
    try {
      const data = await listVideos(resolvedApiBaseUrl);
      setAvailableVideos(data.videos || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteImage = async (image) => {
    if (!image?.key) return;
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    setError("");
    try {
      await deleteImage(resolvedApiBaseUrl, image.key);
      setAvailableImages((prev) =>
        prev.filter((item) => item.key !== image.key)
      );
      if (selectedImageKey === image.key) {
        setSelectedImageKey("");
      }
    } catch (err) {
      setError(err?.message || "Failed to delete image.");
    }
  };

  useEffect(() => {
    refreshVideoList();
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
    setAvailableVideos([]);

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
      }
      if (videoReadyData?.videoReadyKey && videoReadyData?.url) {
        setAvailableImages((prev) => {
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
        const selectedImage = availableImages.find(
          (image) => image.key === selectedImageKey
        );
        if (!selectedImage?.url) {
          throw new Error("Selected image URL is missing.");
        }
        const data = await generateReplicateVideo(resolvedApiBaseUrl, {
          model: videoModel,
          prompt: prompt?.trim() || undefined,
          inputKey: selectedImageKey,
          imageUrl: selectedImage.url,
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
          await refreshVideoList();
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
      }
    } catch (err) {
      setGenerationStatus("error");
      setError(err?.message || "Video generation failed.");
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
      const images = data?.images || [];
      setGeneratedImages(images);
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
        const status = data?.status || "";
        setJobStatus(status);
        if (status === "Completed") {
          await refreshVideoList();
          return;
        }
        if (status === "Failed") {
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
        const status = data?.status || "";
        setReplicateJobStatus(status);
        if (status === "succeeded") {
          setGenerationStatus("success");
          await refreshVideoList();
          return;
        }
        if (status === "failed" || status === "canceled") {
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

  const galleryImages = useMemo(() => {
    const fromGenerated = (generatedImages || []).map((img) => ({
      key: img.key,
      url: img.url,
    }));
    const fromAvailable = (availableImages || []).map((img) => ({
      key: img.key,
      url: img.url,
    }));
    const fromPreview = previewUrl
      ? [{ key: "preview", url: previewUrl }]
      : [];
    const merged = [...fromGenerated, ...fromAvailable, ...fromPreview].filter(
      (item) => item.url
    );
    const seen = new Set();
    return merged.filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }, [availableImages, generatedImages, previewUrl]);

  const featuredImage =
    galleryImages.find((item) => item.key === featuredKey) ||
    galleryImages.find((item) => item.key === selectedGeneratedKey) ||
    galleryImages.find((item) => item.key === selectedImageKey) ||
    galleryImages[0];

  return (
    <section className="whisk-shell">
      <header className="whisk-hero animate-fade-up">
        <p className="gallery-kicker">Nova Reel Studio</p>
        <h1 className="whisk-title">Create a gallery of motion studies</h1>
        <p className="whisk-subtitle">
          Upload or generate a still, then build a collection of cinematic
          frames. The wall fills as you create.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span className="whisk-status">
            <span className="whisk-status-dot" />
            {resolvedApiBaseUrl
              ? message || "Connecting to the API..."
              : "Set API URL in config.json or .env"}
          </span>
          {(isGeneratingImage || isUploading) && (
            <span className="pill-tag">
              {isUploading ? "Uploading" : "Rendering"}
            </span>
          )}
        </div>
      </header>

      <div className="whisk-wall">
        {galleryImages.length > 0 ? (
          galleryImages.slice(0, 12).map((image, index) => (
            <button
              key={`${image.key}-${index}`}
              type="button"
              className={`whisk-wall-tile ${
                index === 0 ? "is-large" : ""
              }`}
              onClick={() => setFeaturedKey(image.key)}
            >
              <img src={image.url} alt={image.key || "Gallery image"} />
              <span className="whisk-wall-overlay" />
              <span className="whisk-wall-meta">
                {image.key ? image.key.slice(-12) : "frame"}
              </span>
            </button>
          ))
        ) : (
          <div className="whisk-panel text-center text-sm text-[#7a6a51]">
            Generate or upload an image to start the wall.
          </div>
        )}
      </div>

      <div className="whisk-controls">
        <div className="whisk-panel">
          <div className="whisk-panel-header">
            <div>
              <p className="whisk-label">Studio</p>
              <h2 className="whisk-heading">Create an image</h2>
            </div>
            {isGeneratingImage && (
              <div className="text-xs text-[#7a6a51]">
                Rendering in progress...
              </div>
            )}
          </div>
          <div className="mt-6 space-y-6">
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
          </div>
        </div>

        <div className="whisk-panel">
          <div className="whisk-panel-header">
            <div>
              <p className="whisk-label">Gallery</p>
              <h2 className="whisk-heading">Generate the video</h2>
            </div>
            {isGenerating && (
              <div className="text-xs text-[#7a6a51]">Submitting...</div>
            )}
          </div>
          <div className="mt-6">
            <VideoGenerationPanel
              videoProvider={videoProvider}
              videoProviderOptions={videoProviderOptions}
              onSelectVideoProvider={setVideoProvider}
              videoModel={videoModel}
              videoModelOptions={videoModelOptions}
              onSelectVideoModel={setVideoModel}
              imageListStatus={imageListStatus}
              onRefreshImages={refreshImageList}
              availableImages={availableImages}
              selectedImageKey={selectedImageKey}
              onSelectImage={(image) => setSelectedImageKey(image.key)}
              onDeleteImage={handleDeleteImage}
              prompt={prompt}
              onPromptChange={setPrompt}
              isReplicateAudioOption={isReplicateAudioOption}
              videoGenerateAudio={videoGenerateAudio}
              onToggleAudio={setVideoGenerateAudio}
              onGenerateVideo={handleGenerate}
              isVideoInProgress={isVideoInProgress}
              isGenerating={isGenerating}
              generationResponse={generationResponse}
              availableVideos={availableVideos}
            />
          </div>
        </div>

        {error && (
          <div className="whisk-panel border-[#e3c4b4] bg-[#f8ebe3] text-sm text-[#8c4b3a]">
            {error}
          </div>
        )}
      </div>
    </section>
  );
}

export default Home;
