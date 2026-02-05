import React from "react";
import ImageSourceSelector from "../home/ImageSourceSelector";
import ImageGenerationPanel from "../home/ImageGenerationPanel";
import ImageUploadPanel from "../home/ImageUploadPanel";
import VideoGenerationPanel from "../home/VideoGenerationPanel";

function WhiskModal({
  activeModal,
  onClose,
  imageSource,
  imageSourceOptions,
  onChangeImageSource,
  imageGenerationProps,
  imageUploadProps,
  showVideoSelected,
  selectedImageUrl,
  selectedImageKey,
  videoSelectStatus,
  videoPanelProps,
}) {
  if (!activeModal) return null;

  return (
    <div className="whisk-modal-backdrop" onClick={onClose}>
      <div className="whisk-modal" onClick={(event) => event.stopPropagation()}>
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
            onClick={onClose}
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
                onChange={onChangeImageSource}
              />
              {imageSource !== "upload" ? (
                <ImageGenerationPanel
                  {...imageGenerationProps}
                  singleColumn
                />
              ) : (
                <ImageUploadPanel {...imageUploadProps} />
              )}
            </>
          ) : (
            <>
              {showVideoSelected && selectedImageUrl && (
                <div className="whisk-selected-preview">
                  <img src={selectedImageUrl} alt="Selected for video" />
                  <div>
                    <p className="whisk-label">Selected image</p>
                    <p className="whisk-meta-text">
                      {selectedImageKey || "Preparing video-ready key"}
                    </p>
                    {videoSelectStatus === "loading" && (
                      <p className="whisk-selecting">
                        Preparing video-ready...
                      </p>
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
                {...videoPanelProps}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default WhiskModal;
