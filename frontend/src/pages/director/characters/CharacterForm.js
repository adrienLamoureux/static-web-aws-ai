import React, { useMemo } from 'react';
import { buildPromptPreview } from './character-form-utils';

function FieldLabel({ label, optional }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--skr-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
      {label}{optional && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> (optional)</span>}
    </div>
  );
}

function ModelSelect({ value, onChange, models, placeholder = '— Default —' }) {
  return (
    <select className="skr-input skr-field-select" style={{ fontSize: 12, width: '100%' }} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {models.map(m => <option key={m.key} value={m.key}>{m.name || m.label || m.key}</option>)}
    </select>
  );
}

/**
 * CharacterForm — edit/create character form.
 * Props: { charForm, onFieldChange, onSave, onCancel, saving, imageModels, videoModels }
 */
export default function CharacterForm({ charForm, onFieldChange, onSave, onCancel, saving, imageModels, videoModels }) {
  const promptPreview = useMemo(() => buildPromptPreview(charForm), [charForm]);

  return (
    <div className="skr-card" style={{ padding: 20, marginBottom: 12, border: '2px solid var(--skr-accent, #d97706)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--skr-text-primary)', margin: 0 }}>
          {charForm?._id ? 'Edit Character' : 'New Character'}
        </p>
        <button className="skr-btn-secondary" style={{ fontSize: 11 }} onClick={onCancel}>Cancel</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel label="Name" />
          <input className="skr-input" style={{ fontSize: 12, width: '100%' }} value={charForm?.name || ''} onChange={e => onFieldChange('name', e.target.value)} placeholder="e.g. Aria Starfall" />
        </div>
        <div>
          <FieldLabel label="Default Image Model" optional />
          <ModelSelect value={charForm?.defaultImageModel || ''} onChange={v => onFieldChange('defaultImageModel', v)} models={imageModels} />
        </div>
        <div>
          <FieldLabel label="Default Video Model" optional />
          <ModelSelect value={charForm?.defaultVideoModel || ''} onChange={v => onFieldChange('defaultVideoModel', v)} models={videoModels} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel label="Default Image Prompt" optional />
          <textarea className="skr-input" style={{ fontSize: 12, width: '100%', resize: 'vertical', minHeight: 56 }} value={charForm?.defaultImagePrompt || ''} onChange={e => onFieldChange('defaultImagePrompt', e.target.value)} placeholder="Base positive prompt for image generation…" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel label="Default Video Prompt" optional />
          <textarea className="skr-input" style={{ fontSize: 12, width: '100%', resize: 'vertical', minHeight: 56 }} value={charForm?.defaultVideoPrompt || ''} onChange={e => onFieldChange('defaultVideoPrompt', e.target.value)} placeholder="Base positive prompt for video generation…" />
        </div>
        <div>
          <FieldLabel label="Signature Traits" optional />
          <input className="skr-input" style={{ fontSize: 12, width: '100%' }} value={charForm?.signatureTraits || ''} onChange={e => onFieldChange('signatureTraits', e.target.value)} placeholder="e.g. slender, confident posture" />
        </div>
        <div>
          <FieldLabel label="Eye Details" optional />
          <input className="skr-input" style={{ fontSize: 12, width: '100%' }} value={charForm?.eyeDetails || ''} onChange={e => onFieldChange('eyeDetails', e.target.value)} placeholder="e.g. violet heterochromia eyes" />
        </div>
        <div>
          <FieldLabel label="Hair Details" optional />
          <input className="skr-input" style={{ fontSize: 12, width: '100%' }} value={charForm?.hairDetails || ''} onChange={e => onFieldChange('hairDetails', e.target.value)} placeholder="e.g. long silver wavy hair" />
        </div>
        <div>
          <FieldLabel label="Outfit / Materials" optional />
          <input className="skr-input" style={{ fontSize: 12, width: '100%' }} value={charForm?.outfitMaterials || ''} onChange={e => onFieldChange('outfitMaterials', e.target.value)} placeholder="e.g. flowing white mage robes" />
        </div>
        <div>
          <FieldLabel label="Accessories" optional />
          <input className="skr-input" style={{ fontSize: 12, width: '100%' }} value={charForm?.accessories || ''} onChange={e => onFieldChange('accessories', e.target.value)} placeholder="e.g. ornate staff, small pouch" />
        </div>
        <div>
          <FieldLabel label="Style Reference" optional />
          <input className="skr-input" style={{ fontSize: 12, width: '100%' }} value={charForm?.styleReference || ''} onChange={e => onFieldChange('styleReference', e.target.value)} placeholder="e.g. anime style, cel shaded" />
        </div>
        {promptPreview && (
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldLabel label="Assembled Prompt Preview" />
            <textarea readOnly className="skr-input" style={{ fontSize: 11, width: '100%', resize: 'none', minHeight: 48, color: 'var(--skr-text-tertiary)', fontFamily: 'monospace' }} value={promptPreview} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="skr-btn-primary" style={{ fontSize: 12 }} onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : (charForm?._id ? 'Update Character' : 'Create Character')}
        </button>
        <button className="skr-btn-secondary" style={{ fontSize: 12 }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
