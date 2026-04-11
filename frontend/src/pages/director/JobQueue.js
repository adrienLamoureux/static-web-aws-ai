import React, { useState } from 'react';
import { prioritizeDirectorJob, retryDirectorJob, cancelDirectorJob } from '../../services/operations';
import { formatTimestamp } from '../../utils/dateFormat';
import EmptyRow from '../../components/sakura/EmptyRow';
import { useNotify } from '../../components/sakura/NotificationStack';

const STATUSES = ['all', 'queued', 'pending', 'running', 'completed', 'failed'];

function JobRow({ job, apiBaseUrl, onRefresh }) {
  const notify = useNotify();
  const [prioritizing, setPrioritizing] = useState('');
  const [actioning, setActioning] = useState('');

  const handlePrioritize = async () => {
    if (!apiBaseUrl) return;
    setPrioritizing(job.jobId);
    try {
      const newPriority = job.priority === 'high' ? 'normal' : 'high';
      await prioritizeDirectorJob(apiBaseUrl, { jobId: job.jobId, priority: newPriority });
      onRefresh();
    } catch (e) {
      notify(e?.message || 'Failed to prioritize job.', 'error');
    } finally {
      setPrioritizing('');
    }
  };

  const handleRetry = async () => {
    if (!apiBaseUrl) return;
    setActioning('retry');
    try {
      await retryDirectorJob(apiBaseUrl, { jobKey: job.jobId });
      notify('Job queued for retry.', 'success');
      onRefresh();
    } catch (e) {
      notify(e?.message || 'Failed to retry job.', 'error');
    } finally {
      setActioning('');
    }
  };

  const handleCancel = async () => {
    if (!apiBaseUrl) return;
    setActioning('cancel');
    try {
      await cancelDirectorJob(apiBaseUrl, { jobKey: job.jobId });
      notify('Job cancelled.', 'success');
      onRefresh();
    } catch (e) {
      notify(e?.message || 'Failed to cancel job.', 'error');
    } finally {
      setActioning('');
    }
  };

  const canPrioritize = job.status === 'queued' || job.status === 'pending';
  const canCancel = ['queued', 'pending', 'running'].includes(job.status);
  const canRetry = job.status === 'failed';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 16px', borderBottom: '1px solid var(--skr-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
        <div style={{ display: 'flex', gap: 4 }}>
          {canPrioritize && (
            <button className="skr-btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={handlePrioritize} disabled={!!prioritizing}>
              {prioritizing ? '…' : job.priority === 'high' ? 'Deprioritize' : 'Prioritize'}
            </button>
          )}
          {canRetry && (
            <button className="skr-btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={handleRetry} disabled={actioning === 'retry'}>
              {actioning === 'retry' ? '…' : 'Retry'}
            </button>
          )}
          {canCancel && (
            <button className="skr-btn-secondary" style={{ fontSize: 11, padding: '3px 10px', color: '#ef4444' }} onClick={handleCancel} disabled={actioning === 'cancel'}>
              {actioning === 'cancel' ? '…' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
      {job.status === 'failed' && job.errorMessage && (
        <p style={{ fontSize: 11, color: '#ef4444', margin: 0, paddingLeft: 2 }}>{job.errorMessage}</p>
      )}
    </div>
  );
}

/**
 * JobQueue
 * Props: { apiBaseUrl, jobs, isLoading, onRefresh }
 */
export default function JobQueue({ apiBaseUrl, jobs, isLoading, onRefresh }) {
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter);
  const countFor = (s) => s === 'all' ? jobs.length : jobs.filter(j => j.status === s).length;

  return (
    <div style={{ marginTop: 24 }}>
      <div className="skr-section-header">
        <h3 className="skr-section-title">Job Queue</h3>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
        {STATUSES.map(s => (
          <button
            key={s}
            className={`skr-chip${filter === s ? ' accent' : ''}`}
            style={{ cursor: 'pointer', background: filter === s ? 'rgba(255,107,157,0.2)' : 'rgba(255,107,157,0.06)', border: 'none', fontSize: 11 }}
            onClick={() => setFilter(s)}
          >
            {s} ({countFor(s)})
          </button>
        ))}
      </div>
      <div className="skr-card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <p style={{ padding: '16px', fontSize: 12, color: 'var(--skr-text-tertiary)' }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyRow message="Job queue is empty — generation jobs will appear here once a generation is triggered." />
        ) : (
          filtered.map((job, i) => (
            <JobRow key={job.jobId || i} job={job} apiBaseUrl={apiBaseUrl} onRefresh={onRefresh} />
          ))
        )}
      </div>
    </div>
  );
}
