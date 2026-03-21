import React from 'react';

const formatAnimationStatus = (value = '', hasVideo = false) => {
  if (hasVideo) return 'Animation ready';
  const s = (value || '').toLowerCase();
  if (!s) return '';
  if (s === 'starting') return 'Animation queued…';
  if (s === 'processing') return 'Animation rendering…';
  if (s === 'failed') return 'Animation failed';
  if (s === 'canceled') return 'Animation canceled';
  return `Animation ${s}`;
};

const formatMusicStatus = (value = '', hasAudio = false) => {
  if (hasAudio) return 'Soundtrack ready';
  const s = (value || '').toLowerCase();
  if (!s) return '';
  if (s === 'starting') return 'Soundtrack queued…';
  if (s === 'processing') return 'Soundtrack rendering…';
  if (s === 'failed') return 'Soundtrack failed';
  if (s === 'canceled') return 'Soundtrack canceled';
  return `Soundtrack ${s}`;
};

/**
 * Scene illustration card with Animate + Music action buttons.
 * Follows Solaris design language.
 */
export default function StorySceneCard({
  scene,
  onIllustrate,
  onAnimate,
  onMusic,
  onPlayInDock,
  animating = false,
  generatingMusic = false,
}) {
  if (!scene) return null;

  const hasImage = Boolean(scene.imageUrl);
  const hasVideo = Boolean(scene.videoUrl);
  const hasAudio = Boolean(scene.musicUrl);
  const canAnimate = hasImage && !animating;
  const animStatusLabel = formatAnimationStatus(scene.videoStatus, hasVideo);
  const musicStatusLabel = formatMusicStatus(scene.musicStatus, hasAudio);

  return (
    <div style={{
      margin: '6px 0 10px 0',
      background: 'var(--yk-elevated)',
      border: '1px solid var(--yk-border)',
      borderRadius: 10,
      overflow: 'hidden',
      maxWidth: 420,
    }}>
      {/* Scene illustration */}
      {hasImage && (
        <img
          src={scene.imageUrl}
          alt={scene.title || 'Scene illustration'}
          style={{ width: '100%', display: 'block', maxHeight: 320, objectFit: 'cover' }}
        />
      )}

      {/* Video player */}
      {hasVideo && (
        <video
          controls
          preload="metadata"
          src={scene.videoUrl}
          style={{ width: '100%', display: 'block', maxHeight: 320 }}
        />
      )}

      {/* Actions bar */}
      <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {scene.title && (
          <span style={{ fontSize: 12, color: 'var(--yk-text-secondary)', flex: 1, fontStyle: 'italic', minWidth: 80 }}>
            {scene.title}
          </span>
        )}

        {/* Illustrate / Re-illustrate */}
        {!hasImage && !scene.illustrating && (
          <button
            className="yk-btn-secondary"
            style={{ fontSize: 11, padding: '3px 10px', whiteSpace: 'nowrap' }}
            onClick={onIllustrate}
          >
            🎨 Illustrate
          </button>
        )}
        {scene.illustrating && (
          <span style={{ fontSize: 11, color: 'var(--yk-text-tertiary)' }}>Generating…</span>
        )}
        {hasImage && (
          <button
            className="yk-btn-secondary"
            style={{ fontSize: 11, padding: '3px 10px', whiteSpace: 'nowrap' }}
            onClick={onIllustrate}
            title="Re-generate illustration"
          >
            ↺
          </button>
        )}

        {/* Animate (needs image) */}
        {hasImage && (
          <button
            className="yk-btn-secondary"
            style={{ fontSize: 11, padding: '3px 10px', whiteSpace: 'nowrap' }}
            onClick={onAnimate}
            disabled={!canAnimate}
            title="Generate animation from illustration"
          >
            {animating ? '🎬 Animating…' : '🎬 Animate'}
          </button>
        )}

        {/* Music: generate or play in dock */}
        {hasAudio ? (
          <button
            className="yk-btn-secondary"
            style={{ fontSize: 11, padding: '3px 10px', whiteSpace: 'nowrap' }}
            onClick={onPlayInDock}
            title="Play this scene's soundtrack in the music dock"
          >
            ▶ Play
          </button>
        ) : (
          <button
            className="yk-btn-secondary"
            style={{ fontSize: 11, padding: '3px 10px', whiteSpace: 'nowrap' }}
            onClick={onMusic}
            disabled={generatingMusic}
            title="Generate soundtrack for this scene"
          >
            {generatingMusic ? '🎵 Scoring…' : '🎵 Music'}
          </button>
        )}

        {scene.illustrationError && (
          <span style={{ fontSize: 11, color: '#ef4444' }}>{scene.illustrationError}</span>
        )}
      </div>

      {/* Status labels */}
      {(animStatusLabel || musicStatusLabel) && (
        <div style={{ padding: '0 12px 6px', display: 'flex', gap: 12 }}>
          {animStatusLabel && (
            <span style={{ fontSize: 10, color: 'var(--yk-text-tertiary)' }}>{animStatusLabel}</span>
          )}
          {musicStatusLabel && (
            <span style={{ fontSize: 10, color: 'var(--yk-text-tertiary)' }}>{musicStatusLabel}</span>
          )}
        </div>
      )}

      {/* Music is played exclusively through the global music dock */}
    </div>
  );
}
