import React, { useEffect, useMemo, useState } from "react";
import WhiskHero from "../components/whisk/WhiskHero";
import WhiskWall from "../components/whisk/WhiskWall";
import WhiskModal from "../components/whisk/WhiskModal";
import { selectGeneratedImage } from "../services/images";
import { shareImage } from "../services/s3";
import { removeSessionCache } from "../utils/sessionCache";
import { useImageStudio } from "./whisk/hooks/useImageStudio";
import { useVideoGeneration } from "./whisk/hooks/useVideoGeneration";
import { useWhiskImages } from "./whisk/hooks/useWhiskImages";

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
  const [promptPreviewImage, setPromptPreviewImage] = useState(null);
  const [sharingImageKey, setSharingImageKey] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const pageSize = 10;

  const resolvedApiBaseUrl =
    apiBaseUrl || process.env.REACT_APP_API_URL || "";

  const {
    images,
    status,
    refreshImages,
    updateImages,
    removeImage,
    toggleImageFavorite,
  } = useWhiskImages({
    apiBaseUrl: resolvedApiBaseUrl,
    cacheKey: IMAGE_CACHE_KEY,
    cacheMaxAge: CACHE_MAX_AGE_MS,
    onError: setError,
  });

  const invalidateVideoCache = () => {
    removeSessionCache(VIDEO_CACHE_KEY);
  };

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

  const closeModal = () => {
    setActiveModal("");
    refreshImages(true);
  };

  const {
    imageSource,
    setImageSource,
    imageSourceOptions,
    imageGenerationProps,
    imageUploadProps,
    selectedCharacterId,
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
    characterId: selectedCharacterId,
    onError: setError,
    onSubmitted: () => {
      invalidateVideoCache();
      closeModal();
    },
    onCompleted: invalidateVideoCache,
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

  const handleShareImage = async (image) => {
    if (!image?.key || !resolvedApiBaseUrl) return;
    setError("");
    setShareStatus("");
    setSharingImageKey(image.key);
    try {
      await shareImage(resolvedApiBaseUrl, image.key);
      setShareStatus("Image shared to the library.");
    } catch (shareError) {
      setError(shareError?.message || "Failed to share image.");
    } finally {
      setSharingImageKey("");
    }
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
        error={error}
        isGeneratingImage={isGeneratingImage}
        isUploading={isUploading}
      />

      <div className="whisk-gallery">
        <WhiskWall
          images={pagedImages}
          status={status}
          onOpenVideo={openVideoModalForImage}
          onShareImage={handleShareImage}
          sharingImageKey={sharingImageKey}
          onDeleteImage={removeImage}
          onToggleFavorite={toggleImageFavorite}
          onViewPrompt={setPromptPreviewImage}
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

      {shareStatus && <div className="whisk-share-status">{shareStatus}</div>}
      {error && <div className="whisk-error-panel">{error}</div>}

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

      {promptPreviewImage?.prompt && (
        <div
          className="whisk-lightbox whisk-lightbox--prompt"
          onClick={() => setPromptPreviewImage(null)}
        >
          <div
            className="whisk-prompt-card"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Generation Prompt</h3>
            <p>{promptPreviewImage.prompt}</p>
            {promptPreviewImage.negativePrompt ? (
              <>
                <h4>Negative Prompt</h4>
                <p>{promptPreviewImage.negativePrompt}</p>
              </>
            ) : null}
            <button
              type="button"
              className="btn-ghost px-4 py-2 text-sm"
              onClick={() => setPromptPreviewImage(null)}
            >
              Close
            </button>
          </div>
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
