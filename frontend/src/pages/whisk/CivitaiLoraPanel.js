import React from 'react';

/**
 * Panel for selecting/configuring CivitAI LoRAs in two modes:
 *   - profile: pick a saved LoRA profile
 *   - quick: search the catalog and add runtime LoRAs with per-LoRA strength sliders
 *
 * Props:
 *   imageGenerationProps   — civitai-related fields from useImageStudio's imageGenerationProps
 *   loraProfiles           — list of saved LoRA profile objects
 *   selectedLoraProfileId  — currently selected profile ID string
 *   onLoraProfileChange    — (id: string) => void
 */
export default function CivitaiLoraPanel({ imageGenerationProps, loraProfiles, selectedLoraProfileId, onLoraProfileChange }) {
  const {
    civitaiLoraMode,
    onCivitaiLoraModeChange,
    civitaiCatalogQuery,
    onCivitaiCatalogQueryChange,
    civitaiCatalogResults,
    civitaiRuntimeLoras,
    onAddCivitaiRuntimeLora,
    onRemoveCivitaiRuntimeLora,
    onCivitaiRuntimeLoraStrengthChange,
    civitaiRuntimeLoraLimit,
  } = imageGenerationProps;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className={civitaiLoraMode === 'profile' ? 'skr-btn-primary' : 'skr-btn-secondary'}
          style={{ fontSize: 12, flex: 1 }}
          onClick={() => onCivitaiLoraModeChange('profile')}
        >
          Profile
        </button>
        <button
          className={civitaiLoraMode === 'quick' ? 'skr-btn-primary' : 'skr-btn-secondary'}
          style={{ fontSize: 12, flex: 1 }}
          onClick={() => onCivitaiLoraModeChange('quick')}
        >
          Quick Mode
        </button>
      </div>

      {civitaiLoraMode === 'profile' ? (
        <div>
          <label className="skr-field-label">LoRA Profile</label>
          <select className="skr-field-select" value={selectedLoraProfileId} onChange={e => onLoraProfileChange(e.target.value)}>
            <option value="">— None —</option>
            {loraProfiles.map(p => (
              <option key={p.id || p.characterId} value={p.id || p.characterId}>{p.name || p.displayName || p.id || p.characterId}</option>
            ))}
          </select>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Catalog search */}
          <div>
            <label className="skr-field-label">Search CivitAI catalog</label>
            <input
              className="skr-input"
              placeholder="e.g. frieren, outfit, style…"
              value={civitaiCatalogQuery}
              onChange={e => onCivitaiCatalogQueryChange(e.target.value)}
              style={{ fontSize: 12 }}
            />
          </div>
          {/* Catalog results */}
          {(civitaiCatalogResults || []).length > 0 && (
            <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {civitaiCatalogResults.map(entry => {
                const already = (civitaiRuntimeLoras || []).some(r => r.catalogId === entry.catalogId);
                const atLimit = (civitaiRuntimeLoras || []).length >= (civitaiRuntimeLoraLimit || 9);
                return (
                  <div key={entry.catalogId} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 8px', background: 'var(--skr-surface)', borderRadius: 6, fontSize: 12,
                  }}>
                    <div>
                      <span style={{ fontWeight: 600, color: 'var(--skr-text-primary)' }}>{entry.name || entry.catalogId}</span>
                      {entry.baseModel && <span style={{ marginLeft: 6, color: 'var(--skr-text-tertiary)', fontSize: 11 }}>{entry.baseModel}</span>}
                    </div>
                    <button
                      className="skr-btn-secondary"
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => onAddCivitaiRuntimeLora(entry)}
                      disabled={already || atLimit}
                    >
                      {already ? '✓' : '+'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {/* Active runtime LoRAs */}
          {(civitaiRuntimeLoras || []).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ fontSize: 11, color: 'var(--skr-text-tertiary)', margin: 0 }}>Active LoRAs ({civitaiRuntimeLoras.length}/{civitaiRuntimeLoraLimit || 9})</p>
              {civitaiRuntimeLoras.map(lora => (
                <div key={lora.catalogId} style={{ background: 'var(--skr-surface)', borderRadius: 6, padding: '6px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--skr-text-primary)' }}>{lora.name || lora.catalogId}</span>
                    <button
                      onClick={() => onRemoveCivitaiRuntimeLora(lora.catalogId)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--skr-text-tertiary)', fontSize: 14 }}
                    >✕</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="range" min={0} max={2} step={0.05}
                      value={lora.strength ?? 0.8}
                      onChange={e => onCivitaiRuntimeLoraStrengthChange(lora.catalogId, parseFloat(e.target.value))}
                      className="skr-strength-slider"
                      style={{ flex: 1 }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--skr-text-secondary)', minWidth: 30 }}>{(lora.strength ?? 0.8).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
