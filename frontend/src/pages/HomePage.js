import React, { useState, useEffect, useCallback, useMemo } from "react";
import SolarisMasonry from "../components/SolarisMasonry";
import GalleryCard from "../components/shared/GalleryCard";
import { useConfig } from "../contexts/ConfigContext";
import { useAuth } from "../contexts/AuthContext";
import { listDirectorMasonryImages } from "../services/operations";
import {
  listSharedImages,
  listSharedVideos,
  listSharedImageFavorites,
  setSharedImageFavorite,
} from "../services/s3";

const FEED_TABS = [
  { id: "all", label: "For You", icon: "✦" },
  { id: "latest", label: "Latest", icon: "🕐" },
  { id: "favorites", label: "Favorites", icon: "♥" },
];

export default function HomePage() {
  const { apiBaseUrl } = useConfig();
  const { isAuthenticated } = useAuth();
  // Hero
  const [masonryApiImages, setMasonryApiImages] = useState([]);

  // Gallery — images
  const [images, setImages] = useState([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [lightboxImage, setLightboxImage] = useState(null);

  // Gallery — videos
  const [videos, setVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [playingVideoKey, setPlayingVideoKey] = useState("");

  useEffect(() => {
    if (!apiBaseUrl) return;
    listDirectorMasonryImages(apiBaseUrl)
      .then((data) => {
        const items = (Array.isArray(data?.images) ? data.images : [])
          .map((item, i) => ({ id: item?.key || `m${i}`, src: item?.url || "" }))
          .filter((x) => x.src);
        setMasonryApiImages(items);
      })
      .catch(() => setMasonryApiImages([]));
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!apiBaseUrl) return;
    setLoadingImages(true);
    Promise.all([
      listSharedImages(apiBaseUrl),
      isAuthenticated
        ? listSharedImageFavorites(apiBaseUrl).catch(() => ({ keys: [] }))
        : Promise.resolve({ keys: [] }),
    ])
      .then(([imgData, favData]) => {
        const favoriteKeys = new Set(favData?.keys || []);
        setImages(
          (imgData.images || []).map((img) => ({
            ...img,
            favorite: img.favorite || favoriteKeys.has(img.key),
          }))
        );
      })
      .catch(() => setImages([]))
      .finally(() => setLoadingImages(false));
  }, [apiBaseUrl, isAuthenticated]);

  useEffect(() => {
    if (!apiBaseUrl) return;
    setLoadingVideos(true);
    listSharedVideos(apiBaseUrl)
      .then((data) => setVideos(data.videos || []))
      .catch(() => setVideos([]))
      .finally(() => setLoadingVideos(false));
  }, [apiBaseUrl]);

  const filtered = useMemo(() => {
    let result = images;
    if (activeTab === "latest") result = [...images].reverse();
    if (activeTab === "favorites") result = images.filter((img) => img.favorite);
    return result;
  }, [images, activeTab]);

  const handleFavorite = useCallback(
    (image) => {
      if (!apiBaseUrl) return;
      const newFav = !image.favorite;
      setImages((prev) =>
        prev.map((img) => (img.key === image.key ? { ...img, favorite: newFav } : img))
      );
      setSharedImageFavorite(apiBaseUrl, image.key, newFav).catch(() => {
        setImages((prev) =>
          prev.map((img) => (img.key === image.key ? { ...img, favorite: !newFav } : img))
        );
      });
    },
    [apiBaseUrl]
  );

  const toggleVideoPlay = (video) => {
    setPlayingVideoKey((prev) => (prev === video.key ? "" : video.key));
  };

  return (
    <div>
      {/* Masonry hero */}
      <SolarisMasonry
        images={masonryApiImages}
        title="Whisk Studio"
        subtitle="Anime-first creative workspace — generate, direct, tell stories."
      />

      {/* Shared Images */}
      <div style={{ marginTop: 8 }}>
        <div className="skr-page-header" style={{ marginBottom: 12 }}>
          <h2 className="skr-page-title">Gallery</h2>
          <p className="skr-page-subtitle">Community shared images</p>
        </div>

        {/* Filter tabs */}
        <div className="skr-feed-tabs">
          {FEED_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`skr-feed-tab${activeTab === tab.id ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {loadingImages ? (
          <div className="skr-feed-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="skr-card skr-placeholder"
                style={{ aspectRatio: "3/4", borderRadius: 12 }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="skr-card"
            style={{ textAlign: "center", padding: 40, color: "var(--skr-text-tertiary)" }}
          >
            {activeTab === "favorites" ? "No favorite images yet." : "No shared images yet."}
          </div>
        ) : (
          <div className="skr-feed-grid">
            {filtered.map((image, i) => (
              <GalleryCard
                key={image.key || i}
                image={image}
                onOpenLightbox={setLightboxImage}
                onToggleFavorite={isAuthenticated ? handleFavorite : null}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
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

      {/* Shared videos */}
      <div className="skr-page-header" style={{ marginTop: 40 }}>
        <h2 className="skr-page-title">Videos</h2>
        <p className="skr-page-subtitle">Community shared video clips</p>
      </div>

      {loadingVideos ? (
        <div className="skr-masonry">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skr-card skr-placeholder" style={{ aspectRatio: "16/9" }} />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div
          className="skr-card"
          style={{ textAlign: "center", padding: 40, color: "var(--skr-text-tertiary)" }}
        >
          No shared videos yet.
        </div>
      ) : (
        <div className="skr-masonry">
          {videos.map((video, i) => {
            const isPlaying = playingVideoKey === video.key;
            return (
              <div
                key={video.key || i}
                className="skr-card"
                style={{ padding: 0, overflow: "hidden" }}
              >
                <div
                  style={{
                    position: "relative",
                    aspectRatio: "16/9",
                    background: "var(--skr-elevated)",
                  }}
                >
                  {isPlaying && video.url ? (
                    <video
                      src={video.url}
                      controls
                      autoPlay
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : video.posterUrl ? (
                    <img
                      src={video.posterUrl}
                      alt=""
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--skr-text-tertiary)",
                        fontSize: 13,
                      }}
                    >
                      No preview
                    </div>
                  )}
                  <div style={{ position: "absolute", top: 8, right: 8 }}>
                    <button
                      className="skr-icon-btn"
                      onClick={() => toggleVideoPlay(video)}
                      title={isPlaying ? "Stop" : "Play"}
                    >
                      {isPlaying ? "⏸" : "▶"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
