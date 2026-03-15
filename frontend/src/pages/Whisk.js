import React, { useEffect, useMemo, useState } from "react";
import WhiskHero from "../components/whisk/WhiskHero";
import WhiskWall from "../components/whisk/WhiskWall";
import WhiskModal from "../components/whisk/WhiskModal";
import { selectGeneratedImage } from "../services/images";
import { listLoraCatalog, listLoraProfiles } from "../services/lora";
import { fetchDirectorConfig } from "../services/operations";
import { shareImage } from "../services/s3";
import { removeSessionCache } from "../utils/sessionCache";
import { useImageStudio } from "./whisk/hooks/useImageStudio";
import { useVideoGeneration } from "./whisk/hooks/useVideoGeneration";
import { useWhiskImages } from "./whisk/hooks/useWhiskImages";

const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const IMAGE_CACHE_KEY = "whisk_images_cache";
const VIDEO_CACHE_KEY = "whisk_videos_cache";
const EMPTY_LORA_CAPABILITIES = Object.freeze({
  imageByModel: {},
  imageByProviderModel: {},
  videoByModel: {},
  supportedImageModels: [],
  supportedImageModelsByProvider: {},
  supportedVideoModels: [],
});
const EMPTY_DIRECTOR_MODEL_OPTIONS = Object.freeze({
  imageModels: [],
  civitaiModels: [],
  generationByModel: {},
  videoModels: [],
});

const toLoraSupportMap = (models = []) =>
  (Array.isArray(models) ? models : []).reduce((accumulator, item) => {
    const modelKey = String(item?.key || "").trim();
    if (!modelKey) {
      return accumulator;
    }
    accumulator[modelKey] = Boolean(item?.supportsLora);
    return accumulator;
  }, {});

const buildSupportedModels = (supportMap = {}) =>
  Object.keys(supportMap).filter((modelKey) => Boolean(supportMap[modelKey]));

