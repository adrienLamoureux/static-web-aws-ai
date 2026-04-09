import React, { useState, useEffect } from 'react';
import { fetchFeatureFlags, saveFeatureFlags } from '../../services/operations';
import { useNotify } from '../../components/sakura/NotificationStack';

const FLAG_LABELS = {
  enableStoryAnimations: { label: 'Story Animations', description: 'Allow scene animation generation in Chronicle' },
  enableCivitaiSync: { label: 'CivitAI Sync', description: 'Allow syncing LoRA models from CivitAI' },
  enableNovaReelVideos: { label: 'Nova Reel Videos', description: 'Allow Bedrock Nova Reel video generation' },
  enableCompanionInitiative: { label: 'Companion Initiative', description: 'Companion proactively starts conversations' },
};

/**
 * FeatureFlagsSection — toggle feature flags.
 * Props: { apiBaseUrl }
 */
export default function FeatureFlagsSection({ apiBaseUrl }) {
  const notify = useNotify();
  const [flags, setFlags] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!apiBaseUrl) { setIsLoading(false); return; }
    setIsLoading(true);
    fetchFeatureFlags(apiBaseUrl)
      .then(data => setFlags(data?.flags || data || {}))
      .catch(e => notify(e?.message || 'Failed to load feature flags.', 'error'))
      .finally(() => setIsLoading(false));
  }, [apiBaseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = async (key) => {
    const updatedFlags = { ...flags, [key]: !flags[key] };
    setFlags(updatedFlags);
    try {
      await saveFeatureFlags(apiBaseUrl, { flags: updatedFlags });
      notify(`${FLAG_LABELS[key]?.label || key} ${updatedFlags[key] ? 'enabled' : 'disabled'}.`, 'success');
    } catch (e) {
      // Revert on failure
      setFlags(flags);
      notify(e?.message || 'Failed to save feature flags.', 'error');
    }
  };

  if (isLoading) return null;

  return (
    <div className="skr-card" style={{ padding: 20, marginBottom: 16 }}>
      <p className="skr-module-title">Feature Flags</p>
      {Object.entries(FLAG_LABELS).map(([key, { label, description }]) => (
        <div key={key} className="skr-flag-row">
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--skr-text-primary)', margin: 0 }}>{label}</p>
            <p style={{ fontSize: 11, color: 'var(--skr-text-tertiary)', margin: '2px 0 0' }}>{description}</p>
          </div>
          <button
            className={`skr-flag-toggle ${flags[key] ? 'on' : 'off'}`}
            onClick={() => handleToggle(key)}
            aria-label={`Toggle ${label}`}
          />
        </div>
      ))}
    </div>
  );
}
