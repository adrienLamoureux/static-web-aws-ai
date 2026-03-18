import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import SolarisMasonry from '../components/SolarisMasonry';
import { useConfig } from '../contexts/ConfigContext';
import { listDirectorMasonryImages } from '../services/operations';
import { listSharedImages } from '../services/s3';

const NAV_CARDS = [
  {
    label: 'Whisk',
    path: '/whisk',
    description: 'Generate images from prompts and characters.',
    emoji: '✦',
  },
  {
    label: 'Story',
    path: '/story',
    description: 'Write interactive illustrated stories.',
    emoji: '📖',
  },
  {
    label: 'Videos',
    path: '/videos',
    description: 'Animate images into short video clips.',
    emoji: '🎬',
  },
  {
    label: 'LoRA',
    path: '/lora',
    description: 'Manage LoRA profiles for each character.',
    emoji: '⚙',
  },
  {
    label: 'Shared',
    path: '/shared',
    description: 'Browse the community image and video gallery.',
    emoji: '🖼',
  },
];

export default function HomePage() {
  const { apiBaseUrl } = useConfig();
  const [masonryApiImages, setMasonryApiImages] = useState([]);
  const [recentImages, setRecentImages] = useState([]);

  // Fetch masonry portrait images for the hero
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

  // Fetch recent shared images for the activity strip (non-blocking)
  useEffect(() => {
    if (!apiBaseUrl) return;
    listSharedImages(apiBaseUrl)
      .then(data => {
        const imgs = (data?.images || []).slice(0, 4);
        setRecentImages(imgs);
      })
      .catch(() => setRecentImages([]));
  }, [apiBaseUrl]);

  const masonryImages = useMemo(() => masonryApiImages, [masonryApiImages]);

  return (
    <div>
      {/* Animated masonry hero */}
      <SolarisMasonry
        images={masonryImages}
        title="Whisk Studio"
        subtitle="Anime-first creative workspace — generate, direct, tell stories."
      />

      {/* Navigation cards */}
      <div style={{ padding: '28px 0 8px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
          {NAV_CARDS.map(card => (
            <Link
              key={card.path}
              to={card.path}
              style={{ textDecoration: 'none' }}
            >
              <div
                className="sol-card"
                style={{
                  padding: '18px 16px',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.18)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '';
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1 }}>{card.emoji}</span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--sol-text-primary)' }}>
                    {card.label}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--sol-accent, var(--sol-text-tertiary))' }}>→</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--sol-text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  {card.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent activity strip (only shown when images are available) */}
      {recentImages.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sol-text-tertiary)' }}>
              Recently generated
            </span>
            <Link
              to="/shared"
              style={{ fontSize: 12, color: 'var(--sol-text-secondary)', textDecoration: 'none' }}
            >
              View all →
            </Link>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
            }}
          >
            {recentImages.map((img, i) => (
              <Link key={img.key || i} to="/shared" style={{ textDecoration: 'none' }}>
                <div
                  className="sol-card"
                  style={{
                    padding: 0,
                    overflow: 'hidden',
                    aspectRatio: '3/4',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  <img
                    src={img.url}
                    alt={img.prompt || ''}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
