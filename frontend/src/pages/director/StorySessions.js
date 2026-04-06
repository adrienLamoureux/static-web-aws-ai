import React, { useState } from 'react';
import { pinDirectorStorySession } from '../../services/operations';

const formatTimestamp = (value) => {
  if (!value) return '—';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return String(value);
  return new Date(parsed).toLocaleString();
};

/**
 * StorySessions — story sessions browser inside the Director page.
 *
 * Props:
 *   apiBaseUrl – string
 *   sessions   – array from overview.sessions
 *   isLoading  – bool
 *   onRefresh  – () => void
 */
export default function StorySessions({ apiBaseUrl, sessions, isLoading, onRefresh }) {
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
