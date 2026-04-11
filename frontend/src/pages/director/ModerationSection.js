import React, { useState, useEffect, useCallback } from 'react';
import {
  listSharedImagesAdmin, deleteSharedImageAdmin,
  listSharedVideosAdmin, deleteSharedVideoAdmin,
} from '../../services/operations';
import { useNotify } from '../../components/sakura/NotificationStack';

const TABS = ['Shared Images', 'Shared Videos'];

/**
 * ModerationSection — browse and delete shared images/videos.
 * Props: { apiBaseUrl }
 */
export default function ModerationSection({ apiBaseUrl }) {
  const notify = useNotify();
  const [tab, setTab] = useState(0);
  const [items, setItems] = useState([]);
  const [nextToken, setNextToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingKey, setDeletingKey] = useState('');

  const load = useCallback(async (token = null) => {
    if (!apiBaseUrl) return;
    setIsLoading(true);
    try {
      const fetcher = tab === 0 ? listSharedImagesAdmin : listSharedVideosAdmin;
      const data = await fetcher(apiBaseUrl, { limit: 120, continuationToken: token || undefined });
      const newItems = data?.images || data?.videos || data?.items || [];
      setItems(token ? prev => [...prev, ...newItems] : newItems);
      setNextToken(data?.nextToken || data?.continuationToken || null);
    } catch (e) {
      notify(e?.message || 'Failed to load media.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setItems([]);
    setNextToken(null);
    load();
  }, [tab, apiBaseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (item) => {
    const key = item.key || item.s3Key;
    if (!key) return;
    if (!window.confirm('Delete this item? This cannot be undone.')) return;
    setDeletingKey(key);
    try {
      const deleter = tab === 0 ? deleteSharedImageAdmin : deleteSharedVideoAdmin;
      await deleter(apiBaseUrl, { key });
      setItems(prev => prev.filter(i => (i.key || i.s3Key) !== key));
      notify('Item deleted.', 'success');
    } catch (e) {
      notify(e?.message || 'Failed to delete item.', 'error');
    } finally {
      setDeletingKey('');
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <p className="skr-section-title" style={{ marginBottom: 12 }}>Moderation</p>
      <div className="skr-tab-bar" style={{ marginBottom: 12 }}>
        {TABS.map((t, i) => (
          <button key={t} className={`skr-tab${tab === i ? ' is-active' : ''}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>
      {isLoading && items.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--skr-text-tertiary)' }}>Loading…</p>
      ) : items.length === 0 ? (
        <p className="skr-empty-row">No items found.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {items.map((item, i) => {
            const key = item.key || item.s3Key || `item-${i}`;
            const url = item.url || item.thumbnailUrl;
            return (
              <div key={key} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: 'var(--skr-elevated)' }}>
                {url && <img src={url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />}
                <div style={{ padding: '6px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--skr-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>{key.split('/').pop()}</span>
                  <button
                    className="skr-btn-secondary"
                    style={{ fontSize: 10, padding: '2px 6px', color: '#ef4444' }}
                    onClick={() => handleDelete(item)}
                    disabled={deletingKey === key}
                  >
                    {deletingKey === key ? '…' : 'Del'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {nextToken && (
        <button className="skr-btn-secondary" style={{ marginTop: 12, fontSize: 12 }} onClick={() => load(nextToken)} disabled={isLoading}>
          {isLoading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
