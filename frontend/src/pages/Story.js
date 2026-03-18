import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useConfig } from '../contexts/ConfigContext';
import {
  listStoryPresets,
  listStorySessions,
  createStorySession,
  getStorySession,
  sendStoryMessage,
  generateStoryIllustration,
  switchSessionLora,
} from '../services/story';
import { listLoraProfilesForCharacter } from '../services/lora';
import { listCharacters } from '../services/characters';

export default function Story() {
  const { apiBaseUrl } = useConfig();
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState('');
  const [presets, setPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  // scenes: map of sceneId → { sceneId, title, description, imageUrl, illustrating, error }
  const [scenes, setScenes] = useState({});
  // Character + LoRA state (bound to active session)
  const [sessionCharacterId, setSessionCharacterId] = useState(null);
  const [sessionLoraProfileId, setSessionLoraProfileId] = useState(null);
  const [sessionLoraProfiles, setSessionLoraProfiles] = useState([]);
  const [characterName, setCharacterName] = useState('');
  const [showLoraSwitcher, setShowLoraSwitcher] = useState(false);
  const [switchingLora, setSwitchingLora] = useState(false);
  // All characters (for name lookup)
  const [allCharacters, setAllCharacters] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load characters once (for name lookups)
  useEffect(() => {
    if (!apiBaseUrl) return;
    listCharacters(apiBaseUrl)
      .then(data => setAllCharacters(data?.characters || []))
      .catch(() => {});
  }, [apiBaseUrl]);

  // Load presets once
  useEffect(() => {
    if (!apiBaseUrl) return;
    listStoryPresets(apiBaseUrl)
      .then(data => {
        const list = data?.presets || [];
        setPresets(list);
        if (list.length > 0) setSelectedPresetId(list[0].id);
      })
      .catch(() => {});
  }, [apiBaseUrl]);

  const mergeScenes = useCallback((incoming = []) => {
    if (!incoming.length) return;
    setScenes(prev => {
      const next = { ...prev };
      for (const s of incoming) {
        if (s?.sceneId) next[s.sceneId] = { ...next[s.sceneId], ...s };
      }
      return next;
    });
  }, []);

  const selectSession = useCallback(async (sessionId) => {
    if (!sessionId || !apiBaseUrl) return;
    setActiveSessionId(sessionId);
    setLoadingSession(true);
    setMessages([]);
    setError('');
    setShowLoraSwitcher(false);
    try {
      const data = await getStorySession(apiBaseUrl, sessionId);
      const session = data?.session || data;

      // Extract character and LoRA bindings
      const charId = session?.characterId || null;
      const loraId = session?.loraProfileId || null;
      setSessionCharacterId(charId);
      setSessionLoraProfileId(loraId);

      // Merge scenes from session into scene map
      const sessionScenes = Array.isArray(session?.scenes) ? session.scenes : [];
      mergeScenes(sessionScenes);

      const msgs = (session?.messages || []).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        text: m.content || m.text || '',
        sceneId: m.sceneId || null,
      }));
      if (msgs.length === 0) {
        // Use the preset opening as the first assistant message if available
        const opening = session?.opening || session?.preset?.opening || null;
        setMessages([{
          role: 'assistant',
          text: opening || "Welcome to your story. Describe what you do or say.",
          sceneId: null,
        }]);
      } else {
        setMessages(msgs);
      }
    } catch (e) {
      setError(e?.message || 'Failed to load session.');
    } finally {
      setLoadingSession(false);
    }
  }, [apiBaseUrl, mergeScenes]);

  // Load LoRA profiles + resolve character name when session character changes
  useEffect(() => {
    if (!apiBaseUrl || !sessionCharacterId) {
      setSessionLoraProfiles([]);
      setCharacterName('');
      return;
    }
    // Resolve name from already-loaded allCharacters list
    const found = allCharacters.find(c => c.id === sessionCharacterId);
    setCharacterName(found?.name || sessionCharacterId);
    // Load LoRA profiles for this character
    listLoraProfilesForCharacter(apiBaseUrl, sessionCharacterId)
      .then(data => setSessionLoraProfiles(data?.items || data?.profiles || []))
      .catch(() => setSessionLoraProfiles([]));
  }, [apiBaseUrl, sessionCharacterId, allCharacters]);

  // Handle LoRA switch mid-session
  const handleSwitchLora = useCallback(async (loraProfileId) => {
    if (!activeSessionId || !apiBaseUrl) return;
    setSwitchingLora(true);
    const prevId = sessionLoraProfileId;
    try {
      await switchSessionLora(apiBaseUrl, activeSessionId, loraProfileId);
      setSessionLoraProfileId(loraProfileId || null);
      setShowLoraSwitcher(false);
      // Insert a system-note message in chat
      const profile = sessionLoraProfiles.find(p => (p.id || p.characterId) === loraProfileId);
      const profileName = profile?.name || profile?.displayName || loraProfileId || 'None';
      setMessages(prev => [...prev, {
        role: 'system',
        text: loraProfileId
          ? `LoRA profile switched to "${profileName}"`
          : 'LoRA profile cleared (no LoRA)',
        sceneId: null,
      }]);
    } catch {
      setSessionLoraProfileId(prevId);
    } finally {
      setSwitchingLora(false);
    }
  }, [apiBaseUrl, activeSessionId, sessionLoraProfileId, sessionLoraProfiles]);

  // Bootstrap: load sessions, show preset picker if none exist
  const bootstrapSessions = useCallback(async () => {
    if (!apiBaseUrl) return;
    setError('');
    try {
      const data = await listStorySessions(apiBaseUrl);
      const list = data?.sessions || [];
      setSessions(list);
      if (list.length > 0) {
        selectSession(list[0].sessionId);
      } else {
        setShowPresetPicker(true);
      }
    } catch (e) {
      setError(e?.message || 'Failed to load sessions.');
    }
  }, [apiBaseUrl, selectSession]);

  useEffect(() => {
    if (apiBaseUrl) bootstrapSessions();
  }, [apiBaseUrl, bootstrapSessions]);

  const handleNewSession = () => {
    setShowPresetPicker(true);
  };

  // Auto-illustrate the opening scene after session creation.
  // Uses forceCurrent=true so the backend illustrates whatever scene is current
  // without requiring a known sceneId. The result is attached to the first
  // assistant message so it displays inline in the chat.
  const autoIllustrateOpening = useCallback(async (sessionId) => {
    if (!sessionId || !apiBaseUrl) return;
    try {
      const data = await generateStoryIllustration(apiBaseUrl, sessionId, { forceCurrent: true });
      const imageUrl = data?.imageUrl || null;
      const scene = data?.scene || null;
      const sceneId = data?.sceneId || scene?.sceneId || null;
      if (!sceneId) return;
      mergeScenes([{ ...(scene || {}), sceneId, imageUrl: imageUrl || scene?.imageUrl }]);
      // Attach scene to the first assistant message that has no sceneId yet
      setMessages(prev => {
        const idx = prev.findIndex(m => m.role === 'assistant' && !m.sceneId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], sceneId };
        return updated;
      });
    } catch {
      // Non-fatal — user can still illustrate manually
    }
  }, [apiBaseUrl, mergeScenes]);

  const handleCreateSession = async () => {
    if (!apiBaseUrl || !selectedPresetId) return;
    setCreatingSession(true);
    setError('');
    try {
      const preset = presets.find(p => p.id === selectedPresetId);
      const payload = { presetId: selectedPresetId };
      // Pass characterId if the preset has a linked character
      if (preset?.defaultCharacterId) payload.characterId = preset.defaultCharacterId;
      const created = await createStorySession(apiBaseUrl, payload);
      const newSession = created?.session || created;
      if (newSession?.sessionId) {
        setSessions(prev => [newSession, ...prev]);
        setShowPresetPicker(false);
        await selectSession(newSession.sessionId);
        // Auto-generate opening scene illustration
        await autoIllustrateOpening(newSession.sessionId);
      }
    } catch (e) {
      setError(e?.message || 'Failed to create session.');
    } finally {
      setCreatingSession(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending || !activeSessionId) return;
    setInput('');
    const userMsg = { role: 'user', text, sceneId: null };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);
    setError('');
    try {
      // Backend expects `content`, not `message`
      const data = await sendStoryMessage(apiBaseUrl, activeSessionId, { content: text });
      const reply = data?.assistant?.content || data?.reply || data?.message || data?.content || '…';
      const scene = data?.scene || null;

      // Register new scene if returned
      if (scene?.sceneId) {
        mergeScenes([scene]);
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        text: reply,
        sceneId: scene?.sceneId || null,
      }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'Sorry, something went wrong. Please try again.',
        sceneId: null,
      }]);
    } finally {
      setSending(false);
    }
  };

  const handleIllustrate = useCallback(async (sceneId) => {
    if (!sceneId || !apiBaseUrl) return;
    setScenes(prev => ({
      ...prev,
      [sceneId]: { ...prev[sceneId], illustrating: true, illustrationError: null },
    }));
    try {
      const data = await generateStoryIllustration(apiBaseUrl, activeSessionId, { sceneId });
      const imageUrl = data?.imageUrl || null;
      setScenes(prev => ({
        ...prev,
        [sceneId]: { ...prev[sceneId], illustrating: false, imageUrl: imageUrl || prev[sceneId]?.imageUrl },
      }));
    } catch (e) {
      setScenes(prev => ({
        ...prev,
        [sceneId]: { ...prev[sceneId], illustrating: false, illustrationError: e?.message || 'Illustration failed.' },
      }));
    }
  }, [apiBaseUrl, activeSessionId]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const sessionLabel = (s) => s.title || s.name || s.sessionId?.slice(0, 8) || 'Session';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 112px)' }}>
      {/* Header with session selector */}
      <div className="sol-page-header" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <h2 className="sol-page-title">Storytelling Studio</h2>
            <p className="sol-page-subtitle">AI-assisted narrative creation</p>
          </div>
          {sessions.length > 0 && (
            <select
              className="sol-input"
              style={{ width: 200 }}
              value={activeSessionId}
              onChange={e => selectSession(e.target.value)}
            >
              {sessions.map(s => (
                <option key={s.sessionId} value={s.sessionId}>{sessionLabel(s)}</option>
              ))}
            </select>
          )}
          <button className="sol-btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={handleNewSession}>
            + New Session
          </button>
        </div>
      </div>

      {error && <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>{error}</p>}

      {/* Character + LoRA chips */}
      {activeSessionId && (sessionCharacterId || sessionLoraProfileId) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap', position: 'relative' }}>
          {sessionCharacterId && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--sol-elevated)', border: '1px solid var(--sol-border)', borderRadius: 6, padding: '3px 10px', fontSize: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sol-text-tertiary)', textTransform: 'uppercase' }}>Character</span>
              <span style={{ color: 'var(--sol-text-primary)', fontWeight: 600 }}>{characterName || sessionCharacterId}</span>
            </div>
          )}
          {/* LoRA switcher chip */}
          <div style={{ position: 'relative' }}>
            <button
              className="sol-btn-secondary"
              style={{ fontSize: 12, padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => setShowLoraSwitcher(prev => !prev)}
              disabled={switchingLora || !sessionCharacterId}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sol-text-tertiary)', textTransform: 'uppercase' }}>LoRA</span>
              <span>{switchingLora ? 'Switching…' : (sessionLoraProfileId
                ? (sessionLoraProfiles.find(p => (p.id || p.characterId) === sessionLoraProfileId)?.name || 'Custom')
                : 'None'
              )}</span>
              <span style={{ fontSize: 9 }}>▼</span>
            </button>
            {showLoraSwitcher && (
              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4, background: 'var(--sol-elevated)', border: '1px solid var(--sol-border)', borderRadius: 8, padding: 8, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                <button
                  className="sol-btn-secondary"
                  style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 12, padding: '6px 10px', marginBottom: 4, fontStyle: 'italic' }}
                  onClick={() => handleSwitchLora(null)}
                >
                  — No LoRA
                </button>
                {sessionLoraProfiles.map(p => {
                  const pid = p.id || p.characterId;
                  const pname = p.name || p.displayName || pid;
                  const isActive = sessionLoraProfileId === pid;
                  return (
                    <button
                      key={pid}
                      className="sol-btn-secondary"
                      style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 12, padding: '6px 10px', marginBottom: 2, fontWeight: isActive ? 700 : 400, color: isActive ? 'var(--sol-accent, #d97706)' : 'inherit' }}
                      onClick={() => handleSwitchLora(pid)}
                    >
                      {pname}{isActive ? ' ✓' : ''}
                    </button>
                  );
                })}
                {sessionLoraProfiles.length === 0 && (
                  <p style={{ fontSize: 11, color: 'var(--sol-text-tertiary)', padding: '4px 10px', margin: 0 }}>No LoRA profiles for this character.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preset picker */}
      {showPresetPicker && (
        <div style={{ background: 'var(--sol-elevated)', border: '1px solid var(--sol-border)', borderRadius: 12, padding: 24, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Choose a Story Preset</h3>
          <p style={{ fontSize: 12, color: 'var(--sol-text-tertiary)', marginBottom: 16 }}>Select the narrative universe for your new session.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {presets.map(p => (
              <label
                key={p.id}
                style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
                  background: selectedPresetId === p.id ? 'var(--sol-accent-muted, rgba(217,119,6,0.1))' : 'transparent',
                  border: `1px solid ${selectedPresetId === p.id ? 'var(--sol-accent, #d97706)' : 'var(--sol-border)'}`,
                  borderRadius: 8, padding: '10px 14px',
                }}
              >
                <input
                  type="radio"
                  name="preset"
                  value={p.id}
                  checked={selectedPresetId === p.id}
                  onChange={() => setSelectedPresetId(p.id)}
                  style={{ marginTop: 2 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  {p.synopsis && <div style={{ fontSize: 11, color: 'var(--sol-text-tertiary)', marginTop: 2 }}>{p.synopsis}</div>}
                  {p.protagonistName && <div style={{ fontSize: 11, color: 'var(--sol-text-secondary)', marginTop: 2 }}>Protagonist: {p.protagonistName}</div>}
                </div>
              </label>
            ))}
            {presets.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--sol-text-tertiary)' }}>No presets available.</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="sol-btn-primary"
              onClick={handleCreateSession}
              disabled={!selectedPresetId || creatingSession}
            >
              {creatingSession ? 'Starting…' : 'Start Session'}
            </button>
            {sessions.length > 0 && (
              <button className="sol-btn-secondary" onClick={() => setShowPresetPicker(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Chat messages */}
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
        {loadingSession ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--sol-text-tertiary)', fontSize: 13 }}>Loading session…</div>
        ) : (
          <div className="sol-chat-container">
            {messages.map((msg, i) => (
              <React.Fragment key={i}>
                {/* System note (e.g. LoRA switch log) */}
                {msg.role === 'system' ? (
                  <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--sol-text-tertiary)', fontStyle: 'italic', margin: '6px 0', padding: '4px 12px', background: 'var(--sol-elevated)', borderRadius: 6, display: 'inline-block', width: '100%', boxSizing: 'border-box' }}>
                    {msg.text}
                  </div>
                ) : (
                <div className={`sol-chat-bubble ${msg.role}`}>{msg.text}</div>
                )}
                {/* Scene illustration card (assistant messages only) */}
                {msg.role === 'assistant' && msg.sceneId && (() => {
                  const scene = scenes[msg.sceneId];
                  if (!scene) return null;
                  return (
                    <div style={{
                      margin: '6px 0 10px 0',
                      background: 'var(--sol-elevated)',
                      border: '1px solid var(--sol-border)',
                      borderRadius: 10,
                      overflow: 'hidden',
                      maxWidth: 420,
                    }}>
                      {scene.imageUrl ? (
                        <img
                          src={scene.imageUrl}
                          alt={scene.title || 'Scene illustration'}
                          style={{ width: '100%', display: 'block', maxHeight: 320, objectFit: 'cover' }}
                        />
                      ) : null}
                      <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {scene.title && (
                          <span style={{ fontSize: 12, color: 'var(--sol-text-secondary)', flex: 1, fontStyle: 'italic' }}>
                            {scene.title}
                          </span>
                        )}
                        {!scene.imageUrl && !scene.illustrating && (
                          <button
                            className="sol-btn-secondary"
                            style={{ fontSize: 11, padding: '3px 10px', whiteSpace: 'nowrap' }}
                            onClick={() => handleIllustrate(msg.sceneId)}
                          >
                            🎨 Illustrate
                          </button>
                        )}
                        {scene.illustrating && (
                          <span style={{ fontSize: 11, color: 'var(--sol-text-tertiary)' }}>Generating…</span>
                        )}
                        {scene.imageUrl && (
                          <button
                            className="sol-btn-secondary"
                            style={{ fontSize: 11, padding: '3px 10px', whiteSpace: 'nowrap' }}
                            onClick={() => handleIllustrate(msg.sceneId)}
                            title="Re-generate illustration"
                          >
                            ↺
                          </button>
                        )}
                        {scene.illustrationError && (
                          <span style={{ fontSize: 11, color: '#ef4444' }}>{scene.illustrationError}</span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </React.Fragment>
            ))}
            {sending && <div className="sol-chat-bubble assistant" style={{ opacity: 0.6 }}>Thinking…</div>}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          className="sol-input"
          style={{ flex: 1, resize: 'none', minHeight: 42 }}
          rows={2}
          placeholder={activeSessionId ? 'What do you do or say?' : 'Loading session…'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={sending || loadingSession || !activeSessionId}
        />
        <button
          className="sol-btn-primary"
          onClick={sendMessage}
          disabled={sending || !input.trim() || loadingSession || !activeSessionId}
          style={{ alignSelf: 'flex-end' }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
