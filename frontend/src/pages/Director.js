import React, { useCallback, useEffect, useState } from "react";
import { useConfig } from "../contexts/ConfigContext";
import {
  fetchDirectorOverview,
  saveDirectorConfig,
} from "../services/operations";
import StorySessions from "./director/StorySessions";
import JobQueue from "./director/JobQueue";
import MasonrySection from "./director/MasonrySection";
import CharactersSection from "./director/CharactersSection";

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
