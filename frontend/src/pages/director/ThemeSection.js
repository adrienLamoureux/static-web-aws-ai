import React, { useState, useEffect } from 'react';
import { fetchDirectorAppConfig, saveDirectorAppConfig } from '../../services/operations';
import { useNotify } from '../../components/sakura/NotificationStack';

/**
 * ThemeSection — change the active app theme.
 * Props: { apiBaseUrl }
 */
export default function ThemeSection({ apiBaseUrl }) {
  const notify = useNotify();
  const [appConfig, setAppConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!apiBaseUrl) { setIsLoading(false); return; }
    setIsLoading(true);
    fetchDirectorAppConfig(apiBaseUrl)
      .then(data => {
        setAppConfig(data);
        setSelectedTheme(data?.config?.theme || '');
      })
      .catch(e => notify(e?.message || 'Failed to load app config.', 'error'))
      .finally(() => setIsLoading(false));
  }, [apiBaseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const themes = appConfig?.options?.themes || [];

  const handleSave = async () => {
    if (!apiBaseUrl) return;
    setIsSaving(true);
    try {
      await saveDirectorAppConfig(apiBaseUrl, { theme: selectedTheme });
      notify('Theme saved.', 'success');
    } catch (e) {
      notify(e?.message || 'Failed to save theme.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return null;

  return (
    <div className="skr-card" style={{ padding: 20 }}>
      <p className="skr-module-title">App Theme</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          className="skr-input skr-field-select"
          style={{ fontSize: 12, flex: 1 }}
          value={selectedTheme}
          onChange={e => setSelectedTheme(e.target.value)}
        >
          <option value="">— Default —</option>
          {themes.map(t => (
            <option key={t.key || t} value={t.key || t}>{t.name || t.key || t}</option>
          ))}
        </select>
        <button
          className="skr-btn-primary"
          style={{ fontSize: 12 }}
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
