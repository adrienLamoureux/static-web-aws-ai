import React, { useState, useEffect, useCallback } from 'react';
import { useConfig } from '../contexts/ConfigContext';
import { listSharedImages, listSharedVideos, listSharedImageFavorites, setSharedImageFavorite } from '../services/s3';

export default function SharedLibrary() {
  const { apiBaseUrl } = useConfig();
  const [images, setImages] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [search, setSearch] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [playingVideoKey, setPlayingVideoKey] = useState('');
  useEffect(() => {
    if (!apiBaseUrl) return;
    setLoadingImages(true);
    Promise.all([
      listSharedImages(apiBaseUrl),
      listSharedImageFavorites(apiBaseUrl).catch(() => ({ keys: [] })),
    ])
      .then(([imgData, favData]) => {
        const favoriteKeys = new Set(favData?.keys || []);
        const imgs = (imgData.images || []).map(img => ({
          ...img,
          favorite: img.favorite || favoriteKeys.has(img.key),
        }));
        setImages(imgs);
      })
      .catch(() => setImages([]))
      .finally(() => setLoadingImages(false));
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!apiBaseUrl) return;
    setLoadingVideos(true);
    listSharedVideos(apiBaseUrl)
      .then(data => setVideos(data.videos || []))
      .catch(() => setVideos([]))
      .finally(() => setLoadingVideos(false));
  }, [apiBaseUrl]);

  const filtered = images.filter(img => {
    if (favoritesOnly && !img.favorite) return false;
    if (search && !(img.prompt || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleFavorite = useCallback((image) => {
    if (!apiBaseUrl) return;
    const newFav = !image.favorite;
    setImages(prev => prev.map(img => img.key === image.key ? { ...img, favorite: newFav } : img));
    setSharedImageFavorite(apiBaseUrl, image.key, newFav).catch(() => {
      setImages(prev => prev.map(img => img.key === image.key ? { ...img, favorite: !newFav } : img));
    });
  }, [apiBaseUrl]);

  const toggleVideoPlay = (video) => {
    setPlayingVideoKey(prev => prev === video.key ? '' : video.key);
  };

  return (
    <div>
      {/* Header */}
      <div className="yk-page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h2 className="yk-page-title">Shared Images</h2>
          <p className="yk-page-subtitle">Community shared images and videos</p>
        </div>
        <input
          className="yk-input"
          style={{ width: 200 }}
          placeholder="Search by prompt…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button
          className={favoritesOnly ? 'yk-btn-primary' : 'yk-btn-secondary'}
          onClick={() => setFavoritesOnly(v => !v)}
          title="Show favorites only"
        >
          ★ Favorites
        </button>
      </div>

      {/* Shared images */}
      {loadingImages ? (
        <div className="yk-masonry">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="yk-card yk-placeholder" style={{ aspectRatio: i % 3 === 0 ? '3/4' : i % 3 === 1 ? '1/1' : '4/3' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="yk-card" style={{ textAlign: 'center', padding: 40, color: 'var(--yk-text-tertiary)' }}>
          {favoritesOnly ? 'No favorite images yet.' : 'No shared images yet.'}
        </div>
      ) : (
        <div className="yk-image-wall">
          {filtered.map(img => (
            <div key={img.key} style={{ cursor: 'pointer' }} onClick={() => setLightboxImage(img)}>
              <img src={img.url} alt={img.prompt || ''} loading="lazy" style={{ width: '100%', display: 'block' }} />
            </div>
          ))}
        </div>
      )}

      {lightboxImage && (
        <div className="yk-lightbox" onClick={() => setLightboxImage(null)}>
          <button className="yk-lightbox-close" onClick={() => setLightboxImage(null)}>✕</button>
          <img src={lightboxImage.url} alt={lightboxImage.prompt || ''} onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Shared videos section */}
      <div className="yk-page-header" style={{ marginTop: 32 }}>
        <h2 className="yk-page-title">Shared Videos</h2>
        <p className="yk-page-subtitle">Community shared video clips</p>
      </div>

      {loadingVideos ? (
        <div className="yk-masonry">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="yk-card yk-placeholder" style={{ aspectRatio: '16/9' }} />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="yk-card" style={{ textAlign: 'center', padding: 40, color: 'var(--yk-text-tertiary)' }}>
          No shared videos yet.
        </div>
      ) : (
        <div className="yk-masonry">
          {videos.map((video, i) => {
            const isPlaying = playingVideoKey === video.key;
            return (
              <div key={video.key || i} className="yk-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ position: 'relative', aspectRatio: '16/9', background: 'var(--yk-elevated)' }}>
                  {isPlaying && video.url ? (
                    <video
                      src={video.url}
                      controls
                      autoPlay
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : video.posterUrl ? (
                    <img
                      src={video.posterUrl}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--yk-text-tertiary)', fontSize: 13 }}>
                      No preview
                    </div>
                  )}
                  <div style={{ position: 'absolute', top: 8, right: 8 }}>
                    <button
                      className="yk-icon-btn"
                      onClick={() => toggleVideoPlay(video)}
                      title={isPlaying ? 'Stop' : 'Play'}
                    >
                      {isPlaying ? '⏸' : '▶'}
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
