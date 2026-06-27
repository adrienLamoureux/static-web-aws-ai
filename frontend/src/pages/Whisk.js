import React, { useState, useCallback, useRef, useEffect } from "react";
import SolarisImageWall from "../components/shared/SolarisImageWall";
import { useWhiskImages } from "./whisk/hooks/useWhiskImages";
import { useImageStudio } from "./whisk/hooks/useImageStudio";
import { useVideoGeneration } from "./whisk/hooks/useVideoGeneration";
import { useWhiskInit } from "./whisk/useWhiskInit";
import { usePrefilledFromAgent } from "./whisk/hooks/usePrefilledFromAgent";
import SummonAgentButton from "../components/sakura/agent/SummonAgentButton";
import HiyoriSuggestButton from "../components/sakura/agent/HiyoriSuggestButton";
import { useConfig } from "../contexts/ConfigContext";
import { shareImage } from "../services/s3";
import { selectGeneratedImage } from "../services/images";
import { removeSessionCache } from "../utils/sessionCache";
import { useCompanion, CompanionActions } from "../lib/companion/CompanionContext";
import GeneratorSidebar from "./whisk/GeneratorSidebar";
import GenerationModal from "./whisk/GenerationModal";
import VideoGenerationModal from "./whisk/VideoGenerationModal";

const IMAGE_CACHE_KEY = "whisk_images_cache";
const VIDEO_CACHE_KEY = "whisk_videos_cache";
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

