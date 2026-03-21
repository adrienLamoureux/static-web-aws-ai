import React, { useState } from 'react';
import { useConfig } from '../contexts/ConfigContext';
import { useWhiskVideos } from './whisk/hooks/useWhiskVideos';
import { shareVideo } from '../services/s3';

export default function WhiskVideos() {
  const { apiBaseUrl } = useConfig();
  const [error, setError] = useState('');
  const [sharingVideoKey, setSharingVideoKey] = useState('');
  const [shareNotice, setShareNotice] = useState('');

  const {
    videos,
    videoUrls,
    loadingVideoKey,
    removeVideo,
    toggleVideoPreview,
    toggleVideoFavorite,
  } = useWhiskVideos({
    apiBaseUrl,
    cacheKey: 'whisk_videos_cache',
    cacheMaxAge: 5 * 60 * 1000,
    onError: setError,
  });

  const handleShare = async (video) => {
    if (!video?.key || !apiBaseUrl) return;
    setError('');
    setShareNotice('');
    setSharingVideoKey(video.key);
    try {
      await shareVideo(apiBaseUrl, video.key);
      setShareNotice('Video shared to the library.');
      setTimeout(() => setShareNotice(''), 3000);
    } catch (e) {
      setError(e?.message || 'Failed to share video.');
    } finally {
      setSharingVideoKey('');
    }
  };

  return (
    <div>
      {error && <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>{error}</p>}
      {shareNotice && <p style={{ fontSize: 12, color: 'var(--kit-accent)', marginBottom: 12 }}>{shareNotice}</p>}

      {videos.length === 0 ? (
        <div className="kit-card" style={{ textAlign: 'center', padding: 40, color: 'var(--kit-text-tertiary)' }}>
          No videos yet. Generate a video from the Whisk page.
        </div>
      ) : (
        <div className="kit-masonry">
          {videos.map((video) => {
            const url = videoUrls[video.key];
            const isLoading = loadingVideoKey === video.key;
            return (
              <div key={video.key} className="kit-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ position: 'relative', aspectRatio: '16/9', background: 'var(--kit-elevated)' }}>
                  {url ? (
                    <video
                      src={url}
                      controls
                      preload="metadata"
                      style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
                    />
                  ) : video.posterUrl ? (
                    <img
                      src={video.posterUrl}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--kit-text-tertiary)', fontSize: 13 }}>
                      No preview
                    </div>
                  )}
                  <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                    <button
                      className="kit-icon-btn"
                      onClick={() => toggleVideoPreview(video)}
                      disabled={isLoading}
                      aria-label={url ? 'Hide preview' : 'Load preview'}
                      title={url ? 'Hide preview' : 'Load preview'}
                    >
                      {isLoading ? '…' : url ? '⏸' : '▶'}
                    </button>
                    <button
                      className="kit-icon-btn"
                      onClick={() => handleShare(video)}
                      disabled={sharingVideoKey === video.key}
                      aria-label="Share to library"
                      title="Share to library"
                    >
                      {sharingVideoKey === video.key ? '…' : '↗'}
                    </button>
                    <button
                      className={`kit-icon-btn${video.favorite ? ' is-favorite' : ''}`}
                      onClick={() => toggleVideoFavorite(video)}
                      aria-label={video.favorite ? 'Remove from favorites' : 'Add to favorites'}
                      title={video.favorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      ♥
                    </button>
                    <button
                      className="kit-icon-btn"
                      onClick={() => removeVideo(video)}
                      aria-label="Delete video"
                      title="Delete video"
                      style={{ color: '#ef4444' }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {video.prompt && (
                  <p style={{ fontSize: 12, color: 'var(--kit-text-secondary)', padding: '8px 12px', margin: 0 }}>
                    {video.prompt}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
