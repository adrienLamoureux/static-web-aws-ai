import React, { useState, useEffect, useCallback, useMemo } from 'react';
import SolarisMasonry from '../components/SolarisMasonry';
import SolarisImageWall from '../components/shared/SolarisImageWall';
import { useConfig } from '../contexts/ConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { listDirectorMasonryImages } from '../services/operations';
import { listSharedImages, listSharedVideos, listSharedImageFavorites, setSharedImageFavorite } from '../services/s3';

export default function HomePage() {
  const { apiBaseUrl } = useConfig();
  const { isAuthenticated } = useAuth();

  // Hero
  const [masonryApiImages, setMasonryApiImages] = useState([]);

  // Gallery — images
  const [images, setImages]               = useState([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [search, setSearch]               = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  // Gallery — videos
  const [videos, setVideos]               = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [playingVideoKey, setPlayingVideoKey] = useState('');

  useEffect(() => {
    if (!apiBaseUrl) return;
    listDirectorMasonryImages(apiBaseUrl)
      .then(data => {
        const items = (Array.isArray(data?.images) ? data.images : [])
          .map((item, i) => ({ id: item?.key || `m${i}`, src: item?.url || '' }))
          .filter(x => x.src);
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
        setImages((imgData.images || []).map(img => ({
          ...img,
          favorite: img.favorite || favoriteKeys.has(img.key),
        })));
      })
      .catch(() => setImages([]))
      .finally(() => setLoadingImages(false));
  }, [apiBaseUrl, isAuthenticated]);

  useEffect(() => {
    if (!apiBaseUrl) return;
    setLoadingVideos(true);
    listSharedVideos(apiBaseUrl)
      .then(data => setVideos(data.videos || []))
      .catch(() => setVideos([]))
      .finally(() => setLoadingVideos(false));
  }, [apiBaseUrl]);

  const filtered = useMemo(() => images.filter(img => {
    if (favoritesOnly && !img.favorite) return false;
    if (search && !(img.prompt || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [images, favoritesOnly, search]);

  const masonryImages = useMemo(() => masonryApiImages, [masonryApiImages]);

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
      {/* Animated masonry hero */}
      <SolarisMasonry
        images={masonryImages}
        title="Whisk Studio"
        subtitle="Anime-first creative workspace — generate, direct, tell stories."
      />

      {/* Gallery — shared images */}
      <div style={{ marginTop: 32 }}>
        <div className="skr-page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h2 className="skr-page-title">Shared Images</h2>
            <p className="skr-page-subtitle">Community shared images</p>
          </div>
          <input
            className="skr-input"
            style={{ width: 180 }}
            placeholder="Search by prompt…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            className={favoritesOnly ? 'skr-btn-primary' : 'skr-btn-secondary'}
            onClick={() => setFavoritesOnly(v => !v)}
            title="Show favorites only"
          >
            ★ Favorites
          </button>
        </div>

        {loadingImages ? (
          <div className="skr-masonry">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="skr-card skr-placeholder" style={{ aspectRatio: i % 3 === 0 ? '3/4' : i % 3 === 1 ? '1/1' : '4/3' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="skr-card" style={{ textAlign: 'center', padding: 40, color: 'var(--skr-text-tertiary)' }}>
            {favoritesOnly ? 'No favorite images yet.' : 'No shared images yet.'}
          </div>
        ) : (
          <SolarisImageWall
            images={filtered}
            onOpenLightbox={setLightboxImage}
            onToggleFavorite={handleFavorite}
            canLoadMore={false}
            totalCount={filtered.length}
          />
        )}
      </div>

      {lightboxImage && (
        <div className="skr-lightbox" onClick={() => setLightboxImage(null)}>
          <button className="skr-lightbox-close" onClick={() => setLightboxImage(null)}>✕</button>
          <img src={lightboxImage.url} alt={lightboxImage.prompt || ''} onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Gallery — shared videos */}
      <div className="skr-page-header" style={{ marginTop: 32 }}>
        <h2 className="skr-page-title">Shared Videos</h2>
        <p className="skr-page-subtitle">Community shared video clips</p>
      </div>

      {loadingVideos ? (
        <div className="skr-masonry">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skr-card skr-placeholder" style={{ aspectRatio: '16/9' }} />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="skr-card" style={{ textAlign: 'center', padding: 40, color: 'var(--skr-text-tertiary)' }}>
          No shared videos yet.
        </div>
      ) : (
        <div className="skr-masonry">
          {videos.map((video, i) => {
            const isPlaying = playingVideoKey === video.key;
            return (
              <div key={video.key || i} className="skr-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ position: 'relative', aspectRatio: '16/9', background: 'var(--skr-elevated)' }}>
                  {isPlaying && video.url ? (
                    <video src={video.url} controls autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : video.posterUrl ? (
                    <img src={video.posterUrl} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--skr-text-tertiary)', fontSize: 13 }}>
                      No preview
                    </div>
                  )}
                  <div style={{ position: 'absolute', top: 8, right: 8 }}>
                    <button className="skr-icon-btn" onClick={() => toggleVideoPlay(video)} title={isPlaying ? 'Stop' : 'Play'}>
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