export default function Whisk(props) {
  const { apiBaseUrl } = useConfig();
  const { dispatch } = useCompanion();

  const [error, setError] = useState("");
  const [activeModal, setActiveModal] = useState("");
  const [lightboxImage, setLightboxImage] = useState(null);
  const [promptPreviewImage, setPromptPreviewImage] = useState(null);
  const [sharingImageKey, setSharingImageKey] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [selectedImageKey, setSelectedImageKey] = useState("");
  const [selectedSourceImageKey, setSelectedSourceImageKey] = useState("");
  const [selectedImageUrl, setSelectedImageUrl] = useState("");
  const [promptHelperCollapsed, setPromptHelperCollapsed] = useState(true);

  // ─── Init hook ──────────────────────────────────────────────────────────────
  const {
    loraProfiles,
    loraCatalogEntries,
    selectedLoraProfileId,
    setSelectedLoraProfileId,
    loraCapabilities,
    directorModelOptions,
  } = useWhiskInit({ apiBaseUrl, onError: setError });

  // ─── Image gallery ──────────────────────────────────────────────────────────
  const { images, status, refreshImages, updateImages, removeImage, toggleImageFavorite } =
    useWhiskImages({
      apiBaseUrl,
      cacheKey: IMAGE_CACHE_KEY,
      cacheMaxAge: CACHE_MAX_AGE_MS,
      onError: setError,
    });

  // ─── Video helpers ──────────────────────────────────────────────────────────
  const invalidateVideoCache = useCallback(() => removeSessionCache(VIDEO_CACHE_KEY), []);

  const handleVideoReady = useCallback(({ key, url, sourceKey }) => {
    if (key) setSelectedImageKey(key);
    if (sourceKey) setSelectedSourceImageKey(sourceKey);
    if (typeof url === "string") setSelectedImageUrl(url);
  }, []);

  const resetVideoReady = useCallback(() => {
    setSelectedImageKey("");
    setSelectedSourceImageKey("");
    setSelectedImageUrl("");
  }, []);

  const addVideoReadyImage = useCallback(
    (image) => {
      if (!image?.key || !image?.url) return;
      updateImages((prev) => (prev.some((i) => i.key === image.key) ? prev : [image, ...prev]));
    },
    [updateImages]
  );

  // ─── Image studio ───────────────────────────────────────────────────────────
  const {
    imageSource,
    setImageSource,
    imageSourceOptions,
    imageGenerationProps,
    imageUploadProps,
    isGeneratingImage,
    isUploading,
  } = useImageStudio({
    apiBaseUrl,
    selectedLoraProfileId,
    loraImageSupportByModel: loraCapabilities.imageByModel,
    loraImageSupportByProviderModel: loraCapabilities.imageByProviderModel,
    supportedImageLoraModels: loraCapabilities.supportedImageModels,
    supportedImageLoraModelsByProvider: loraCapabilities.supportedImageModelsByProvider,
    loraCatalogEntries,
    directorImageModels: directorModelOptions.imageModels,
    directorCivitaiModels: directorModelOptions.civitaiModels,
    directorGenerationByModel: directorModelOptions.generationByModel,
    onError: setError,
    onVideoReady: handleVideoReady,
    onResetVideoReady: resetVideoReady,
    onAddVideoReadyImage: addVideoReadyImage,
    onCloseImageModal: () => setActiveModal(""),
    onGenerationComplete: () => refreshImages(true),
  });

  // ─── Video generation ────────────────────────────────────────────────────────
  const {
    videoProvider,
    videoProviderOptions,
    videoModel,
    videoModelOptions,
    setVideoProvider,
    setVideoModel,
    videoGenerateAudio,
    setVideoGenerateAudio,
    isReplicateAudioOption,
    isGenerating: isGeneratingVideo,
    isVideoInProgress,
    prompt: videoPrompt,
    setPrompt: setVideoPrompt,
    handleGenerateVideo,
  } = useVideoGeneration({
    apiBaseUrl,
    selectedImageKey,
    selectedSourceImageKey,
    selectedImageUrl,
    selectedLoraProfileId,
    loraVideoSupportByModel: loraCapabilities.videoByModel,
    supportedVideoLoraModels: loraCapabilities.supportedVideoModels,
    directorVideoModels: directorModelOptions.videoModels,
    onError: setError,
    onSubmitted: () => {},
    onCompleted: () => {
      invalidateVideoCache();
      setActiveModal("");
    },
  });

  // ─── Companion reactions ─────────────────────────────────────────────────────
  const prevGeneratingRef = useRef(false);
  useEffect(() => {
    if (isGeneratingImage && !prevGeneratingRef.current)
      dispatch(CompanionActions.GENERATION_START, { type: "image" });
    else if (!isGeneratingImage && prevGeneratingRef.current)
      dispatch(CompanionActions.GENERATION_DONE, { type: "image", success: true });
    prevGeneratingRef.current = isGeneratingImage;
  }, [isGeneratingImage, dispatch]);

  // ─── Pre-fill prompt + size from agent Tweak URL params ─────────────────
  const { tweakNotice } = usePrefilledFromAgent({ ...props, ...imageGenerationProps });

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleShare = useCallback(
    async (image) => {
      if (!apiBaseUrl || !image?.key) return;
      setSharingImageKey(image.key);
      try {
        await shareImage(apiBaseUrl, image.key);
      } catch (e) {
        setError(e?.message || "Failed to share image.");
      } finally {
        setSharingImageKey("");
      }
    },
    [apiBaseUrl]
  );

  const handleOpenVideo = useCallback(
    async (image) => {
      if (!image?.key || !apiBaseUrl) return;
      try {
        await selectGeneratedImage(apiBaseUrl, image.key);
        setSelectedImageKey(image.key);
        setSelectedSourceImageKey(image.key);
        setSelectedImageUrl(image.url || "");
      } catch (e) {
        setError(e?.message || "Failed to select image for video.");
        return;
      }
      setActiveModal("video");
    },
    [apiBaseUrl]
  );

  const closeModal = useCallback(() => {
    setActiveModal("");
    refreshImages(true);
  }, [refreshImages]);

  // Destructure generation props
  const {
    imageModel,
    imageModelOptions,
    onSelectModel,
    imagePrompt,
    onImagePromptChange,
    imageNegativePrompt,
    onImageNegativePromptChange,
    imageSize,
    imageSizeOptions,
    onImageSizeChange,
    imageCount,
    imageCountOptions,
    onImageCountChange,
    imageScheduler,
    imageSchedulerOptions,
    onImageSchedulerChange,
    imageGenerationName,
    onImageNameChange,
    onGenerateImage,
    imageGenerationNotice,
  } = imageGenerationProps;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="skr-gen-layout">
      {tweakNotice ? (
        <div className="skr-tweak-notice" role="status">
          <span aria-hidden="true">✦</span>
          <span>{tweakNotice}</span>
        </div>
      ) : null}
      {/* Prompt bar — full width above canvas */}
      <div className="skr-gen-prompt-area">
        <textarea
          className="skr-gen-prompt-input"
          placeholder="Describe what to generate… e.g. 1girl, frieren, forest, cinematic lighting"
          value={imagePrompt}
          onChange={(e) => onImagePromptChange(e.target.value)}
          rows={3}
        />
        <div className="skr-gen-prompt-actions">
          <button
            className="skr-btn-primary skr-gen-generate-btn"
            onClick={() => {
              setError("");
              onGenerateImage();
            }}
            disabled={isGeneratingImage || !imagePrompt.trim()}
          >
            {isGeneratingImage ? "⏳ Generating…" : "✦ Generate"}
          </button>
          <SummonAgentButton prompt={imagePrompt} />
          <HiyoriSuggestButton
            field="prompt"
            currentPrompt={imagePrompt}
            onValue={onImagePromptChange}
            label="prompt"
          />
          <HiyoriSuggestButton
            field="negativePrompt"
            currentPrompt={imagePrompt}
            onValue={onImageNegativePromptChange}
            label="negative"
          />
          {error && <span style={{ fontSize: 12, color: "#ef4444" }}>{error}</span>}
        </div>
      </div>

      {/* Canvas — image wall */}
      <div className="skr-gen-canvas">
        <SolarisImageWall
          images={images}
          status={status}
          onOpenLightbox={setLightboxImage}
          onDeleteImage={removeImage}
          onToggleFavorite={toggleImageFavorite}
          onShareImage={handleShare}
          sharingImageKey={sharingImageKey}
          onViewPrompt={setPromptPreviewImage}
          onOpenVideo={handleOpenVideo}
          canLoadMore={false}
          totalCount={images.length}
        />
        {lightboxImage && (
          <div className="skr-lightbox" onClick={() => setLightboxImage(null)}>
            <button className="skr-lightbox-close" onClick={() => setLightboxImage(null)}>
              ✕
            </button>
            <img
              src={lightboxImage.url}
              alt={lightboxImage.prompt || ""}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        {promptPreviewImage && (
          <div className="skr-modal-backdrop" onClick={() => setPromptPreviewImage(null)}>
            <div className="skr-modal" onClick={(e) => e.stopPropagation()}>
              <div className="skr-modal-header">
                <span className="skr-modal-title">Prompt</span>
                <button className="skr-modal-close" onClick={() => setPromptPreviewImage(null)}>
                  ✕
                </button>
              </div>
              <p style={{ fontSize: 13, color: "var(--skr-text-secondary)", lineHeight: 1.6 }}>
                {promptPreviewImage?.prompt || "No prompt recorded."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right sidebar settings */}
      <GeneratorSidebar
        apiBaseUrl={apiBaseUrl}
        imageSource={imageSource}
        imageSourceOptions={imageSourceOptions}
        onSourceChange={setImageSource}
        imageModel={imageModel}
        imageModelOptions={imageModelOptions}
        onSelectModel={onSelectModel}
        imagePrompt={imagePrompt}
        onImagePromptChange={onImagePromptChange}
        imageNegativePrompt={imageNegativePrompt}
        onImageNegativePromptChange={onImageNegativePromptChange}
        imageSize={imageSize}
        imageSizeOptions={imageSizeOptions}
        onImageSizeChange={onImageSizeChange}
        imageCount={imageCount}
        imageCountOptions={imageCountOptions}
        onImageCountChange={onImageCountChange}
        imageScheduler={imageScheduler}
        imageSchedulerOptions={imageSchedulerOptions}
        onImageSchedulerChange={onImageSchedulerChange}
        imageGenerationName={imageGenerationName}
        onImageNameChange={onImageNameChange}
        imageGenerationNotice={imageGenerationNotice}
        selectedCharacterId={selectedCharacterId}
        setSelectedCharacterId={setSelectedCharacterId}
        selectedLoraProfileId={selectedLoraProfileId}
        setSelectedLoraProfileId={setSelectedLoraProfileId}
        loraProfiles={loraProfiles}
        imageGenerationProps={imageGenerationProps}
        isGenerating={isGeneratingImage}
        error={error}
        onGenerate={() => {
          setError("");
          onGenerateImage();
        }}
        onOpenFullOptions={() => setActiveModal("generate")}
      />

      {/* Full generation modal */}
      {activeModal === "generate" && (
        <GenerationModal
          apiBaseUrl={apiBaseUrl}
          onClose={closeModal}
          imageSource={imageSource}
          imageSourceOptions={imageSourceOptions}
          setImageSource={setImageSource}
          imageModel={imageModel}
          imageModelOptions={imageModelOptions}
          onSelectModel={onSelectModel}
          imagePrompt={imagePrompt}
          onImagePromptChange={onImagePromptChange}
          imageNegativePrompt={imageNegativePrompt}
          onImageNegativePromptChange={onImageNegativePromptChange}
          imageSize={imageSize}
          imageSizeOptions={imageSizeOptions}
          onImageSizeChange={onImageSizeChange}
          imageCount={imageCount}
          imageCountOptions={imageCountOptions}
          onImageCountChange={onImageCountChange}
          imageScheduler={imageScheduler}
          imageSchedulerOptions={imageSchedulerOptions}
          onImageSchedulerChange={onImageSchedulerChange}
          imageGenerationName={imageGenerationName}
          onImageNameChange={onImageNameChange}
          imageGenerationNotice={imageGenerationNotice}
          selectedCharacterId={selectedCharacterId}
          setSelectedCharacterId={setSelectedCharacterId}
          selectedLoraProfileId={selectedLoraProfileId}
          setSelectedLoraProfileId={setSelectedLoraProfileId}
          loraProfiles={loraProfiles}
          imageGenerationProps={imageGenerationProps}
          promptHelperCollapsed={promptHelperCollapsed}
          setPromptHelperCollapsed={setPromptHelperCollapsed}
          imageUploadProps={imageUploadProps}
          isUploading={isUploading}
          error={error}
          isGenerating={isGeneratingImage}
          onGenerate={() => {
            setError("");
            onGenerateImage();
          }}
        />
      )}

      {/* Video generation modal */}
      {activeModal === "video" && (
        <VideoGenerationModal
          onClose={() => setActiveModal("")}
          selectedImageUrl={selectedImageUrl}
          videoProvider={videoProvider}
          videoProviderOptions={videoProviderOptions}
          setVideoProvider={setVideoProvider}
          videoModel={videoModel}
          videoModelOptions={videoModelOptions}
          setVideoModel={setVideoModel}
          videoPrompt={videoPrompt}
          setVideoPrompt={setVideoPrompt}
          isReplicateAudioOption={isReplicateAudioOption}
          videoGenerateAudio={videoGenerateAudio}
          setVideoGenerateAudio={setVideoGenerateAudio}
          error={error}
          handleGenerateVideo={handleGenerateVideo}
          isGeneratingVideo={isGeneratingVideo}
          isVideoInProgress={isVideoInProgress}
        />
      )}
    </div>
  );
}
