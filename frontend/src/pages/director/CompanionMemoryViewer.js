import React, { useState } from 'react';
import { fetchCompanionMemory, clearCompanionMemoryAdmin } from '../../services/operations';
import { useNotify } from '../../components/sakura/NotificationStack';
import { formatTimestamp } from '../../utils/dateFormat';

/**
 * CompanionMemoryViewer
 * Props: { apiBaseUrl }
 */
export default function CompanionMemoryViewer({ apiBaseUrl }) {
  const notify = useNotify();
  const [userId, setUserId] = useState('');
  const [modelId, setModelId] = useState('hiyori_free');
  const [memory, setMemory] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const handleFetch = async () => {
    if (!apiBaseUrl || !userId) return;
    setIsFetching(true);
    try {
      const data = await fetchCompanionMemory(apiBaseUrl, { userId, modelId });
      setMemory(data);
    } catch (e) {
      notify(e?.message || 'Failed to fetch memory.', 'error');
    } finally {
      setIsFetching(false);
    }
  };

  const handleClear = async () => {
    if (!apiBaseUrl || !userId) return;
    if (!window.confirm(`Clear companion memory for user "${userId}"?`)) return;
    setIsClearing(true);
    try {
      await clearCompanionMemoryAdmin(apiBaseUrl, { userId, modelId });
      setMemory(null);
      notify('Companion memory cleared.', 'success');
    } catch (e) {
      notify(e?.message || 'Failed to clear memory.', 'error');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--skr-border)', paddingTop: 12 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--skr-text-secondary)', marginBottom: 8 }}>Companion Memory Viewer</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <input className="skr-input" style={{ fontSize: 12, flex: 2, minWidth: 120 }} placeholder="User ID" value={userId} onChange={e => setUserId(e.target.value)} />
        <input className="skr-input" style={{ fontSize: 12, flex: 1, minWidth: 80 }} placeholder="Model ID" value={modelId} onChange={e => setModelId(e.target.value)} />
        <button className="skr-btn-secondary" style={{ fontSize: 11 }} onClick={handleFetch} disabled={isFetching || !userId}>{isFetching ? '…' : 'Fetch'}</button>
        {memory && <button className="skr-btn-secondary" style={{ fontSize: 11, color: '#ef4444' }} onClick={handleClear} disabled={isClearing}>{isClearing ? '…' : 'Clear'}</button>}
      </div>
      {memory && (
        <div className="skr-info-list" style={{ fontSize: 11 }}>
          <div>Turn count: <strong>{memory.turnCount ?? '—'}</strong></div>
          {memory.updatedAt && <div>Last updated: <strong>{formatTimestamp(memory.updatedAt)}</strong></div>}
          {memory.summary && <div style={{ marginTop: 4 }}><span style={{ color: 'var(--skr-text-tertiary)' }}>Summary:</span> {memory.summary}</div>}
        </div>
      )}
    </div>
  );
}
