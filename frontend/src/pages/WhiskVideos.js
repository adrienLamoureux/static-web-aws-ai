import React, { useState } from "react";
import { useWhiskVideos } from "./whisk/hooks/useWhiskVideos";

const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const VIDEO_CACHE_KEY = "whisk_videos_cache";

function WhiskVideos({ apiBaseUrl = "" }) {
  const [error, setError] = useState("");
  const resolvedApiBaseUrl = apiBaseUrl || process.env.REACT_APP_API_URL || "";

  const { videos, videoUrls, loadingVideoKey, removeVideo, toggleVideoPreview } =
    useWhiskVideos({
      apiBaseUrl: resolvedApiBaseUrl,
      cacheKey: VIDEO_CACHE_KEY,
      cacheMaxAge: CACHE_MAX_AGE_MS,
      onError: setError,
    });

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
      {error && <div className="whisk-error-panel">{error}</div>}
    </section>
  );
}

export default WhiskVideos;
