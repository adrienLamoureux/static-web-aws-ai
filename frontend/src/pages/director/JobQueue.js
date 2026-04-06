import React, { useState } from 'react';
import { prioritizeDirectorJob } from '../../services/operations';

const formatTimestamp = (value) => {
  if (!value) return '—';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return String(value);
  return new Date(parsed).toLocaleString();
};

/**
 * JobQueue — job queue section inside the Director page.
 *
 * Props:
 *   apiBaseUrl – string
 *   jobs       – array from overview.jobs
 *   isLoading  – bool
 *   onRefresh  – () => void
 */
export default function JobQueue({ apiBaseUrl, jobs, isLoading, onRefresh }) {
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
