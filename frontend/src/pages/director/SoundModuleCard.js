import React from 'react';
import { normalizeDirectorSoundMetadata } from '../../services/operations';
import { useNotify } from '../../components/sakura/NotificationStack';

/**
 * SoundModuleCard
 * Props: { soundModule, isLoading, apiBaseUrl, onRefresh }
 */
export default function SoundModuleCard({ soundModule, isLoading, apiBaseUrl, onRefresh }) {
  const notify = useNotify();
  const [normalizing, setNormalizing] = React.useState(false);

  const handleNormalize = async () => {
    if (!apiBaseUrl) return;
    setNormalizing(true);
    try {
      const result = await normalizeDirectorSoundMetadata(apiBaseUrl);
      notify(result?.message || 'Sound metadata normalized.', 'success');
      if (onRefresh) onRefresh();
    } catch (e) {
      notify(e?.message || 'Failed to normalize sound metadata.', 'error');
    } finally {
      setNormalizing(false);
    }
  };

  return (
    <div className="skr-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p className="skr-module-title" style={{ margin: 0 }}>Sound</p>
        <button
          className="skr-btn-secondary"
          style={{ fontSize: 11 }}
          onClick={handleNormalize}
          disabled={normalizing || isLoading}
        >
          {normalizing ? 'Normalizing…' : 'Normalize now'}
        </button>
      </div>
      {isLoading ? (
        <p style={{ fontSize: 12, color: 'var(--skr-text-tertiary)' }}>Loading…</p>
      ) : (
        <div className="skr-info-list">
          <div>Total tracks: <strong>{Number(soundModule?.totalTracks || 0)}</strong></div>
          <div>Needs metadata: <strong>{Number(soundModule?.tracksNeedingMetadata || 0)}</strong></div>
        </div>
      )}
    </div>
  );
}
