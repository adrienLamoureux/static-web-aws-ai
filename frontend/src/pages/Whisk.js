import React, { useEffect, useMemo, useState } from "react";
import WhiskHero from "../components/whisk/WhiskHero";
import WhiskWall from "../components/whisk/WhiskWall";
import WhiskModal from "../components/whisk/WhiskModal";
import { selectGeneratedImage } from "../services/images";
import { useImageStudio } from "./whisk/hooks/useImageStudio";
import { useVideoGeneration } from "./whisk/hooks/useVideoGeneration";
import { useWhiskImages } from "./whisk/hooks/useWhiskImages";
import { useWhiskVideos } from "./whisk/hooks/useWhiskVideos";

const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const IMAGE_CACHE_KEY = "whisk_images_cache";
const VIDEO_CACHE_KEY = "whisk_videos_cache";

function Whisk({ apiBaseUrl = "" }) {
  const [error, setError] = useState("");
  const [activeModal, setActiveModal] = useState("");
  const [videoSelectStatus, setVideoSelectStatus] = useState("idle");
  const [selectedImageKey, setSelectedImageKey] = useState("");
  const [selectedSourceImageKey, setSelectedSourceImageKey] = useState("");
  const [selectedImageUrl, setSelectedImageUrl] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [lightboxImage, setLightboxImage] = useState(null);
  const pageSize = 10;

  const resolvedApiBaseUrl =
    apiBaseUrl || process.env.REACT_APP_API_URL || "";

  const {
    images,
    status,
    refreshImages,
    updateImages,
    removeImage,
  } = useWhiskImages({
    apiBaseUrl: resolvedApiBaseUrl,
    cacheKey: IMAGE_CACHE_KEY,
    cacheMaxAge: CACHE_MAX_AGE_MS,
    onError: setError,
  });

  const {
    videos,
    videoUrls,
    loadingVideoKey,
    refreshVideos,
    removeVideo,
    toggleVideoPreview,
  } = useWhiskVideos({
    apiBaseUrl: resolvedApiBaseUrl,
    cacheKey: VIDEO_CACHE_KEY,
    cacheMaxAge: CACHE_MAX_AGE_MS,
    onError: setError,
  });

  const handleVideoReady = ({ key, url, sourceKey }) => {
    if (key) {
      setSelectedImageKey(key);
    }
    if (sourceKey) {
      setSelectedSourceImageKey(sourceKey);
    }
    if (typeof url === "string") {
      setSelectedImageUrl(url);
    }
  };

  const resetVideoReady = () => {
    setSelectedImageKey("");
    setSelectedSourceImageKey("");
    setSelectedImageUrl("");
  };

  const addVideoReadyImage = (image) => {
    if (!image?.key || !image?.url) return;
    updateImages((prev) => {
      const exists = prev.some((item) => item.key === image.key);
      if (exists) return prev;
      return [image, ...prev];
    });
  };

  const closeModal = ({ refreshVideos: shouldRefreshVideos = false } = {}) => {
    const wasVideoModal = activeModal === "video";
    setActiveModal("");
    refreshImages(true);
    if (shouldRefreshVideos || !wasVideoModal) {
      refreshVideos(true);
    }
  };

  const {
    imageSource,
    setImageSource,
    imageSourceOptions,
    imageGenerationProps,
    imageUploadProps,
    isGeneratingImage,
    isUploading,
    resetImageForm,
  } = useImageStudio({
    apiBaseUrl: resolvedApiBaseUrl,
    onError: setError,
    onVideoReady: handleVideoReady,
    onResetVideoReady: resetVideoReady,
    onAddVideoReadyImage: addVideoReadyImage,
    onCloseImageModal: closeModal,
    onGenerationComplete: () => {
      refreshImages(true);
      refreshVideos(true);
    },
  });

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
    isGenerating,
    isVideoInProgress,
    prompt,
    setPrompt,
    handleGenerateVideo,
  } = useVideoGeneration({
    apiBaseUrl: resolvedApiBaseUrl,
    selectedImageKey,
    selectedSourceImageKey,
    selectedImageUrl,
    onError: setError,
    onSubmitted: () => closeModal({ refreshVideos: true }),
    onCompleted: () => refreshVideos(true),
  });

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
      const resolvedVideoReadyKey = data?.videoReadyKey || image.key;
      setSelectedImageKey(resolvedVideoReadyKey);
      setSelectedSourceImageKey(image.key);
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

  const displayImages = useMemo(
    () =>
      images.filter(
        (image) => !image.key?.includes("/images/video-ready/")
      ),
    [images]
  );

  useEffect(() => {
    setPageIndex(0);
  }, [displayImages.length]);

  const pagedImages = useMemo(
    () => displayImages.slice(0, (pageIndex + 1) * pageSize),
    [displayImages, pageIndex]
  );
  const canLoadMore = displayImages.length > pagedImages.length;

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
          onDeleteImage={removeImage}
          onOpenImageModal={() => {
            resetImageForm();
            setActiveModal("image");
          }}
          onOpenLightbox={setLightboxImage}
          canLoadMore={canLoadMore}
          onLoadMore={() => setPageIndex((prev) => prev + 1)}
          totalCount={displayImages.length}
        />
      </div>

      {error && <div className="whisk-error-panel">{error}</div>}

      <div className="whisk-videos">
        <div className="whisk-panel-header">
          <h2 className="whisk-title">Videos</h2>
        </div>
        {videos.length === 0 ? (
          <p className="whisk-panel-copy">No videos available yet.</p>
        ) : (
          <div className="whisk-video-grid">
            {videos.map((video) => {
              const url = videoUrls[video.key];
              const isLoading = loadingVideoKey === video.key;
              const posterUrl = video.posterUrl;
              return (
                <div key={video.key} className="whisk-video-card">
                  <div className="whisk-video-frame">
                    {url ? (
                      <video
                        className="whisk-video-player"
                        controls
                        preload="metadata"
                        src={url}
                      />
                    ) : posterUrl ? (
                      <img
                        className="whisk-video-poster"
                        src={posterUrl}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <div className="whisk-video-placeholder">
                        <span className="whisk-video-label">Preview</span>
                      </div>
                    )}
                    <div className="whisk-video-overlay">
                      <button
                        type="button"
                        className="whisk-icon-button"
                        onClick={() => toggleVideoPreview(video)}
                        disabled={isLoading}
                        aria-label={
                          url ? "Hide video preview" : "Load video preview"
                        }
                      >
                        {isLoading ? "…" : url ? "⏸" : "▶"}
                      </button>
                      <button
                        type="button"
                        className="whisk-icon-button whisk-icon-button--danger"
                        onClick={() => removeVideo(video)}
                        aria-label="Delete video"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="whisk-video-meta-row" />
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
        imageGenerationProps={imageGenerationProps}
        imageUploadProps={imageUploadProps}
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
          selectedImageKey,
          prompt,
          onPromptChange: setPrompt,
          isReplicateAudioOption,
          videoGenerateAudio,
          onToggleAudio: setVideoGenerateAudio,
          onGenerateVideo: handleGenerateVideo,
          isVideoInProgress,
          isGenerating,
        }}
      />
    </section>
  );
}

export default Whisk;
