import React, { useEffect, useRef } from "react";

const AUTO_PAN_SPEED_PX_PER_SECOND = 20;
const AUTO_PAN_EDGE_PAUSE_MS = 1300;

const toDisplayLabel = (image, index) => {
  const raw = image?.key || image?.url || "";
  const base = raw.split("/").pop() || `image-${index + 1}`;
  const withoutExt = base.replace(/\.[^/.]+$/, "");
  const normalized = withoutExt.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return `Image ${index + 1}`;
  return normalized;
};

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
  const wallRef = useRef(null);
  const animationFrameRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const edgePauseUntilRef = useRef(0);
  const directionRef = useRef(1);
  const pausedRef = useRef(false);

  useEffect(() => {
    const wall = wallRef.current;
    if (!wall) return undefined;
    if (
      typeof document !== "undefined" &&
      !document.body.classList.contains("theme-pixnovel")
    ) {
      return undefined;
    }

    wall.scrollLeft = 0;
    directionRef.current = 1;
    lastFrameTimeRef.current = 0;
    edgePauseUntilRef.current = 0;

    const tick = (timestamp) => {
      const maxScrollLeft = Math.max(0, wall.scrollWidth - wall.clientWidth);
      if (maxScrollLeft <= 1) {
        wall.scrollLeft = 0;
      } else if (!pausedRef.current) {
        if (lastFrameTimeRef.current === 0) {
          lastFrameTimeRef.current = timestamp;
        }
        const deltaSeconds = (timestamp - lastFrameTimeRef.current) / 1000;
        lastFrameTimeRef.current = timestamp;

        if (edgePauseUntilRef.current <= timestamp) {
          const distance = AUTO_PAN_SPEED_PX_PER_SECOND * deltaSeconds;
          let nextScrollLeft = wall.scrollLeft + directionRef.current * distance;

          if (nextScrollLeft >= maxScrollLeft) {
            nextScrollLeft = maxScrollLeft;
            directionRef.current = -1;
            edgePauseUntilRef.current = timestamp + AUTO_PAN_EDGE_PAUSE_MS;
          } else if (nextScrollLeft <= 0) {
            nextScrollLeft = 0;
            directionRef.current = 1;
            edgePauseUntilRef.current = timestamp + AUTO_PAN_EDGE_PAUSE_MS;
          }

          wall.scrollLeft = nextScrollLeft;
        }
      } else {
        lastFrameTimeRef.current = timestamp;
      }

      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrameRef.current);
    };
  }, [images.length]);

  const pauseAutoPan = () => {
    pausedRef.current = true;
  };

  const resumeAutoPan = () => {
    pausedRef.current = false;
  };

  const handleBlurCapture = (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    resumeAutoPan();
  };

  return (
    <>
      <div className="whisk-wall-shell">
        <div className="whisk-wall-head">
          <button
            type="button"
            className="whisk-wall-create"
            onClick={onOpenImageModal}
            aria-label="Open image studio"
          >
            <span className="whisk-tile-plus">+</span>
            <span className="whisk-wall-create-label">New</span>
          </button>
        </div>
        <div
          ref={wallRef}
          className="whisk-wall"
          onMouseEnter={pauseAutoPan}
          onMouseLeave={resumeAutoPan}
          onFocusCapture={pauseAutoPan}
          onBlurCapture={handleBlurCapture}
        >
        {images.length > 0 ? (
          images.map((image, index) => (
            <div
              key={image.key || `${image.url}-${index}`}
              role="button"
              tabIndex={0}
              className="whisk-tile"
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
              <span className="whisk-tile-media">
                <img
                  className="whisk-tile-image whisk-tile-image--backdrop"
                  src={image.url}
                  alt=""
                  aria-hidden="true"
                />
                <span className="whisk-tile-backdrop" />
                <img
                  className="whisk-tile-image whisk-tile-image--main"
                  src={image.url}
                  alt={image.key || "Generated image"}
                />
              </span>
              <div className="whisk-tile-overlay" />
              <span className="whisk-tile-caption">{toDisplayLabel(image, index)}</span>
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
        </div>
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
