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

function SolarisImageWall({
  images,
  status,
  onOpenVideo,
  onShareImage,
  sharingImageKey,
  onDeleteImage,
  onOpenImageModal,
  onOpenLightbox,
  onToggleFavorite,
  onViewPrompt,
  canLoadMore,
  onLoadMore,
  totalCount,
  showCta,
  onCta,
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
      <div
        ref={wallRef}
        className="kit-image-wall"
        onMouseEnter={pauseAutoPan}
        onMouseLeave={resumeAutoPan}
        onFocusCapture={pauseAutoPan}
        onBlurCapture={handleBlurCapture}
      >
        {showCta && (
          <div
            className="kit-image-tile kit-image-tile-cta"
            role="button"
            tabIndex={0}
            onClick={onCta}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onCta?.();
              }
            }}
            aria-label="Open image studio"
          >
            <span className="kit-image-tile-plus">+</span>
          </div>
        )}
        {images.length > 0 ? (
          images.map((image, index) => (
            <div
              key={image.key || `${image.url}-${index}`}
              role="button"
              tabIndex={0}
              className="kit-image-tile"
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
              <span className="kit-image-tile-media">
                <img
                  className="kit-image-tile-backdrop"
                  src={image.url}
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="kit-image-tile-main"
                  src={image.url}
                  alt={image.key || "Generated image"}
                />
              </span>
              <div className="kit-image-tile-overlay" />
              <span className="kit-image-tile-caption">{toDisplayLabel(image, index)}</span>
              <span className="kit-image-tile-actions">
                {onOpenVideo && (
                  <button
                    type="button"
                    className="kit-icon-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenVideo(image);
                    }}
                    aria-label="Generate video from image"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" width="12" height="12">
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
                )}
                {image.url && (
                  <a
                    className="kit-icon-btn"
                    href={image.url}
                    download
                    onClick={(event) => event.stopPropagation()}
                    aria-label="Download image"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" width="12" height="12">
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
                {image.prompt && onViewPrompt ? (
                  <button
                    type="button"
                    className="kit-icon-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onViewPrompt(image);
                    }}
                    aria-label="View generation prompt"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" width="12" height="12">
                      <path
                        d="M4 5h16v14H4zM8 9h8M8 13h5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`kit-icon-btn${image.favorite ? " is-favorite" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleFavorite?.(image);
                  }}
                  aria-label={
                    image.favorite
                      ? "Remove image from favorites"
                      : "Add image to favorites"
                  }
                >
                  ♥
                </button>
                {onShareImage && (
                  <button
                    type="button"
                    className="kit-icon-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onShareImage?.(image);
                    }}
                    disabled={!onShareImage || sharingImageKey === image.key}
                    aria-label="Share image to library"
                  >
                    {sharingImageKey === image.key ? (
                      "…"
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true" width="12" height="12">
                        <path
                          d="M15 8a3 3 0 1 0-2.8-4h-.4A3 3 0 0 0 9 8c0 .6.2 1.1.4 1.6l-3 2a3 3 0 1 0 1 1.6l3-2a3 3 0 0 0 3.2 0l3 2a3 3 0 1 0 1-1.6l-3-2c.3-.5.4-1 .4-1.6z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                )}
                {onDeleteImage && (
                  <button
                    type="button"
                    className="kit-icon-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteImage(image);
                    }}
                    aria-label="Delete image"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" width="12" height="12">
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
                )}
              </span>
            </div>
          ))
        ) : (
          <div style={{ padding: '20px', color: 'var(--kit-text-tertiary)', fontSize: 13 }}>
            {status === "loading"
              ? "Loading images..."
              : "No images found yet."}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', fontSize: 11, color: 'var(--kit-text-tertiary)' }}>
        <span>
          Showing {images.length} of {resolvedTotal}
        </span>
        {canLoadMore && (
          <button
            type="button"
            className="kit-btn-secondary"
            onClick={onLoadMore}
            style={{ fontSize: 11, padding: '4px 10px' }}
          >
            Load 10 more
          </button>
        )}
      </div>
    </>
  );
}

export default SolarisImageWall;