const buildUnsupportedLoraMessage = ({
  modality = "image",
  modelKey = "",
  supportedModels = [],
}) => {
  const normalizedModelKey = String(modelKey || "").trim() || "selected model";
  const normalizedSupportedModels = Array.isArray(supportedModels)
    ? supportedModels.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const supportedText = normalizedSupportedModels.length
    ? `Compatible models: ${normalizedSupportedModels.join(", ")}.`
    : `No ${modality} models are currently configured with LoRA support.`;
  return `The selected LoRA profile cannot be used with "${normalizedModelKey}". ${supportedText}`;
};

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
  const [loraProfiles, setLoraProfiles] = useState([]);
  const [loraCatalogEntries, setLoraCatalogEntries] = useState([]);
  const [selectedLoraProfileId, setSelectedLoraProfileId] = useState("");
  const [loraCapabilities, setLoraCapabilities] = useState(
    EMPTY_LORA_CAPABILITIES
  );
  const [directorModelOptions, setDirectorModelOptions] = useState(
    EMPTY_DIRECTOR_MODEL_OPTIONS
  );
  const [isLoadingLoraData, setIsLoadingLoraData] = useState(false);
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

  useEffect(() => {
    if (!resolvedApiBaseUrl) {
      setLoraProfiles([]);
      setLoraCatalogEntries([]);
      setSelectedLoraProfileId("");
      setLoraCapabilities(EMPTY_LORA_CAPABILITIES);
      setDirectorModelOptions(EMPTY_DIRECTOR_MODEL_OPTIONS);
      return undefined;
    }

    let isCancelled = false;
    setIsLoadingLoraData(true);

    Promise.all([
      listLoraProfiles(resolvedApiBaseUrl),
      fetchDirectorConfig(resolvedApiBaseUrl),
      listLoraCatalog(resolvedApiBaseUrl, { limit: 100 }).catch(() => ({
        items: [],
      })),
    ])
      .then(([profilePayload, configPayload, catalogPayload]) => {
        if (isCancelled) return;

        const profileItems = Array.isArray(profilePayload?.items)
          ? profilePayload.items
              .map((item) => ({
                characterId: String(item?.characterId || "").trim(),
                displayName: String(item?.displayName || "").trim(),
              }))
              .filter(
                (item) =>
                  item.characterId &&
                  item.characterId !== "__whisk_civitai_runtime__"
              )
          : [];
        setLoraProfiles(profileItems);
        setSelectedLoraProfileId((current) =>
          profileItems.some((item) => item.characterId === current) ? current : ""
        );
        const catalogItems = Array.isArray(catalogPayload?.items)
          ? catalogPayload.items
              .map((item) => ({
                catalogId: String(item?.catalogId || "").trim(),
                name: String(item?.name || item?.modelName || "").trim(),
                modelName: String(item?.modelName || "").trim(),
                baseModel: String(item?.baseModel || "").trim(),
                creatorName: String(item?.creatorName || "").trim(),
                triggerWords: Array.isArray(item?.triggerWords)
                  ? item.triggerWords
                      .map((word) => String(word || "").trim())
                      .filter(Boolean)
                  : [],
                downloadUrl: String(item?.downloadUrl || "").trim(),
              }))
              .filter((item) => item.catalogId)
          : [];
        setLoraCatalogEntries(catalogItems);

        const imageSupportMap = toLoraSupportMap(
          configPayload?.options?.generation?.imageModels
        );
        const civitaiImageSupportMap = toLoraSupportMap(
          configPayload?.options?.generation?.civitaiModels
        );
        const videoSupportMap = toLoraSupportMap(configPayload?.options?.video?.models);
        const imageModels = Array.isArray(configPayload?.options?.generation?.imageModels)
          ? configPayload.options.generation.imageModels
          : [];
        const civitaiModels = Array.isArray(
          configPayload?.options?.generation?.civitaiModels
        )
          ? configPayload.options.generation.civitaiModels
          : [];
        const generationByModel =
          configPayload?.options?.generation?.byModel &&
          typeof configPayload.options.generation.byModel === "object"
            ? configPayload.options.generation.byModel
            : {};
        const videoModels = Array.isArray(configPayload?.options?.video?.models)
          ? configPayload.options.video.models
          : [];
        setDirectorModelOptions({
          imageModels,
          civitaiModels,
          generationByModel,
          videoModels,
        });
        setLoraCapabilities({
          imageByModel: imageSupportMap,
          imageByProviderModel: {
            replicate: imageSupportMap,
            civitai: civitaiImageSupportMap,
          },
          videoByModel: videoSupportMap,
          supportedImageModels: buildSupportedModels(imageSupportMap),
          supportedImageModelsByProvider: {
            replicate: buildSupportedModels(imageSupportMap),
            civitai: buildSupportedModels(civitaiImageSupportMap),
          },
          supportedVideoModels: buildSupportedModels(videoSupportMap),
        });
      })
      .catch((loadError) => {
        if (isCancelled) return;
        setDirectorModelOptions(EMPTY_DIRECTOR_MODEL_OPTIONS);
        setLoraCatalogEntries([]);
        setError(loadError?.message || "Failed to load LoRA profile options.");
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingLoraData(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [resolvedApiBaseUrl]);

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
    isGeneratingImage,
    isUploading,
    resetImageForm,
  } = useImageStudio({
    apiBaseUrl: resolvedApiBaseUrl,
    selectedLoraProfileId,
    loraImageSupportByModel: loraCapabilities.imageByModel,
    loraImageSupportByProviderModel: loraCapabilities.imageByProviderModel,
    supportedImageLoraModels: loraCapabilities.supportedImageModels,
    supportedImageLoraModelsByProvider:
      loraCapabilities.supportedImageModelsByProvider,
    loraCatalogEntries,
    directorImageModels: directorModelOptions.imageModels,
    directorCivitaiModels: directorModelOptions.civitaiModels,
    directorGenerationByModel: directorModelOptions.generationByModel,
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
    selectedLoraProfileId,
    loraVideoSupportByModel: loraCapabilities.videoByModel,
    supportedVideoLoraModels: loraCapabilities.supportedVideoModels,
    directorVideoModels: directorModelOptions.videoModels,
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

  const loraProfileOptions = useMemo(
    () =>
      loraProfiles.map((profile) => ({
        value: profile.characterId,
        label: profile.displayName || profile.characterId,
      })),
    [loraProfiles]
  );

  const imageLoraSupportBySourceModel = useMemo(
    () => ({
      replicate:
        loraCapabilities.imageByProviderModel?.replicate ||
        loraCapabilities.imageByModel ||
        {},
      civitai: loraCapabilities.imageByProviderModel?.civitai || {},
    }),
    [loraCapabilities.imageByModel, loraCapabilities.imageByProviderModel]
  );

  const supportedImageLoraBySource = useMemo(
    () => ({
      replicate:
        loraCapabilities.supportedImageModelsByProvider?.replicate ||
        loraCapabilities.supportedImageModels ||
        [],
      civitai: loraCapabilities.supportedImageModelsByProvider?.civitai || [],
    }),
    [
      loraCapabilities.supportedImageModels,
      loraCapabilities.supportedImageModelsByProvider,
    ]
  );

  const imageLoraUnsupported = Boolean(
    selectedLoraProfileId &&
      (!["replicate", "civitai"].includes(imageSource) ||
        !Boolean(
          imageLoraSupportBySourceModel?.[imageSource]?.[
            imageGenerationProps.imageModel
          ]
        ))
  );
  const videoLoraUnsupported = Boolean(
    selectedLoraProfileId &&
      (videoProvider !== "replicate" ||
        !Boolean(loraCapabilities.videoByModel[videoModel]))
  );

  const imageLoraSupportNotice = imageLoraUnsupported
    ? buildUnsupportedLoraMessage({
        modality: "image",
        modelKey: imageGenerationProps.imageModel,
        supportedModels: supportedImageLoraBySource?.[imageSource] || [],
      })
    : "";
  const videoLoraSupportNotice = videoLoraUnsupported
    ? buildUnsupportedLoraMessage({
        modality: "video",
        modelKey: videoModel,
        supportedModels: loraCapabilities.supportedVideoModels,
      })
    : "";

  const imageModalProps = useMemo(
    () => ({
      ...imageGenerationProps,
      loraProfileId: selectedLoraProfileId,
      loraProfileOptions,
      onSelectLoraProfile: setSelectedLoraProfileId,
      loraProfileDisabled: isLoadingLoraData,
      loraSupportNotice:
        imageGenerationProps.loraSupportNotice || imageLoraSupportNotice,
    }),
    [
      imageGenerationProps,
      selectedLoraProfileId,
      loraProfileOptions,
      isLoadingLoraData,
      imageLoraSupportNotice,
    ]
  );

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
        imageGenerationProps={imageModalProps}
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
          loraProfileId: selectedLoraProfileId,
          loraProfileOptions,
          onSelectLoraProfile: setSelectedLoraProfileId,
          loraProfileDisabled: isLoadingLoraData,
          loraSupportNotice: videoLoraSupportNotice,
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
