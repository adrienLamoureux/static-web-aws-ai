import React from "react";

function WhiskWall({
  images,
  status,
  onOpenVideo,
  onDeleteImage,
  onOpenImageModal,
  onOpenLightbox,
  canLoadMore,
  onLoadMore,
  totalCount,
}) {
  const resolvedTotal =
    typeof totalCount === "number" ? totalCount : images.length;
  return (
    <>
      <div className="whisk-wall">
      {images.length > 0 ? (
        images.map((image, index) => (
          <div
            key={image.key || `${image.url}-${index}`}
            role="button"
            tabIndex={0}
            className={`whisk-tile ${index === 0 ? "is-feature" : ""}`}
            onClick={() => {
              onOpenLightbox?.(image);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenLightbox?.(image);
              }
            }}
          >
            <img src={image.url} alt={image.key || "Generated image"} />
            <div className="whisk-tile-overlay" />
            <span className="whisk-tile-actions">
              <button
                type="button"
                className="whisk-icon-button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenVideo(image);
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
                  onDeleteImage(image);
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
        onClick={onOpenImageModal}
      >
        <div className="whisk-tile-plus">+</div>
      </button>
      </div>
      <div className="whisk-wall-footer">
        <span className="whisk-wall-count">
          Showing {images.length} of {resolvedTotal}
        </span>
        {canLoadMore && (
          <button
            type="button"
            className="whisk-wall-more"
            onClick={onLoadMore}
          >
            Load 10 more
          </button>
        )}
      </div>
    </>
  );
}

export default WhiskWall;
