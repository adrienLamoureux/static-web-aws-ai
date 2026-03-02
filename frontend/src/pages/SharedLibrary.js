import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  listSharedImageFavorites,
  listSharedImages,
  listSharedVideos,
  setSharedImageFavorite,
} from "../services/s3";

const SHARED_MAX_RESULTS = 200;
const FAVORITE_ICON_LABEL = "Toggle favorite";
const DOWNLOAD_ICON_LABEL = "Download shared image";
const VIDEO_PREVIEW_ICON_LABEL = "Toggle video preview";

const toDisplayLabel = (key = "", index = 0) => {
  const base = String(key || "").split("/").pop() || `shared-${index + 1}`;
  const withoutExt = base.replace(/\.[^/.]+$/, "");
  const normalized = withoutExt
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || `Shared ${index + 1}`;
};

function SharedLibrary({ apiBaseUrl = "" }) {
  const resolvedApiBaseUrl = apiBaseUrl || process.env.REACT_APP_API_URL || "";
  const [images, setImages] = useState([]);
  const [videos, setVideos] = useState([]);
  const [favoriteKeys, setFavoriteKeys] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lightboxImage, setLightboxImage] = useState(null);
  const [activeVideoKey, setActiveVideoKey] = useState("");
  const [updatingFavoriteKey, setUpdatingFavoriteKey] = useState("");

  const favoriteSet = useMemo(() => new Set(favoriteKeys), [favoriteKeys]);

  const refreshLibrary = useCallback(async () => {
    if (!resolvedApiBaseUrl) return;
    setLoading(true);
    setError("");
    try {
      const [imagePayload, videoPayload, favoritePayload] = await Promise.all([
        listSharedImages(resolvedApiBaseUrl, { maxKeys: SHARED_MAX_RESULTS }),
        listSharedVideos(resolvedApiBaseUrl, {
          maxKeys: SHARED_MAX_RESULTS,
          includeUrls: true,
          includePosters: true,
        }),
        listSharedImageFavorites(resolvedApiBaseUrl),
      ]);
      setImages(Array.isArray(imagePayload?.images) ? imagePayload.images : []);
      setVideos(Array.isArray(videoPayload?.videos) ? videoPayload.videos : []);
      setFavoriteKeys(
        Array.isArray(favoritePayload?.keys) ? favoritePayload.keys : []
      );
    } catch (loadError) {
      setError(loadError?.message || "Failed to load shared library.");
    } finally {
      setLoading(false);
    }
  }, [resolvedApiBaseUrl]);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  const filteredImages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return images.filter((image) => {
      const matchesQuery = query
        ? String(image?.key || "").toLowerCase().includes(query)
        : true;
      const isFavorite = favoriteSet.has(image?.key);
      return matchesQuery && (!showFavoritesOnly || isFavorite);
    });
  }, [favoriteSet, images, searchQuery, showFavoritesOnly]);

  const toggleFavorite = useCallback(
    async (imageKey) => {
      if (!resolvedApiBaseUrl || !imageKey) return;
      setError("");
      setUpdatingFavoriteKey(imageKey);
      const nextFavorite = !favoriteSet.has(imageKey);
      try {
        await setSharedImageFavorite(
          resolvedApiBaseUrl,
          imageKey,
          nextFavorite
        );
        setFavoriteKeys((previous) => {
          if (nextFavorite) {
            if (previous.includes(imageKey)) return previous;
            return [imageKey, ...previous];
          }
          return previous.filter((key) => key !== imageKey);
        });
      } catch (updateError) {
        setError(updateError?.message || "Failed to update favorite.");
      } finally {
        setUpdatingFavoriteKey("");
      }
    },
    [favoriteSet, resolvedApiBaseUrl]
  );

  return (
    <section className="whisk-page shared-library-page">
      <div className="shared-library-controls">
        <label className="shared-library-search">
          <span className="pixnovel-control-label">Search shared images</span>
          <input
            type="search"
            className="field-input"
            value={searchQuery}
            placeholder="Search by key or filename"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="whisk-icon-button shared-library-filter"
          onClick={() => setShowFavoritesOnly((previous) => !previous)}
          aria-pressed={showFavoritesOnly}
          aria-label="Toggle favorites filter"
        >
          {showFavoritesOnly ? "★" : "☆"}
        </button>
      </div>

      <div className="shared-library-section">
        <div className="shared-library-section-head">
          <h3>Shared Images</h3>
          <button
            type="button"
            className="btn-ghost px-3 py-1 text-xs"
            onClick={refreshLibrary}
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <p className="pixnovel-feed-copy">Loading shared images...</p>
        ) : filteredImages.length === 0 ? (
          <p className="pixnovel-feed-copy">
            No shared images found for this filter.
          </p>
        ) : (
          <div className="whisk-wall shared-library-wall">
            {filteredImages.map((image, index) => {
              const isFavorite = favoriteSet.has(image.key);
              const isUpdatingFavorite = updatingFavoriteKey === image.key;
              return (
                <div
                  key={image.key || `${image.url}-${index}`}
                  role="button"
                  tabIndex={0}
                  className="whisk-tile"
                  onClick={() => setLightboxImage(image)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setLightboxImage(image);
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
                      alt={toDisplayLabel(image.key, index)}
                    />
                  </span>
                  <div className="whisk-tile-overlay" />
                  <span className="whisk-tile-caption">
                    {toDisplayLabel(image.key, index)}
                  </span>
                  <span className="whisk-tile-actions">
                    <button
                      type="button"
                      className={`whisk-icon-button${
                        isFavorite ? " whisk-icon-button--active" : ""
                      }`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleFavorite(image.key);
                      }}
                      disabled={isUpdatingFavorite}
                      aria-label={FAVORITE_ICON_LABEL}
                    >
                      {isUpdatingFavorite ? "…" : isFavorite ? "★" : "☆"}
                    </button>
                    {image.url ? (
                      <a
                        className="whisk-icon-button"
                        href={image.url}
                        download
                        onClick={(event) => event.stopPropagation()}
                        aria-label={DOWNLOAD_ICON_LABEL}
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
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="shared-library-section">
        <div className="shared-library-section-head">
          <h3>Shared Videos</h3>
          <p className="pixnovel-feed-copy">{videos.length} clip(s)</p>
        </div>
        {loading ? (
          <p className="pixnovel-feed-copy">Loading shared videos...</p>
        ) : videos.length === 0 ? (
          <p className="pixnovel-feed-copy">No shared videos yet.</p>
        ) : (
          <div className="whisk-video-grid">
            {videos.map((video) => {
              const showPreview = activeVideoKey === video.key && video.url;
              return (
                <div key={video.key} className="whisk-video-card">
                  <div className="whisk-video-frame">
                    {showPreview ? (
                      <video
                        className="whisk-video-player"
                        controls
                        preload="metadata"
                        src={video.url}
                      />
                    ) : video.posterUrl ? (
                      <img
                        className="whisk-video-poster"
                        src={video.posterUrl}
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
                        onClick={() =>
                          setActiveVideoKey((previous) =>
                            previous === video.key ? "" : video.key
                          )
                        }
                        aria-label={VIDEO_PREVIEW_ICON_LABEL}
                      >
                        {showPreview ? "⏸" : "▶"}
                      </button>
                    </div>
                  </div>
                  <div className="whisk-video-meta-row">
                    {toDisplayLabel(video.key)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error ? <div className="whisk-error-panel">{error}</div> : null}

      {lightboxImage ? (
        <div className="whisk-lightbox" onClick={() => setLightboxImage(null)}>
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
            alt={lightboxImage.key || "Shared image"}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </section>
  );
}

export default SharedLibrary;
