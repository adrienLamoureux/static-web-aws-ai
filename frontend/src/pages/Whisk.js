import React, { useEffect, useMemo, useState } from "react";
import WhiskHero from "../components/whisk/WhiskHero";
import WhiskWall from "../components/whisk/WhiskWall";
import WhiskModal from "../components/whisk/WhiskModal";
import { deleteImage, deleteVideo, listImages, listVideos } from "../services/s3";
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
  const [videos, setVideos] = useState([]);
  const [videoUrls, setVideoUrls] = useState({});
  const [loadingVideoKey, setLoadingVideoKey] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [lightboxImage, setLightboxImage] = useState(null);
  const pageSize = 10;

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

  const refreshImages = async () => {
    if (!resolvedApiBaseUrl) return;
    setStatus("loading");
    setError("");
    try {
      const data = await listImages(resolvedApiBaseUrl);
      setImages(data.images || []);
      setStatus("success");
      setPageIndex(0);
    } catch (err) {
      setStatus("error");
      setError(err?.message || "Failed to load images.");
    }
  };

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
        setPageIndex(0);
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

  const refreshVideos = async () => {
    if (!resolvedApiBaseUrl) return;
    try {
      const data = await listVideos(resolvedApiBaseUrl, false);
      setVideos(data.videos || []);
    } catch (err) {
      setError(err?.message || "Failed to load videos.");
    }
  };

  useEffect(() => {
    if (!resolvedApiBaseUrl) return;
    let isMounted = true;
    const loadVideos = async () => {
      try {
        const data = await listVideos(resolvedApiBaseUrl, false);
        if (!isMounted) return;
        setVideos(data.videos || []);
      } catch (err) {
        if (!isMounted) return;
        setError(err?.message || "Failed to load videos.");
      }
    };
    loadVideos();
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
      if (activeModal === "image") {
        setActiveModal("");
      }
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
  useEffect(() => {
    setPageIndex(0);
  }, [displayImages.length]);
  const heroImages = useMemo(() => displayImages.slice(0, 12), [displayImages]);
  const pagedImages = useMemo(
    () => displayImages.slice(0, (pageIndex + 1) * pageSize),
    [displayImages, pageIndex]
  );
  const canLoadMore = displayImages.length > pagedImages.length;
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

  const closeModal = () => {
    setActiveModal("");
    refreshImages();
    refreshVideos();
  };

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
    } catch (err) {
      setError(err?.message || "Failed to delete image.");
    }
  };

  const handleDeleteVideo = async (video) => {
    if (!video?.key || !resolvedApiBaseUrl) return;
    try {
      await deleteVideo(resolvedApiBaseUrl, video.key);
      setVideos((prev) => prev.filter((item) => item.key !== video.key));
      setVideoUrls((prev) => {
        const next = { ...prev };
        delete next[video.key];
        return next;
      });
    } catch (err) {
      setError(err?.message || "Failed to delete video.");
    }
  };

  const handleLoadVideo = async (video) => {
    if (!video?.key || !resolvedApiBaseUrl) return;
    if (videoUrls[video.key]) {
      setVideoUrls((prev) => {
        const next = { ...prev };
        delete next[video.key];
        return next;
      });
      return;
    }
    setLoadingVideoKey(video.key);
    try {
      const data = await listVideos(resolvedApiBaseUrl, true);
      const matched = (data.videos || []).find((item) => item.key === video.key);
      if (matched?.url) {
        setVideoUrls((prev) => ({ ...prev, [video.key]: matched.url }));
      }
    } catch (err) {
      setError(err?.message || "Failed to load video.");
    } finally {
      setLoadingVideoKey("");
    }
  };

  return (
    <section className="whisk-page">
      <WhiskHero
        apiBaseUrl={resolvedApiBaseUrl}
        status={status}
        error={error}
        isGeneratingImage={isGeneratingImage}
        isUploading={isUploading}
      />

      <div className="whisk-gallery">
        <WhiskWall
          images={pagedImages}
          status={status}
          onOpenVideo={openVideoModalForImage}
          onDeleteImage={handleDeleteImage}
          onOpenImageModal={() => setActiveModal("image")}
          onOpenLightbox={setLightboxImage}
          canLoadMore={canLoadMore}
          onLoadMore={() => setPageIndex((prev) => prev + 1)}
          totalCount={displayImages.length}
        />
      </div>

      {error && (
        <div className="whisk-panel whisk-error-panel">
          {error}
        </div>
      )}

      <div className="whisk-panel whisk-videos">
        <div className="whisk-panel-header">
          <div>
            <p className="whisk-label">Videos</p>
            <h2 className="whisk-heading">Rendered outputs</h2>
            <p className="whisk-panel-copy">
              Click the play icon to load a preview when you need it.
            </p>
          </div>
        </div>
        {videos.length === 0 ? (
          <p className="whisk-panel-copy">No videos available yet.</p>
        ) : (
          <div className="whisk-video-list">
            {videos.map((video) => {
              const url = videoUrls[video.key];
              const isLoading = loadingVideoKey === video.key;
              return (
                <div key={video.key} className="whisk-video-item">
                  <div>
                    <p className="whisk-video-title">
                      {(video.fileName || video.key)?.slice(0, 50)}
                      {(video.fileName || video.key)?.length > 50 ? "…" : ""}
                    </p>
                    <p className="whisk-video-meta">
                      {video.lastModified
                        ? new Date(video.lastModified).toLocaleString()
                        : "Unknown time"}
                      {typeof video.size === "number"
                        ? ` · ${Math.round(video.size / 1024)} KB`
                        : ""}
                    </p>
                  </div>
                  <div className="whisk-video-actions">
                    <button
                      type="button"
                      className="whisk-video-button"
                      onClick={() => handleLoadVideo(video)}
                      disabled={isLoading}
                      aria-label={url ? "Hide video preview" : "Load video preview"}
                    >
                      {isLoading
                        ? "Loading..."
                        : url
                        ? "Hide preview"
                        : "Load preview"}
                    </button>
                    <button
                      type="button"
                      className="whisk-video-button whisk-video-button--danger"
                      onClick={() => handleDeleteVideo(video)}
                      aria-label="Delete video"
                    >
                      Delete
                    </button>
                  </div>
                  {url && (
                    <video className="whisk-video-player" controls src={url} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lightboxImage && (
        <div
          className="whisk-lightbox"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            className="whisk-lightbox-close"
            onClick={(event) => {
              event.stopPropagation();
              setLightboxImage(null);
            }}
            aria-label="Close full-size image"
          >
            ✕
          </button>
          <img
            src={lightboxImage.url}
            alt={lightboxImage.key || "Full size"}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}

      <WhiskModal
        activeModal={activeModal}
        onClose={closeModal}
        imageSource={imageSource}
        imageSourceOptions={imageSourceOptions}
        onChangeImageSource={setImageSource}
        imageGenerationProps={{
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
          imageNumImages,
          onImageNumImagesChange: setImageNumImages,
          onGenerateImage: handleGenerateImage,
          isGeneratingImage,
          imageGenerationNotice,
          generatedImages,
          selectedGeneratedKey,
          selectingImageKey,
          isSelectingImage,
          onSelectGeneratedImage: handleSelectGeneratedImage,
        }}
        imageUploadProps={{
          imageName,
          onImageNameChange: setImageName,
          selectedFile,
          previewUrl,
          onFileChange: handleFileChange,
          onUpload: handleUpload,
          uploadKey,
          isUploading,
        }}
        showVideoSelected
        selectedImageUrl={selectedImageUrl}
        selectedImageKey={selectedImageKey}
        videoSelectStatus={videoSelectStatus}
        videoPanelProps={{
          videoProvider,
          videoProviderOptions,
          onSelectVideoProvider: setVideoProvider,
          videoModel,
          videoModelOptions,
          onSelectVideoModel: setVideoModel,
          imageListStatus: "success",
          onRefreshImages: () => {},
          availableImages: displayImages,
          selectedImageKey,
          onSelectImage: handleSelectImageForVideo,
          onDeleteImage: handleDeleteImage,
          prompt,
          onPromptChange: setPrompt,
          isReplicateAudioOption,
          videoGenerateAudio,
          onToggleAudio: setVideoGenerateAudio,
          onGenerateVideo: handleGenerate,
          isVideoInProgress,
          isGenerating,
          generationResponse,
          availableVideos: [],
        }}
      />
    </section>
  );
}

export default Whisk;
