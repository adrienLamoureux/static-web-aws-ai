import React, { useState, useEffect, useMemo } from 'react';
import { listCharacters, createCharacter, updateCharacter, deleteCharacter } from '../../services/characters';

// ─────────────────────────────────────────────────────────────────────────────
// CharactersSection — Character identity CRUD
// LoRA profiles for each character are managed in the LoRA Management page.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props:
 *   apiBaseUrl   – string
 *   imageModels  – array of { key, name } from overview options
 *   videoModels  – array of { key, name } from overview options
 */
export default function CharactersSection({ apiBaseUrl, imageModels = [], videoModels = [] }) {
  const [characters, setCharacters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Which character card is expanded (shows read-only detail + edit form)
  const [expandedCharId, setExpandedCharId] = useState(null);

  // Character form: null = closed; object = { _id (null=new|charId=edit), name, ... }
  const [charForm, setCharForm] = useState(null);
  const [savingChar, setSavingChar] = useState(false);
  const [deletingCharId, setDeletingCharId] = useState('');

  // ── helpers ──────────────────────────────────────────────────────────────

  const emptyCharForm = () => ({
    _id: null,
    name: '', defaultImageModel: '', defaultImagePrompt: '',
    defaultVideoModel: '', defaultVideoPrompt: '',
    signatureTraits: '', eyeDetails: '', hairDetails: '',
    outfitMaterials: '', accessories: '', styleReference: '',
  });

  const charToForm = (char) => ({
    _id: char.id,
    name: char.name || '',
    defaultImageModel: char.defaultImageModel || '',
    defaultImagePrompt: char.defaultImagePrompt || '',
    defaultVideoModel: char.defaultVideoModel || '',
    defaultVideoPrompt: char.defaultVideoPrompt || '',
    signatureTraits: char.signatureTraits || '',
    eyeDetails: char.eyeDetails || '',
    hairDetails: char.hairDetails || '',
    outfitMaterials: char.outfitMaterials || '',
    accessories: char.accessories || '',
    styleReference: char.styleReference || '',
  });

  const setMsg = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 4000); };

  // ── load characters ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!apiBaseUrl) { setIsLoading(false); return; }
    setIsLoading(true);
    listCharacters(apiBaseUrl)
      .then(data => setCharacters(data?.characters || []))
      .catch(e => setError(e?.message || 'Failed to load characters.'))
      .finally(() => setIsLoading(false));
  }, [apiBaseUrl]);

  // ── expand/collapse ───────────────────────────────────────────────────────

  const handleToggleExpand = (charId) => {
    setExpandedCharId(prev => (prev === charId ? null : charId));
  };

  // ── character CRUD ────────────────────────────────────────────────────────

  const handleStartAddChar = () => {
    setCharForm(emptyCharForm());
    setExpandedCharId(null);
  };

  const handleStartEditChar = (char) => {
    setCharForm(charToForm(char));
    setExpandedCharId(char.id);
  };

  const handleCancelCharForm = () => setCharForm(null);

  const handleCharFormChange = (field, value) =>
    setCharForm(prev => ({ ...prev, [field]: value }));

  const handleSaveChar = async () => {
    if (!charForm?.name?.trim()) { setError('Character name is required.'); return; }
    setSavingChar(true); setError('');
    const { _id, ...payload } = charForm;
    try {
      if (!_id) {
        const data = await createCharacter(apiBaseUrl, payload);
        const newChar = data?.character || data;
        setCharacters(prev => [...prev, newChar]);
        setExpandedCharId(newChar.id);
        setMsg(`Character "${newChar.name}" created.`);
      } else {
        const data = await updateCharacter(apiBaseUrl, _id, payload);
        const updated = data?.character || data;
        setCharacters(prev => prev.map(c => c.id === _id ? updated : c));
        setMsg(`Character "${updated.name}" updated.`);
      }
      setCharForm(null);
    } catch (e) {
      setError(e?.message || 'Failed to save character.');
    } finally {
      setSavingChar(false);
    }
  };

  const handleDeleteChar = async (char) => {
    if (!window.confirm(`Delete character "${char.name}"? This cannot be undone.`)) return;
    setDeletingCharId(char.id); setError('');
    try {
      await deleteCharacter(apiBaseUrl, char.id);
      setCharacters(prev => prev.filter(c => c.id !== char.id));
      if (expandedCharId === char.id) setExpandedCharId(null);
      setMsg(`Character "${char.name}" deleted.`);
    } catch (e) {
      setError(e?.message || 'Failed to delete character.');
    } finally {
      setDeletingCharId('');
    }
  };

  // ── assembled prompt preview (live, character form only) ─────────────────

  const promptPreview = useMemo(() => {
    const c = charForm || {};
    return [
      c.signatureTraits, c.eyeDetails, c.hairDetails,
      c.outfitMaterials, c.accessories, c.styleReference,
      c.defaultImagePrompt,
    ].filter(Boolean).join(', ');
  }, [charForm]);

  // ── sub-renderers ─────────────────────────────────────────────────────────

  const fieldLabel = (label, optional = false) => (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--skr-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
      {label}{optional && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> (optional)</span>}
    </div>
  );

  const modelSelect = (value, onChange, models, placeholder = '— Default —') => (
    <select className="skr-input skr-field-select" style={{ fontSize: 12, width: '100%' }} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {models.map(m => <option key={m.key} value={m.key}>{m.name || m.label || m.key}</option>)}
    </select>
  );

  const renderCharForm = () => (
    <div className="skr-card" style={{ padding: 20, marginBottom: 12, border: '2px solid var(--skr-accent, #d97706)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--skr-text-primary)', margin: 0 }}>
          {charForm?._id ? 'Edit Character' : 'New Character'}
        </p>
        <button className="skr-btn-secondary" style={{ fontSize: 11 }} onClick={handleCancelCharForm}>Cancel</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Name */}
        <div style={{ gridColumn: '1 / -1' }}>
          {fieldLabel('Name')}
          <input className="skr-input" style={{ fontSize: 12, width: '100%' }} value={charForm?.name || ''} onChange={e => handleCharFormChange('name', e.target.value)} placeholder="e.g. Aria Starfall" />
        </div>
        {/* Default Image Model */}
        <div>
          {fieldLabel('Default Image Model', true)}
          {modelSelect(charForm?.defaultImageModel || '', v => handleCharFormChange('defaultImageModel', v), imageModels)}
        </div>
        {/* Default Video Model */}
        <div>
          {fieldLabel('Default Video Model', true)}
          {modelSelect(charForm?.defaultVideoModel || '', v => handleCharFormChange('defaultVideoModel', v), videoModels)}
        </div>
        {/* Default Image Prompt */}
        <div style={{ gridColumn: '1 / -1' }}>
          {fieldLabel('Default Image Prompt', true)}
          <textarea className="skr-input" style={{ fontSize: 12, width: '100%', resize: 'vertical', minHeight: 56 }} value={charForm?.defaultImagePrompt || ''} onChange={e => handleCharFormChange('defaultImagePrompt', e.target.value)} placeholder="Base positive prompt for image generation…" />
        </div>
        {/* Default Video Prompt */}
        <div style={{ gridColumn: '1 / -1' }}>
          {fieldLabel('Default Video Prompt', true)}
          <textarea className="skr-input" style={{ fontSize: 12, width: '100%', resize: 'vertical', minHeight: 56 }} value={charForm?.defaultVideoPrompt || ''} onChange={e => handleCharFormChange('defaultVideoPrompt', e.target.value)} placeholder="Base positive prompt for video generation…" />
        </div>
        {/* Visual attributes */}
        <div>
          {fieldLabel('Signature Traits', true)}
          <input className="skr-input" style={{ fontSize: 12, width: '100%' }} value={charForm?.signatureTraits || ''} onChange={e => handleCharFormChange('signatureTraits', e.target.value)} placeholder="e.g. slender, confident posture" />
        </div>
        <div>
          {fieldLabel('Eye Details', true)}
          <input className="skr-input" style={{ fontSize: 12, width: '100%' }} value={charForm?.eyeDetails || ''} onChange={e => handleCharFormChange('eyeDetails', e.target.value)} placeholder="e.g. violet heterochromia eyes" />
        </div>
        <div>
          {fieldLabel('Hair Details', true)}
          <input className="skr-input" style={{ fontSize: 12, width: '100%' }} value={charForm?.hairDetails || ''} onChange={e => handleCharFormChange('hairDetails', e.target.value)} placeholder="e.g. long silver wavy hair" />
        </div>
        <div>
          {fieldLabel('Outfit / Materials', true)}
          <input className="skr-input" style={{ fontSize: 12, width: '100%' }} value={charForm?.outfitMaterials || ''} onChange={e => handleCharFormChange('outfitMaterials', e.target.value)} placeholder="e.g. flowing white mage robes" />
        </div>
        <div>
          {fieldLabel('Accessories', true)}
          <input className="skr-input" style={{ fontSize: 12, width: '100%' }} value={charForm?.accessories || ''} onChange={e => handleCharFormChange('accessories', e.target.value)} placeholder="e.g. ornate staff, small pouch" />
        </div>
        <div>
          {fieldLabel('Style Reference', true)}
          <input className="skr-input" style={{ fontSize: 12, width: '100%' }} value={charForm?.styleReference || ''} onChange={e => handleCharFormChange('styleReference', e.target.value)} placeholder="e.g. anime style, cel shaded" />
        </div>

        {/* Prompt preview */}
        {promptPreview && (
          <div style={{ gridColumn: '1 / -1' }}>
            {fieldLabel('Assembled Prompt Preview')}
            <textarea readOnly className="skr-input" style={{ fontSize: 11, width: '100%', resize: 'none', minHeight: 48, color: 'var(--skr-text-tertiary)', fontFamily: 'monospace' }} value={promptPreview} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="skr-btn-primary" style={{ fontSize: 12 }} onClick={handleSaveChar} disabled={savingChar}>
          {savingChar ? 'Saving…' : (charForm?._id ? 'Update Character' : 'Create Character')}
        </button>
        <button className="skr-btn-secondary" style={{ fontSize: 12 }} onClick={handleCancelCharForm}>Cancel</button>
      </div>
    </div>
  );

  // ── character detail view (expanded, read-only) ───────────────────────────

  const renderCharDetail = (char) => {
    const attrs = [
      { label: 'Signature Traits', value: char.signatureTraits },
      { label: 'Eye Details', value: char.eyeDetails },
      { label: 'Hair Details', value: char.hairDetails },
      { label: 'Outfit / Materials', value: char.outfitMaterials },
      { label: 'Accessories', value: char.accessories },
      { label: 'Style Reference', value: char.styleReference },
    ].filter(a => a.value);
    const hasDefaults = char.defaultImageModel || char.defaultImagePrompt || char.defaultVideoModel || char.defaultVideoPrompt;
    return (
      <div style={{ borderTop: '1px solid var(--skr-border)', marginTop: 12, paddingTop: 12 }}>
        {hasDefaults && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {char.defaultImageModel && (
              <div><span style={{ fontSize: 10, fontWeight: 600, color: 'var(--skr-text-tertiary)', textTransform: 'uppercase' }}>Image model</span><p style={{ fontSize: 12, margin: '2px 0 0', color: 'var(--skr-text-secondary)' }}>{char.defaultImageModel}</p></div>
            )}
            {char.defaultVideoModel && (
              <div><span style={{ fontSize: 10, fontWeight: 600, color: 'var(--skr-text-tertiary)', textTransform: 'uppercase' }}>Video model</span><p style={{ fontSize: 12, margin: '2px 0 0', color: 'var(--skr-text-secondary)' }}>{char.defaultVideoModel}</p></div>
            )}
            {char.defaultImagePrompt && (
              <div style={{ gridColumn: '1 / -1' }}><span style={{ fontSize: 10, fontWeight: 600, color: 'var(--skr-text-tertiary)', textTransform: 'uppercase' }}>Image prompt</span><p style={{ fontSize: 11, margin: '2px 0 0', color: 'var(--skr-text-tertiary)', fontFamily: 'monospace', wordBreak: 'break-word' }}>{char.defaultImagePrompt}</p></div>
            )}
            {char.defaultVideoPrompt && (
              <div style={{ gridColumn: '1 / -1' }}><span style={{ fontSize: 10, fontWeight: 600, color: 'var(--skr-text-tertiary)', textTransform: 'uppercase' }}>Video prompt</span><p style={{ fontSize: 11, margin: '2px 0 0', color: 'var(--skr-text-tertiary)', fontFamily: 'monospace', wordBreak: 'break-word' }}>{char.defaultVideoPrompt}</p></div>
            )}
          </div>
        )}
        {attrs.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {attrs.map(a => (
              <span key={a.label} style={{ fontSize: 11, background: 'var(--skr-elevated)', border: '1px solid var(--skr-border)', borderRadius: 4, padding: '2px 8px', color: 'var(--skr-text-secondary)' }}>
                <span style={{ color: 'var(--skr-text-tertiary)', fontSize: 10, textTransform: 'uppercase', fontWeight: 600 }}>{a.label}: </span>{a.value}
              </span>
            ))}
          </div>
        )}
        <p style={{ fontSize: 11, color: 'var(--skr-text-tertiary)', fontStyle: 'italic', margin: 0 }}>
          LoRA profiles for this character are managed in the <strong>LoRA Management</strong> page.
        </p>
      </div>
    );
  };

  // ── render ────────────────────────────────────────────────────────────────

  const systemChars = characters.filter(c => c.source === 'system');
  const userChars = characters.filter(c => c.source !== 'system');

  return (
    <div style={{ marginTop: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--skr-text-primary)', margin: 0 }}>Characters</h3>
          <p style={{ fontSize: 12, color: 'var(--skr-text-tertiary)', margin: '3px 0 0' }}>
            Character identities — name, visual traits, and default generation models. LoRA profiles are configured in the <strong>LoRA Management</strong> page.
          </p>
        </div>
        {!charForm && (
          <button className="skr-btn-secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }} onClick={handleStartAddChar}>
            + New Character
          </button>
        )}
      </div>

      {/* Feedback */}
      {message && (
        <p style={{ fontSize: 12, color: 'var(--skr-accent)', background: 'var(--skr-accent-subtle, rgba(217,119,6,0.1))', padding: '6px 10px', borderRadius: 6, marginBottom: 10 }}>
          {message}
        </p>
      )}
      {error && (
        <p style={{ fontSize: 12, color: '#ef4444', background: '#fef2f2', padding: '6px 10px', borderRadius: 6, marginBottom: 10 }}>
          {error}
        </p>
      )}

      {/* Add character form (when _id is null = new) */}
      {charForm && charForm._id === null && renderCharForm()}

      {isLoading ? (
        <p style={{ fontSize: 12, color: 'var(--skr-text-tertiary)' }}>Loading characters…</p>
      ) : (
        <>
          {/* System characters */}
          {systemChars.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--skr-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>System Characters</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {systemChars.map(char => {
                  const isExpanded = expandedCharId === char.id;
                  return (
                    <div key={char.id} className="skr-card" style={{ padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => handleToggleExpand(char.id)}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--skr-text-primary)' }}>{char.name}</span>
                          <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--skr-text-tertiary)', background: 'var(--skr-elevated)', border: '1px solid var(--skr-border)', borderRadius: 4, padding: '1px 5px' }}>system</span>
                          {char.signatureTraits && (
                            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--skr-text-tertiary)' }}>{char.signatureTraits}</span>
                          )}
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--skr-text-tertiary)' }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>
                      {isExpanded && renderCharDetail(char)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* User characters */}
          {userChars.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--skr-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>My Characters</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {userChars.map(char => {
                  const isExpanded = expandedCharId === char.id;
                  const isEditingThis = charForm?._id === char.id;
                  const isDeleting = deletingCharId === char.id;
                  return (
                    <div key={char.id} className="skr-card" style={{ padding: 16 }}>
                      {/* Header row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => handleToggleExpand(char.id)}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--skr-text-primary)' }}>{char.name}</span>
                          {char.signatureTraits && (
                            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--skr-text-tertiary)' }}>{char.signatureTraits}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="skr-btn-secondary" style={{ fontSize: 11 }} onClick={() => handleStartEditChar(char)} disabled={isDeleting}>Edit</button>
                          <button className="skr-btn-secondary" style={{ fontSize: 11, color: '#ef4444' }} onClick={() => handleDeleteChar(char)} disabled={isDeleting || deletingCharId !== ''}>
                            {isDeleting ? '…' : 'Delete'}
                          </button>
                          <span style={{ fontSize: 12, color: 'var(--skr-text-tertiary)', cursor: 'pointer', padding: '0 4px' }} onClick={() => handleToggleExpand(char.id)}>{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>

                      {/* Edit form (inline, replaces expanded content) */}
                      {isEditingThis && renderCharForm()}

                      {/* Expanded character detail (when not editing) */}
                      {isExpanded && !isEditingThis && renderCharDetail(char)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {characters.length === 0 && !charForm && (
            <div className="skr-card" style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--skr-text-tertiary)', fontSize: 13 }}>
              No characters yet. Create your first character to get started.
            </div>
          )}
        </>
      )}
    </div>
  );
}
