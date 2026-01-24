import React, { useEffect, useMemo, useState } from "react";

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
  const [generatedImages, setGeneratedImages] = useState([]);
  const [imageGenerationStatus, setImageGenerationStatus] = useState("idle");
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [prompt, setPrompt] = useState("A cinematic push-in on the scene.");
  const [imageName, setImageName] = useState("");
  const [uploadKey, setUploadKey] = useState("");
  const [selectedImageKey, setSelectedImageKey] = useState("");
  const [availableImages, setAvailableImages] = useState([]);
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [generationStatus, setGenerationStatus] = useState("idle");
  const [error, setError] = useState("");
  const [generationResponse, setGenerationResponse] = useState(null);
  const [invocationArn, setInvocationArn] = useState("");
  const [outputPrefix, setOutputPrefix] = useState("");
  const [jobStatus, setJobStatus] = useState("");
  const [availableVideos, setAvailableVideos] = useState([]);

  const resolvedApiBaseUrl =
    apiBaseUrl || process.env.REACT_APP_API_URL || "";

  const isUploading = uploadStatus === "uploading";
  const isGenerating = generationStatus === "loading";
  const isVideoInProgress = isGenerating || jobStatus === "InProgress";
  const isGeneratingImage = imageGenerationStatus === "loading";

  useEffect(() => {
    if (!resolvedApiBaseUrl) return;
    fetch(`${resolvedApiBaseUrl}/`)
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch((err) => console.error(err));
  }, [resolvedApiBaseUrl]);

  const refreshImageList = async () => {
    if (!resolvedApiBaseUrl) return;
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
    } catch (err) {
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

  useEffect(() => {
    refreshImageList();
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
    if (imageSource === "bedrock") {
      return [{ value: "1024x1024", label: "1024x1024 (Square)" }];
    }
    return [{ value: "1024x1024", label: "1024x1024 (Square)" }];
  }, [imageSource, imageModel]);

  useEffect(() => {
    const allowedValues = imageSizeOptions.map((option) => option.value);
    if (!allowedValues.includes(imageSize)) {
      setImageSize(imageSizeOptions[0]?.value || "1024x1024");
    }
  }, [imageModel, imageSizeOptions, imageSize]);

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
    await refreshImageList();
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

    try {
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
    if (!imagePrompt.trim()) {
      setError("Prompt is required.");
      return;
    }
    setError("");
    setImageGenerationStatus("loading");
    setGeneratedImages([]);

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
            imageName: imageGenerationName.trim() || undefined,
            prompt: imagePrompt.trim(),
            negativePrompt: imageNegativePrompt.trim() || undefined,
            width,
            height,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to generate image.");
      }
      const images = data?.images || [];
      setGeneratedImages(images);
      if (images[0]?.key) {
        setSelectedImageKey(images[0]?.videoReadyKey || images[0].key);
      }
      setImageGenerationStatus("success");
      await refreshImageList();
    } catch (err) {
      setImageGenerationStatus("error");
      setError(err?.message || "Image generation failed.");
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

                <div>
                  <label className="text-sm font-medium text-slate-600">
                    Prompt
                  </label>
                    <textarea
                      className="mt-2 min-h-[96px] w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      value={imagePrompt}
                      onChange={(event) => setImagePrompt(event.target.value)}
                      maxLength={512}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-600">
                      Negative prompt
                    </label>
                    <textarea
                      className="mt-2 min-h-[72px] w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      value={imageNegativePrompt}
                      onChange={(event) =>
                        setImageNegativePrompt(event.target.value)
                      }
                      maxLength={512}
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

                  <button
                    className="w-full rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-black/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage || !imagePrompt.trim()}
                  >
                    Generate image
                  </button>

                  {generatedImages.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Latest generations
                      </p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {generatedImages.map((image) => {
                          const isSelected = selectedImageKey === image.key;
                          return (
                            <button
                              key={image.key}
                              type="button"
                              onClick={() =>
                                setSelectedImageKey(
                                  image.videoReadyKey || image.key
                                )
                              }
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
                      Rendering and uploading to S3...
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
            <div>
              <p className="text-sm font-medium text-slate-600">
                Select an image
              </p>
              {availableImages.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  No images found in S3 yet.
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
