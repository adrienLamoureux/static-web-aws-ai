import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  listDirectorMasonryImages,
  requestDirectorMasonryUploadUrl,
  deleteDirectorMasonryImage,
} from '../../services/operations';
import { putFileToUrl } from '../../services/s3';

/**
 * MasonrySection — masonry portrait management inside the Director page.
 *
 * Props:
 *   apiBaseUrl – string
 */
export default function MasonrySection({ apiBaseUrl }) {
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
