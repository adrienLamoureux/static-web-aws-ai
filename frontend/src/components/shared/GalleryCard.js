import React, { useState } from "react";

/**
 * Enhanced gallery card — PixAI-inspired design with metadata overlay.
 * Used on the home feed for images and videos.
 */
export default function GalleryCard({ image, onOpenLightbox, onToggleFavorite, isVideo = false }) {
  const [hovered, setHovered] = useState(false);
  const prompt = image?.prompt || "";
  const tags = prompt
    .split(",")
    .slice(0, 3)
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <article
      className="skr-gallery-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="skr-gallery-card-media"
        onClick={() => onOpenLightbox && onOpenLightbox(image)}
      >
        {image?.url && (
          <img
            src={image.url}
            alt={prompt || "Generated image"}
            loading="lazy"
            className="skr-gallery-card-img"
          />
        )}
        {isVideo && <span className="skr-gallery-card-badge">Animated</span>}

        {/* Hover overlay */}
        <div className={`skr-gallery-card-overlay${hovered ? " is-visible" : ""}`}>
          {tags.length > 0 && (
            <div className="skr-gallery-card-tags">
              {tags.map((tag, i) => (
                <span key={i} className="skr-gallery-card-tag">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Card footer */}
      <div className="skr-gallery-card-footer">
        <div className="skr-gallery-card-meta">
          <span className="skr-gallery-card-title" title={prompt}>
            {prompt ? prompt.split(",")[0].trim() : "Untitled"}
          </span>
        </div>
        <div className="skr-gallery-card-actions">
          {onToggleFavorite && (
            <button
              type="button"
              className={`skr-gallery-card-fav${image?.favorite ? " is-active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(image);
              }}
              title={image?.favorite ? "Remove from favorites" : "Add to favorites"}
            >
              {image?.favorite ? "♥" : "♡"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
