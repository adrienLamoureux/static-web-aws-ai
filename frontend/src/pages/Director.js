import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfig } from "../contexts/ConfigContext";
import {
  fetchDirectorOverview,
  saveDirectorConfig,
  pinDirectorStorySession,
  prioritizeDirectorJob,
  listDirectorMasonryImages,
  requestDirectorMasonryUploadUrl,
  deleteDirectorMasonryImage,
} from "../services/operations";
import { putFileToUrl } from "../services/s3";
import { listCharacters, createCharacter, updateCharacter, deleteCharacter } from "../services/characters";

const formatTimestamp = (value) => {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return String(value);
  return new Date(parsed).toLocaleString();
};

export default function Director() {
  const { apiBaseUrl } = useConfig();
  const [overview, setOverview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadOverview = useCallback(async () => {
    if (!apiBaseUrl) {
      setLoadError("API base URL is not configured.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError("");
    try {
      const payload = await fetchDirectorOverview(apiBaseUrl);
      setOverview(payload);
    } catch (error) {
      setLoadError(error?.message || "Failed to load director data.");
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    setOverview(null);
    if (!apiBaseUrl) {
      setLoadError("API base URL is not configured.");
      setIsLoading(false);
      return;
    }
    loadOverview();
  }, [apiBaseUrl, loadOverview]);

  const summary = {
    queued: Number(overview?.summary?.queued || 0),
    running: Number(overview?.summary?.running || 0),
    completed: Number(overview?.summary?.completed || 0),
    failed: Number(overview?.summary?.failed || 0),
    queueDepth: Number(overview?.summary?.queueDepth || 0),
  };

  const config = overview?.config || {};
  const modules = overview?.modules || {};
  const generationModule = modules.generation || {};
  const videoModule = modules.video || {};
  const storyModule = modules.story || {};

  const handleSaveGenConfig = async () => {
    if (!apiBaseUrl) return;
    setActionError(""); setActionMessage(""); setIsSaving(true);
    try {
      await saveDirectorConfig(apiBaseUrl, { generation: config.generation });
      await loadOverview();
      setActionMessage("Generation config saved.");
    } catch (e) {
      setActionError(e?.message || "Failed to save config.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <div className="skr-page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 className="skr-page-title">Global Command Center</h2>
          <p className="skr-page-subtitle">Director overview and orchestration controls</p>
        </div>
        <button className="skr-btn-secondary" onClick={loadOverview} disabled={isLoading} style={{ fontSize: 12 }}>
          {isLoading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {loadError && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#ef4444' }}>
          {loadError}
        </div>
      )}

      {/* Summary stat cards */}
      <div className="skr-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Queued', value: summary.queued },
          { label: 'Running', value: summary.running },
          { label: 'Completed', value: summary.completed },
          { label: 'Failed', value: summary.failed },
          { label: 'Queue Depth', value: summary.queueDepth },
        ].map(({ label, value }) => (
          <div key={label} className="skr-card" style={{ padding: '16px 20px' }}>
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--skr-text-tertiary)', marginBottom: 6 }}>{label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--skr-text-primary)' }}>{isLoading ? '—' : value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Generation Module */}
        <div className="skr-card" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--skr-text-primary)', marginBottom: 12 }}>Generation</p>
          {isLoading ? (
            <p style={{ fontSize: 12, color: 'var(--skr-text-tertiary)' }}>Loading…</p>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--skr-text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>Total jobs: <strong>{Number(generationModule.totalJobs || 0)}</strong></div>
              <div>Recent: <strong>{Number(generationModule.recentCount || 0)}</strong></div>
              {generationModule.lastJobAt && <div>Last job: <strong>{formatTimestamp(generationModule.lastJobAt)}</strong></div>}
            </div>
          )}
        </div>

        {/* Video Module */}
        <div className="skr-card" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--skr-text-primary)', marginBottom: 12 }}>Video</p>
          {isLoading ? (
            <p style={{ fontSize: 12, color: 'var(--skr-text-tertiary)' }}>Loading…</p>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--skr-text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>Total jobs: <strong>{Number(videoModule.totalJobs || 0)}</strong></div>
              <div>Recent: <strong>{Number(videoModule.recentCount || 0)}</strong></div>
              {videoModule.lastJobAt && <div>Last job: <strong>{formatTimestamp(videoModule.lastJobAt)}</strong></div>}
            </div>
          )}
        </div>

        {/* Story Module */}
        <div className="skr-card" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--skr-text-primary)', marginBottom: 12 }}>Story Sessions</p>
          {isLoading ? (
            <p style={{ fontSize: 12, color: 'var(--skr-text-tertiary)' }}>Loading…</p>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--skr-text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>Total sessions: <strong>{Number(storyModule.totalSessions || 0)}</strong></div>
              <div>Active: <strong>{Number(storyModule.activeSessions || 0)}</strong></div>
            </div>
          )}
        </div>

        {/* Config */}
        <div className="skr-card" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--skr-text-primary)', marginBottom: 12 }}>Config</p>
          {isLoading ? (
            <p style={{ fontSize: 12, color: 'var(--skr-text-tertiary)' }}>Loading…</p>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--skr-text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {config.generation?.imageModel && <div>Image model: <strong>{config.generation.imageModel}</strong></div>}
              {config.generation?.negativePrompt && <div>Negative prompt: <strong style={{ wordBreak: 'break-all' }}>{config.generation.negativePrompt.slice(0, 60)}…</strong></div>}
              <button className="skr-btn-primary" style={{ marginTop: 8, fontSize: 12 }} onClick={handleSaveGenConfig} disabled={isSaving || isLoading}>
                {isSaving ? 'Saving…' : 'Save Gen Config'}
              </button>
            </div>
          )}
        </div>
      </div>

      {actionMessage && <p style={{ marginTop: 16, fontSize: 13, color: 'var(--skr-accent)', background: 'var(--skr-accent-subtle)', padding: '8px 12px', borderRadius: 6 }}>{actionMessage}</p>}
      {actionError && <p style={{ marginTop: 16, fontSize: 13, color: '#ef4444', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{actionError}</p>}

      {/* Story Sessions browser */}
      <StorySessions apiBaseUrl={apiBaseUrl} sessions={overview?.sessions || []} isLoading={isLoading} onRefresh={loadOverview} />

      {/* Job Queue */}
      <JobQueue apiBaseUrl={apiBaseUrl} jobs={overview?.jobs || []} isLoading={isLoading} onRefresh={loadOverview} />

      {/* Masonry portraits */}
      <MasonrySection apiBaseUrl={apiBaseUrl} />

      {/* Characters & LoRA management */}
      <CharactersSection
        apiBaseUrl={apiBaseUrl}
        imageModels={overview?.options?.generation?.imageModels || []}
        videoModels={overview?.options?.generation?.videoModels || []}
      />
    </div>
  );
}

function StorySessions({ apiBaseUrl, sessions, isLoading, onRefresh }) {
  const [pinning, setPinning] = useState('');
  const [error, setError] = useState('');

  if (isLoading || (!isLoading && sessions.length === 0 && !error)) return null;

  const handlePin = async (session) => {
    if (!apiBaseUrl) return;
    setPinning(session.sessionId);
    setError('');
    try {
      await pinDirectorStorySession(apiBaseUrl, { sessionId: session.sessionId, pinned: !session.pinned });
      onRefresh();
    } catch (e) {
      setError(e?.message || 'Failed to pin session.');
    } finally {
      setPinning('');
    }
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div className="skr-page-header" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--skr-text-primary)' }}>Story Sessions</h3>
      </div>
      {error && <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>{error}</p>}
      <div className="skr-card" style={{ padding: 0, overflow: 'hidden' }}>
        {sessions.map((session, i) => (
          <div key={session.sessionId || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < sessions.length - 1 ? '1px solid var(--skr-border)' : 'none' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--skr-text-primary)', margin: 0 }}>
                {session.title || session.name || session.sessionId?.slice(0, 12) || 'Session'}
                {session.pinned && <span className="skr-chip accent" style={{ marginLeft: 8 }}>Pinned</span>}
              </p>
              {session.updatedAt && (
                <p style={{ fontSize: 11, color: 'var(--skr-text-tertiary)', margin: 0 }}>{formatTimestamp(session.updatedAt)}</p>
              )}
            </div>
            <button
              className="skr-btn-secondary"
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={() => handlePin(session)}
              disabled={pinning === session.sessionId}
            >
              {pinning === session.sessionId ? '…' : session.pinned ? 'Unpin' : 'Pin'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobQueue({ apiBaseUrl, jobs, isLoading, onRefresh }) {
  const [prioritizing, setPrioritizing] = useState('');
  const [error, setError] = useState('');

  if (isLoading || (!isLoading && jobs.length === 0 && !error)) return null;

  const handlePrioritize = async (job) => {
    if (!apiBaseUrl) return;
    setPrioritizing(job.jobId);
    setError('');
    try {
      const newPriority = job.priority === 'high' ? 'normal' : 'high';
      await prioritizeDirectorJob(apiBaseUrl, { jobId: job.jobId, priority: newPriority });
      onRefresh();
    } catch (e) {
      setError(e?.message || 'Failed to prioritize job.');
    } finally {
      setPrioritizing('');
    }
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div className="skr-page-header" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--skr-text-primary)' }}>Job Queue</h3>
      </div>
      {error && <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>{error}</p>}
      <div className="skr-card" style={{ padding: 0, overflow: 'hidden' }}>
        {jobs.map((job, i) => (
          <div key={job.jobId || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < jobs.length - 1 ? '1px solid var(--skr-border)' : 'none' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--skr-text-primary)', margin: 0 }}>
                {job.type || job.jobId?.slice(0, 12) || 'Job'}
                <span className={`skr-chip${job.priority === 'high' ? ' accent' : ''}`} style={{ marginLeft: 8 }}>{job.priority || 'normal'}</span>
                <span className="skr-chip" style={{ marginLeft: 4 }}>{job.status || 'queued'}</span>
              </p>
              {job.createdAt && (
                <p style={{ fontSize: 11, color: 'var(--skr-text-tertiary)', margin: 0 }}>{formatTimestamp(job.createdAt)}</p>
              )}
            </div>
            {(job.status === 'queued' || job.status === 'pending') && (
              <button
                className="skr-btn-secondary"
                style={{ fontSize: 11, padding: '3px 10px' }}
                onClick={() => handlePrioritize(job)}
                disabled={prioritizing === job.jobId}
              >
                {prioritizing === job.jobId ? '…' : job.priority === 'high' ? 'Deprioritize' : 'Prioritize'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MasonrySection({ apiBaseUrl }) {
  const [images, setImages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingKey, setDeletingKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!apiBaseUrl) return;
    setIsLoading(true);
    try {
      const data = await listDirectorMasonryImages(apiBaseUrl);
      setImages(Array.isArray(data?.images) ? data.images : []);
    } catch (e) {
      setError(e?.message || 'Failed to load masonry images.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !apiBaseUrl) return;
    setError(''); setMessage(''); setIsUploading(true);
    try {
      const upload = await requestDirectorMasonryUploadUrl(apiBaseUrl, {
        fileName: file.name,
        contentType: file.type || 'image/jpeg',
      });
      await putFileToUrl(upload.url, file, file.type || 'image/jpeg');
      await refresh();
      setMessage('Portrait uploaded.');
    } catch (e) {
      setError(e?.message || 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (key) => {
    if (!apiBaseUrl || !key) return;
    setError(''); setMessage(''); setDeletingKey(key);
    try {
      await deleteDirectorMasonryImage(apiBaseUrl, { key });
      await refresh();
      setMessage('Portrait removed.');
    } catch (e) {
      setError(e?.message || 'Delete failed.');
    } finally {
      setDeletingKey('');
    }
  };

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--skr-text-primary)', margin: 0 }}>Masonry Portraits</h3>
          <p style={{ fontSize: 12, color: 'var(--skr-text-tertiary)', margin: '3px 0 0' }}>
            {isLoading ? 'Loading…' : `${images.length} portrait${images.length !== 1 ? 's' : ''} — shown on the home page hero`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="skr-btn-secondary" style={{ fontSize: 12 }} onClick={refresh} disabled={isLoading}>
            ↺ Refresh
          </button>
          <button
            className="skr-btn-primary"
            style={{ fontSize: 12 }}
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? 'Uploading…' : '+ Upload portrait'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      </div>

      {message && <p style={{ fontSize: 12, color: 'var(--skr-accent)', background: 'var(--skr-accent-subtle)', padding: '6px 10px', borderRadius: 6, marginBottom: 12 }}>{message}</p>}
      {error && <p style={{ fontSize: 12, color: '#ef4444', background: '#fef2f2', padding: '6px 10px', borderRadius: 6, marginBottom: 12 }}>{error}</p>}

      {isLoading ? (
        <p style={{ fontSize: 12, color: 'var(--skr-text-tertiary)' }}>Loading portraits…</p>
      ) : images.length === 0 ? (
        <div className="skr-card" style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--skr-text-tertiary)', fontSize: 13 }}>
          No portraits uploaded yet. Upload portrait images (3:5 aspect ratio works best) to populate the animated home page hero.
        </div>
      ) : (
        <div className="skr-masonry-mgmt-grid">
          {images.map((img, i) => (
            <div key={img.key || i} className="skr-masonry-mgmt-card">
              <img src={img.url} alt="" loading="lazy" />
              <div className="skr-masonry-mgmt-meta">
                <p title={img.key}>{(img.key || '').split('/').pop()?.slice(0, 24) || img.key}</p>
                <button onClick={() => handleDelete(img.key)} disabled={deletingKey === img.key}>
                  {deletingKey === img.key ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CharactersSection — Character identity CRUD
// LoRA profiles for each character are managed in the LoRA Management page.
// ─────────────────────────────────────────────────────────────────────────────
function CharactersSection({ apiBaseUrl, imageModels = [], videoModels = [] }) {
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
