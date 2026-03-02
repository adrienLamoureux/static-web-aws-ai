import React, { useState } from "react";
import { useWhiskVideos } from "./whisk/hooks/useWhiskVideos";
import { shareVideo } from "../services/s3";

const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const VIDEO_CACHE_KEY = "whisk_videos_cache";

function WhiskVideos({ apiBaseUrl = "" }) {
  const [error, setError] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [sharingVideoKey, setSharingVideoKey] = useState("");
  const resolvedApiBaseUrl = apiBaseUrl || process.env.REACT_APP_API_URL || "";

  const { videos, videoUrls, loadingVideoKey, removeVideo, toggleVideoPreview } =
    useWhiskVideos({
      apiBaseUrl: resolvedApiBaseUrl,
      cacheKey: VIDEO_CACHE_KEY,
      cacheMaxAge: CACHE_MAX_AGE_MS,
      onError: setError,
    });

  const handleShareVideo = async (video) => {
    if (!video?.key || !resolvedApiBaseUrl) return;
    setError("");
    setShareStatus("");
    setSharingVideoKey(video.key);
    try {
      await shareVideo(resolvedApiBaseUrl, video.key);
      setShareStatus("Video shared to the library.");
    } catch (shareError) {
      setError(shareError?.message || "Failed to share video.");
    } finally {
      setSharingVideoKey("");
    }
  };

  return (
    <section className="whisk-page whisk-videos-page">
      <div className="whisk-videos">
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
                        aria-label={url ? "Hide video preview" : "Load video preview"}
                      >
                        {isLoading ? "…" : url ? "⏸" : "▶"}
                      </button>
                      <button
                        type="button"
                        className="whisk-icon-button"
                        onClick={() => handleShareVideo(video)}
                        disabled={sharingVideoKey === video.key}
                        aria-label="Share video to library"
                      >
                        {sharingVideoKey === video.key ? (
                          "…"
                        ) : (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
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
      {shareStatus && <div className="whisk-share-status">{shareStatus}</div>}
      {error && <div className="whisk-error-panel">{error}</div>}
    </section>
  );
}

export default WhiskVideos;
