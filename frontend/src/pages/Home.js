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
    fetch(`${resolvedApiBaseUrl}/`)
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch((err) => console.error(err));
  }, [resolvedApiBaseUrl]);

  const refreshImageList = async () => {
    if (!resolvedApiBaseUrl) return;
    setImageListStatus("loading");
    try {
      const response = await fetch(`${resolvedApiBaseUrl}/s3/images`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to load images.");
      }
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
      const response = await fetch(
        `${resolvedApiBaseUrl}/s3/videos?includeUrls=true`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to load videos.");
      }
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
      const response = await fetch(
        `${resolvedApiBaseUrl}/s3/images/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: image.key }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to delete image.");
      }
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

  const uploadStatusLabel = useMemo(() => {
    if (uploadStatus === "uploaded") return "Uploaded";
    if (uploadStatus === "uploading") return "Uploading";
    if (uploadStatus === "error") return "Upload failed";
    return "Idle";
  }, [uploadStatus]);

  const generationStatusLabel = useMemo(() => {
    if (generationStatus === "success") return "Started";
    if (generationStatus === "loading") return "Submitting";
    if (generationStatus === "error") return "Submission failed";
    return "Idle";
  }, [generationStatus]);

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
    (videoModel === "veo-3.1-fast" || videoModel === "kling-v2.6");

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
      const presignResponse = await fetch(
        `${resolvedApiBaseUrl}/s3/image-upload-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, contentType }),
        }
      );
      const presignData = await presignResponse.json();
      if (!presignResponse.ok) {
        throw new Error(presignData?.message || "Failed to request upload URL.");
      }

      const putResponse = await fetch(presignData.url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: selectedFile,
      });

      if (!putResponse.ok) {
        throw new Error("S3 upload failed. Please retry.");
      }

      setUploadKey(presignData.key);
      setSelectedImageKey("");
      setUploadStatus("uploaded");
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
        if (videoModel === "veo-3.1-fast" || videoModel === "kling-v2.6") {
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
        const response = await fetch(
          `${resolvedApiBaseUrl}/replicate/video/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: videoModel,
              prompt: prompt?.trim() || undefined,
              inputKey: selectedImageKey,
              imageUrl: selectedImage.url,
              ...(isReplicateAudioOption
                ? { generateAudio: videoGenerateAudio }
                : {}),
            }),
          }
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.message || "Failed to start video generation.");
        }
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
        const response = await fetch(
          `${resolvedApiBaseUrl}/bedrock/nova-reel/image-to-video-s3`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: prompt?.trim() || undefined,
              inputKey: selectedImageKey,
              outputPrefix: newOutputPrefix,
              model: videoModel,
            }),
          }
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.message || "Failed to start video generation.");
        }
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
      const endpoint =
        imageSource === "bedrock"
          ? "/bedrock/image/generate"
          : "/replicate/image/generate";
      const response = await fetch(
        `${resolvedApiBaseUrl}${endpoint}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to generate image.");
      }
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
      const response = await fetch(`${resolvedApiBaseUrl}/images/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: image.key }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Image selection failed.");
      }
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
      const response = await fetch(
        `${resolvedApiBaseUrl}/bedrock/prompt-helper`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
            colorPalette:
              promptHelperSelections.colorPalette.trim() || undefined,
            styleReference:
              promptHelperSelections.styleReference.trim() || undefined,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Prompt helper failed.");
      }
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

  const handleSelectForVideo = (image) => {
    setSelectedImageKey(image.key);
  };

  useEffect(() => {
    if (!invocationArn || !resolvedApiBaseUrl) return undefined;
    let timeoutId;
    let isCancelled = false;

    const pollStatus = async () => {
      if (isCancelled) return;
      try {
        const response = await fetch(
          `${resolvedApiBaseUrl}/bedrock/nova-reel/job-status?invocationArn=${encodeURIComponent(
            invocationArn
          )}&inputKey=${encodeURIComponent(
            selectedImageKey
          )}&outputPrefix=${encodeURIComponent(outputPrefix)}`
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.message || "Failed to fetch job status.");
        }
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
  }, [invocationArn, outputPrefix, resolvedApiBaseUrl]);

  useEffect(() => {
    if (!replicatePredictionId || !resolvedApiBaseUrl) return undefined;
    let timeoutId;
    let isCancelled = false;

    const pollReplicateStatus = async () => {
      if (isCancelled) return;
      try {
        const response = await fetch(
          `${resolvedApiBaseUrl}/replicate/video/status?predictionId=${encodeURIComponent(
            replicatePredictionId
          )}&inputKey=${encodeURIComponent(selectedImageKey)}`
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            data?.message || "Failed to fetch prediction status."
          );
        }
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

  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-4 md:px-10">
      <div className="animate-fade-up glass-panel relative overflow-hidden rounded-[32px] p-8 shadow-soft md:p-12">
        <div className="absolute -right-16 top-6 h-40 w-40 animate-glow-pulse rounded-full bg-glow blur-2xl" />
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
          API Status
        </p>
        <p className="mt-4 max-w-2xl text-base text-slate-600 md:text-lg">
          {resolvedApiBaseUrl
            ? message || "Connecting to the API..."
            : "Set API URL in config.json or .env"}
        </p>
      </div>

      <div className="mt-10">
        <div className="glass-panel animate-fade-up rounded-[28px] p-7 shadow-card md:p-9">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Step 00
              </p>
              <h2 className="mt-3 text-xl font-semibold text-ink">
                Create an image
              </h2>
            </div>
            {(isGeneratingImage || isUploading) && (
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                {isUploading ? "Uploading…" : "Rendering…"}
              </div>
            )}
          </div>

          <div className="mt-6 space-y-6">
            <div>
              <p className="text-sm font-medium text-slate-600">
                Choose a source
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {imageSourceOptions.map((option) => {
                  const isSelected = imageSource === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setImageSource(option.key)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        isSelected
                          ? "border-accent bg-glow shadow-soft"
                          : "border-slate-200 bg-white/70 hover:border-slate-300"
                      }`}
                    >
                      <p className="text-sm font-semibold text-ink">
                        {option.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {imageSource !== "upload" ? (
              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-slate-600">
                      Choose a model
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {imageModelOptions.map((option) => {
                        const isSelected = imageModel === option.key;
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => setImageModel(option.key)}
                            className={`rounded-2xl border p-4 text-left transition ${
                              isSelected
                                ? "border-accent bg-glow shadow-soft"
                                : "border-slate-200 bg-white/70 hover:border-slate-300"
                            }`}
                          >
                            <p className="text-sm font-semibold text-ink">
                              {option.name}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {option.description}
                            </p>
                          </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-600">
                    Image name
                  </label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                    value={imageGenerationName}
                    onChange={(event) => setImageGenerationName(event.target.value)}
                    placeholder="frieren"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Used for generated image and video filenames.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                        AI prompt helper
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Pick a scenario and spark a prompt draft.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handlePromptHelperGenerate}
                      disabled={isPromptHelperLoading || !hasPromptHelperSelection}
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-soft transition hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:bg-slate-100"
                      aria-label="Generate prompt with AI"
                      title="Generate prompt with AI"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 3v4" />
                        <path d="M12 17v4" />
                        <path d="M4.93 4.93l2.83 2.83" />
                        <path d="M16.24 16.24l2.83 2.83" />
                        <path d="M3 12h4" />
                        <path d="M17 12h4" />
                        <path d="M4.93 19.07l2.83-2.83" />
                        <path d="M16.24 7.76l2.83-2.83" />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Background
                      </label>
                      <input
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        list="prompt-helper-backgrounds"
                        value={promptHelperSelections.background}
                        onChange={(event) => {
                          setPromptHelperSelections((prev) => ({
                            ...prev,
                            background: event.target.value,
                          }));
                          setPromptHelperStatus("idle");
                        }}
                        placeholder="neon-lit city alley"
                      />
                      <datalist id="prompt-helper-backgrounds">
                        {promptBackgrounds.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Character
                      </label>
                      <input
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        list="prompt-helper-characters"
                        value={promptHelperSelections.character}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          const preset = characterPresetMap.get(
                            nextValue.trim().toLowerCase()
                          );
                          if (preset) {
                            setPromptHelperSelections((prev) => ({
                              ...prev,
                              character: preset.name || nextValue,
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
                              character: nextValue,
                          }));
                          }
                          setPromptHelperStatus("idle");
                        }}
                        placeholder="mysterious swordswoman"
                      />
                      <datalist id="prompt-helper-characters">
                        {promptCharacters.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Pose
                      </label>
                      <input
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        list="prompt-helper-poses"
                        value={promptHelperSelections.pose}
                        onChange={(event) => {
                          setPromptHelperSelections((prev) => ({
                            ...prev,
                            pose: event.target.value,
                          }));
                          setPromptHelperStatus("idle");
                        }}
                        placeholder="looking over shoulder"
                      />
                      <datalist id="prompt-helper-poses">
                        {promptPoses.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div className="mt-5 border-t border-slate-200/70 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                      Character aesthetics
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Face, styling, and gacha-style cues.
                    </p>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Archetype
                      </label>
                      <input
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        list="prompt-helper-archetypes"
                        value={promptHelperSelections.archetype}
                        onChange={(event) => {
                          setPromptHelperSelections((prev) => ({
                            ...prev,
                            archetype: event.target.value,
                          }));
                          setPromptHelperStatus("idle");
                        }}
                        placeholder="stoic elf mage"
                      />
                      <datalist id="prompt-helper-archetypes">
                        {promptArchetypes.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Signature traits
                      </label>
                      <input
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        list="prompt-helper-traits"
                        value={promptHelperSelections.signatureTraits}
                        onChange={(event) => {
                          setPromptHelperSelections((prev) => ({
                            ...prev,
                            signatureTraits: event.target.value,
                          }));
                          setPromptHelperStatus("idle");
                        }}
                        placeholder="silver hair, emerald eyes"
                      />
                      <datalist id="prompt-helper-traits">
                        {promptTraits.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Face details
                      </label>
                      <input
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        list="prompt-helper-face-details"
                        value={promptHelperSelections.faceDetails}
                        onChange={(event) => {
                          setPromptHelperSelections((prev) => ({
                            ...prev,
                            faceDetails: event.target.value,
                          }));
                          setPromptHelperStatus("idle");
                        }}
                        placeholder="soft youthful face"
                      />
                      <datalist id="prompt-helper-face-details">
                        {promptFaceDetails.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Eye details
                      </label>
                      <input
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        list="prompt-helper-eye-details"
                        value={promptHelperSelections.eyeDetails}
                        onChange={(event) => {
                          setPromptHelperSelections((prev) => ({
                            ...prev,
                            eyeDetails: event.target.value,
                          }));
                          setPromptHelperStatus("idle");
                        }}
                        placeholder="almond-shaped eyes with soft highlights"
                      />
                      <datalist id="prompt-helper-eye-details">
                        {promptEyeDetails.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Hair details
                      </label>
                      <input
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        list="prompt-helper-hair-details"
                        value={promptHelperSelections.hairDetails}
                        onChange={(event) => {
                          setPromptHelperSelections((prev) => ({
                            ...prev,
                            hairDetails: event.target.value,
                          }));
                          setPromptHelperStatus("idle");
                        }}
                        placeholder="long flowing hair"
                      />
                      <datalist id="prompt-helper-hair-details">
                        {promptHairDetails.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Expression
                      </label>
                      <input
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        list="prompt-helper-expressions"
                        value={promptHelperSelections.expression}
                        onChange={(event) => {
                          setPromptHelperSelections((prev) => ({
                            ...prev,
                            expression: event.target.value,
                          }));
                          setPromptHelperStatus("idle");
                        }}
                        placeholder="quiet, thoughtful expression"
                      />
                      <datalist id="prompt-helper-expressions">
                        {promptExpressions.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </div>

                  
                  </div>

                  <div className="mt-5 border-t border-slate-200/70 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                      Styling & palette
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Keep these independent of character presets.
                    </p>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Outfit/materials
                      </label>
                      <input
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        list="prompt-helper-outfits"
                        value={promptHelperSelections.outfitMaterials}
                        onChange={(event) => {
                          setPromptHelperSelections((prev) => ({
                            ...prev,
                            outfitMaterials: event.target.value,
                          }));
                          setPromptHelperStatus("idle");
                        }}
                        placeholder="ornate mage cloak with layered fabric"
                      />
                      <datalist id="prompt-helper-outfits">
                        {promptOutfits.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Color palette
                      </label>
                      <input
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        list="prompt-helper-palettes"
                        value={promptHelperSelections.colorPalette}
                        onChange={(event) => {
                          setPromptHelperSelections((prev) => ({
                            ...prev,
                            colorPalette: event.target.value,
                          }));
                          setPromptHelperStatus("idle");
                        }}
                        placeholder="muted teal and warm gold"
                      />
                      <datalist id="prompt-helper-palettes">
                        {promptPalettes.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Style reference
                      </label>
                      <input
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        list="prompt-helper-styles"
                        value={promptHelperSelections.styleReference}
                        onChange={(event) => {
                          setPromptHelperSelections((prev) => ({
                            ...prev,
                            styleReference: event.target.value,
                          }));
                          setPromptHelperStatus("idle");
                        }}
                        placeholder="anime key visual, clean line art"
                      />
                      <datalist id="prompt-helper-styles">
                        {promptStyles.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  {isPromptHelperLoading && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                      <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                      Drafting a prompt with Haiku...
                    </div>
                  )}
                  {promptHelperStatus === "success" && (
                    <p className="mt-3 text-xs text-slate-500">
                      Prompt applied to positive and negative fields.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handlePromptHelperGenerate}
                    disabled={isPromptHelperLoading || !hasPromptHelperSelection}
                    className="mt-4 w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-soft transition hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    Generate prompt with AI
                  </button>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-600">
                    Prompt
                  </label>
                  <textarea
                    className="mt-2 min-h-[96px] w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                    value={imagePrompt}
                    onChange={(event) => setImagePrompt(event.target.value)}
                    maxLength={900}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-600">
                    Negative prompt
                  </label>
                  <textarea
                    className="mt-2 min-h-[72px] w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                    value={imageNegativePrompt}
                    onChange={(event) => setImageNegativePrompt(event.target.value)}
                    maxLength={900}
                  />
                </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-600">
                      Size preset
                    </label>
                    <select
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      value={imageSize}
                      onChange={(event) => setImageSize(event.target.value)}
                    >
                      {imageSizeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {imageSchedulerOptions.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-slate-600">
                        Scheduler
                      </label>
                      <select
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        value={imageScheduler}
                        onChange={(event) => setImageScheduler(event.target.value)}
                      >
                        {imageSchedulerOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex flex-wrap items-end gap-3">
                    <button
                      className="flex-1 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-black/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                      onClick={handleGenerateImage}
                      disabled={
                        isGeneratingImage ||
                        !imagePrompt.trim() ||
                        !imageGenerationName.trim()
                      }
                    >
                      Generate image
                    </button>

                    <div className="min-w-[140px]">
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Images
                      </label>
                      <select
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        value={imageNumImages}
                        onChange={(event) =>
                          setImageNumImages(Number(event.target.value))
                        }
                        disabled={isGeneratingImage || imageScheduler === "diff"}
                      >
                        {[1, 2, 3].map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {generatedImages.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Latest generations
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        Click one to keep it. The other image will be discarded.
                      </p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {generatedImages.map((image) => {
                          const isSelected = selectedGeneratedKey === image.key;
                          const isSelecting = selectingImageKey === image.key;
                          return (
                            <button
                              key={image.key}
                              type="button"
                              onClick={() => handleSelectGeneratedImage(image)}
                              disabled={isSelectingImage}
                              className={`overflow-hidden rounded-2xl border p-2 text-left transition ${
                                isSelected
                                  ? "border-accent bg-glow shadow-soft"
                                  : "border-slate-200 bg-white/70 hover:border-slate-300"
                              }`}
                            >
                              <img
                                src={image.url}
                                alt={image.key}
                                className="h-32 w-full rounded-xl object-cover"
                              />
                              <p className="mt-2 text-[11px] font-medium text-slate-600">
                                {image.key}
                              </p>
                              {isSelecting && (
                                <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                                  <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                                  Preparing video-ready...
                                </div>
                              )}
                              {image.url && (
                                <a
                                  className="mt-2 inline-flex rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-accent hover:text-ink"
                                  href={image.url}
                                  download
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  Download
                                </a>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {isGeneratingImage && (
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                      {imageGenerationNotice ||
                        "Rendering two images sequentially. This can take a bit..."}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-600">
                      Image name
                    </label>
                    <input
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      value={imageName}
                      onChange={(event) => setImageName(event.target.value)}
                      placeholder="frieren"
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Stored as <span className="font-mono">images/NAME.jpg</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-accent hover:text-ink">
                      Choose image
                      <input
                        hidden
                        type="file"
                        accept="image/jpeg"
                        onChange={handleFileChange}
                      />
                    </label>
                    <button
                      className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                      onClick={handleUpload}
                      disabled={!selectedFile || isUploading || !imageName.trim()}
                    >
                      Upload to S3
                    </button>
                  </div>

                  {isUploading && (
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                      Uploading image to S3...
                    </div>
                  )}

                  {uploadKey && (
                    <p className="text-sm text-slate-500">
                      Uploaded as{" "}
                      <span className="font-mono text-ink">{uploadKey}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-4">
                  {selectedFile && (
                    <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white/60 p-4 md:grid-cols-[1.2fr_1fr]">
                      <div>
                        <p className="text-xs uppercase tracking-[0.26em] text-slate-500">
                          Selected image
                        </p>
                        <p className="mt-2 text-base font-semibold text-ink">
                          {selectedFile.name}
                        </p>
                        <p className="text-sm text-slate-500">
                          {Math.round(selectedFile.size / 1024)} KB
                        </p>
                      </div>
                      {previewUrl && (
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="h-40 w-full rounded-2xl border border-slate-200 object-cover"
                        />
                      )}
                    </div>
                  )}
                  <p className="text-xs text-slate-500">
                    JPEG only, 1280x720 recommended.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="glass-panel animate-fade-up rounded-[28px] p-7 shadow-card md:p-9">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Step 01
              </p>
              <h2 className="mt-3 text-xl font-semibold text-ink">
                Generate the video
              </h2>
            </div>
            {isGenerating && (
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                Submitting…
              </div>
            )}
          </div>

          <div className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-slate-600">
                  Video provider
                </p>
                <div className="mt-3 grid gap-2">
                  {videoProviderOptions.map((option) => {
                    const isSelected = videoProvider === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setVideoProvider(option.key)}
                        className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                          isSelected
                            ? "border-accent bg-glow shadow-soft"
                            : "border-slate-200 bg-white/70 hover:border-slate-300"
                        }`}
                      >
                        <p className="font-semibold text-ink">{option.name}</p>
                        <p className="text-xs text-slate-500">
                          {option.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-600">Model</p>
                <div className="mt-3 grid gap-2">
                  {videoModelOptions.map((option) => {
                    const isSelected = videoModel === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setVideoModel(option.key)}
                        className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                          isSelected
                            ? "border-accent bg-glow shadow-soft"
                            : "border-slate-200 bg-white/70 hover:border-slate-300"
                        }`}
                      >
                        <p className="font-semibold text-ink">{option.name}</p>
                        <p className="text-xs text-slate-500">
                          {option.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-600">
                  Select an image
                </p>
                <button
                  type="button"
                  onClick={refreshImageList}
                  className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:bg-slate-100"
                  disabled={imageListStatus === "loading"}
                >
                  {imageListStatus === "loading"
                    ? "Loading..."
                    : "Load images"}
                </button>
              </div>
              {availableImages.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  {imageListStatus === "error"
                    ? "Failed to load images."
                    : "Click “Load images” to fetch from S3."}
                </p>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {availableImages.map((image) => {
                    const isSelected = selectedImageKey === image.key;
                    return (
                      <button
                        key={image.key}
                        type="button"
                        onClick={() => handleSelectForVideo(image)}
                        className={`overflow-hidden rounded-2xl border p-3 text-left transition ${
                          isSelected
                            ? "border-accent bg-glow shadow-soft"
                            : "border-slate-200 bg-white/70 hover:border-slate-300"
                        }`}
                      >
                        <img
                          src={image.url}
                          alt={image.key}
                          className="h-32 w-full rounded-xl object-cover"
                        />
                        <p className="mt-2 text-xs font-medium text-slate-600">
                          {image.key}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {image.url && (
                            <a
                              className="inline-flex rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-accent hover:text-ink"
                              href={image.url}
                              download
                              onClick={(event) => event.stopPropagation()}
                            >
                              Download
                            </a>
                          )}
                          <button
                            type="button"
                            className="inline-flex rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-red-400 hover:text-red-600"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteImage(image);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-3 text-xs text-slate-500">
                Showing video-ready images only.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600">
                Prompt
              </label>
              <textarea
                className="mt-2 min-h-[96px] w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </div>

            {isReplicateAudioOption && (
              <label className="flex items-center gap-3 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                  checked={videoGenerateAudio}
                  onChange={(event) => setVideoGenerateAudio(event.target.checked)}
                />
                Generate audio
              </label>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-full bg-accent px-6 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                onClick={handleGenerate}
                disabled={!selectedImageKey || isVideoInProgress}
              >
                {isVideoInProgress ? "Generating…" : "Start video job"}
              </button>
            </div>

            {isVideoInProgress && (
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                {isGenerating
                  ? "Submitting video job..."
                  : "Rendering video in Bedrock..."}
              </div>
            )}

            {generationResponse && (
              <div className="rounded-2xl border border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
                <p className="font-semibold text-ink">Job submitted</p>
                <p className="mt-2">
                  Output:{" "}
                  <span className="font-mono">
                    {generationResponse.outputS3Uri}
                  </span>
                </p>
                <p className="mt-1">Model: {generationResponse.modelId}</p>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white/60 p-4">
              <p className="text-sm font-semibold text-ink">
                Available videos in S3
              </p>
              {availableVideos.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  No videos found yet.
                </p>
              ) : (
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {availableVideos.map((video) => (
                    <div
                      key={video.key}
                      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs text-ink">
                          {video.fileName || video.key}
                        </span>
                        {video.url && (
                          <a
                            className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-accent hover:text-ink"
                            href={video.url}
                            download
                          >
                            Download
                          </a>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {video.lastModified
                          ? new Date(video.lastModified).toLocaleString()
                          : "Unknown time"}
                        {typeof video.size === "number"
                          ? ` · ${Math.round(video.size / 1024)} KB`
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </section>
  );
}

export default Home;
