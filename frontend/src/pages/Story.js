import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useConfig } from '../contexts/ConfigContext';
import { useMusic } from '../contexts/MusicContext';
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
import useSceneMedia from './story/useSceneMedia';
import StorySceneCard from '../components/story/StorySceneCard';

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
  // Set of message indices currently waiting for an on-demand illustration
  const [illustratingMessages, setIllustratingMessages] = useState(new Set());
  const { triggerAnimation, triggerMusic, getSceneMedia, clearAllPolls, mediaMap } = useSceneMedia(apiBaseUrl);
  const { pushTracks, playTrack } = useMusic();
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // When scene music generation completes, push track to the music dock and auto-play it
  useEffect(() => {
    for (const [sceneId, media] of Object.entries(mediaMap)) {
      if (media?.musicStatus === 'succeeded' && media?.musicUrl) {
        const scene = scenes[sceneId];
        const track = {
          url: media.musicUrl,
          key: media.musicKey || media.musicUrl,
          source: 'scene',
          title: scene?.title || 'Scene Music',
          mood: media.musicMood || scene?.musicMood || '',
          energy: media.musicEnergy || scene?.musicEnergy || '',
          tempoBpm: media.musicTempoBpm || scene?.musicTempoBpm || null,
          tags: media.musicTags || scene?.musicTags || [],
          updatedAt: new Date().toISOString(),
        };
        pushTracks([track]);
        playTrack(track);
      }
    }
  }, [mediaMap, scenes, pushTracks, playTrack]);

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
    clearAllPolls();
    setActiveSessionId(sessionId);
    setLoadingSession(true);
    setMessages([]);
    setIllustratingMessages(new Set());
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

      // Messages and scenes are top-level in the response, not inside session
      const rawMessages = data?.messages || session?.messages || [];
      const rawScenes   = data?.scenes   || session?.scenes   || [];

      // Populate scenes map (includes signed imageUrl, videoUrl, musicUrl)
      mergeScenes(rawScenes);

      // Push any already-generated music tracks from this session to the dock
      const musicTracks = rawScenes
        .filter(s => s?.musicUrl)
        .map(s => ({
          url: s.musicUrl,
          key: s.musicKey || s.musicUrl,
          source: 'scene',
          title: s.title || 'Scene Music',
          mood: s.musicMood || '',
          energy: s.musicEnergy || '',
          tempoBpm: s.musicTempoBpm || null,
          tags: s.musicTags || [],
          updatedAt: s.createdAt || '',
        }));
      if (musicTracks.length > 0) pushTracks(musicTracks);

      // Build message list preserving createdAt for scene matching below
      const msgs = rawMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        text: m.content || m.text || '',
        sceneId: m.sceneId || null,
        createdAt: m.createdAt || null,
      }));

      // The DB does not store sceneId on messages, so match chronologically:
      // sort scenes by createdAt, then pair each scene with the nearest
      // assistant message that doesn't already have a sceneId.
      if (rawScenes.length > 0) {
        const sorted = [...rawScenes]
          .filter(s => s?.sceneId)
          .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
        for (const scene of sorted) {
          const sceneTime = new Date(scene.createdAt || 0).getTime();
          // Find the last unmatched assistant message whose createdAt <= scene's + 10s
          let bestIdx = -1;
          for (let k = 0; k < msgs.length; k++) {
            if (msgs[k].role === 'assistant' && !msgs[k].sceneId) {
              const msgTime = new Date(msgs[k].createdAt || 0).getTime();
              if (msgTime <= sceneTime + 10000) bestIdx = k;
            }
          }
          if (bestIdx !== -1) msgs[bestIdx] = { ...msgs[bestIdx], sceneId: scene.sceneId };
        }
      }

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
  }, [apiBaseUrl, mergeScenes, clearAllPolls, pushTracks]);

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
  // Prefers illustrating the known opening scene by ID so the result lands on
  // the same sceneId that was pre-populated in the UI. Falls back to
  // forceCurrent=true when no sceneId is known (the backend would otherwise
  // create a new scene with a different ID, causing a key mismatch).
  const autoIllustrateOpening = useCallback(async (sessionId, knownSceneId = null) => {
    if (!sessionId || !apiBaseUrl) return;
    const payload = knownSceneId ? { sceneId: knownSceneId } : { forceCurrent: true };
    try {
      const data = await generateStoryIllustration(apiBaseUrl, sessionId, payload);
      const imageUrl = data?.imageUrl || null;
      const scene = data?.scene || null;
      const sceneId = data?.sceneId || scene?.sceneId || null;
      if (!sceneId) return;
      // Merge scene data and clear illustrating flag
      mergeScenes([{ ...(scene || {}), sceneId, imageUrl: imageUrl || scene?.imageUrl, illustrating: false }]);
      // Attach scene to the first assistant message that has no sceneId yet
      setMessages(prev => {
        const idx = prev.findIndex(m => m.role === 'assistant' && !m.sceneId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], sceneId };
        return updated;
      });
    } catch {
      // Non-fatal — clear illustrating flag on any pending scene
      setScenes(prev => {
        const updated = { ...prev };
        for (const [key, val] of Object.entries(updated)) {
          if (val?.illustrating) updated[key] = { ...val, illustrating: false };
        }
        return updated;
      });
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
      // Backend returns `id`, not `sessionId` — normalize for the sessions list
      const sessionId = newSession?.id || newSession?.sessionId;
      if (sessionId) {
        const normalized = { ...newSession, sessionId };
        setSessions(prev => [normalized, ...prev]);
        setShowPresetPicker(false);
        await selectSession(sessionId);

        // Pre-populate opening scene from create response so the card appears immediately
        const openingScenes = Array.isArray(created?.scenes) ? created.scenes : [];
        const openingSceneId = openingScenes[0]?.sceneId;
        if (openingSceneId) {
          mergeScenes(openingScenes);
          // Mark as illustrating so the card shows "Generating…" during the API call
          setScenes(prev => ({
            ...prev,
            [openingSceneId]: { ...(prev[openingSceneId] || openingScenes[0]), illustrating: true },
          }));
          // Attach scene to the first assistant message in chat
          setMessages(prev => {
            const idx = prev.findIndex(m => m.role === 'assistant' && !m.sceneId);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = { ...updated[idx], sceneId: openingSceneId };
            return updated;
          });
        }

        // Auto-generate opening scene illustration in background (non-blocking).
        // Pass openingSceneId so the backend illustrates the existing scene
        // (not a new one) — avoids sceneId mismatch in the scenes map.
        autoIllustrateOpening(sessionId, openingSceneId || null);
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

  // On-demand illustration for any assistant message that has no scene yet.
  // Uses forceCurrent=true — backend derives prompt from current story state.
  const handleIllustrateMessage = useCallback(async (msgIndex) => {
    if (!activeSessionId || !apiBaseUrl) return;
    setIllustratingMessages(prev => new Set([...prev, msgIndex]));
    try {
      const data = await generateStoryIllustration(apiBaseUrl, activeSessionId, { forceCurrent: true });
      const imageUrl = data?.imageUrl || null;
      const scene = data?.scene || null;
      const sceneId = data?.sceneId || scene?.sceneId || null;
      if (!sceneId) return;
      mergeScenes([{ ...(scene || {}), sceneId, imageUrl: imageUrl || scene?.imageUrl }]);
      setMessages(prev => {
        const updated = [...prev];
        if (updated[msgIndex] && !updated[msgIndex].sceneId) {
          updated[msgIndex] = { ...updated[msgIndex], sceneId };
        }
        return updated;
      });
    } catch {
      // Non-fatal — button reappears automatically when removed from the set
    } finally {
      setIllustratingMessages(prev => {
        const next = new Set(prev);
        next.delete(msgIndex);
        return next;
      });
    }
  }, [apiBaseUrl, activeSessionId, mergeScenes]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const sessionLabel = (s) => s.title || s.name || s.sessionId?.slice(0, 8) || 'Session';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 112px)' }}>
      {/* Header with session selector */}
      <div className="yk-page-header" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <h2 className="yk-page-title">Storytelling Studio</h2>
            <p className="yk-page-subtitle">AI-assisted narrative creation</p>
          </div>
          {sessions.length > 0 && (
            <select
              className="yk-input"
              style={{ width: 200 }}
              value={activeSessionId}
              onChange={e => selectSession(e.target.value)}
            >
              {sessions.map(s => (
                <option key={s.sessionId} value={s.sessionId}>{sessionLabel(s)}</option>
              ))}
            </select>
          )}
          <button className="yk-btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={handleNewSession}>
            + New Session
          </button>
        </div>
      </div>

      {error && <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>{error}</p>}

      {/* Character + LoRA chips */}
      {activeSessionId && (sessionCharacterId || sessionLoraProfileId) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap', position: 'relative' }}>
          {sessionCharacterId && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--yk-elevated)', border: '1px solid var(--yk-border)', borderRadius: 6, padding: '3px 10px', fontSize: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--yk-text-tertiary)', textTransform: 'uppercase' }}>Character</span>
              <span style={{ color: 'var(--yk-text-primary)', fontWeight: 600 }}>{characterName || sessionCharacterId}</span>
            </div>
          )}
          {/* LoRA switcher chip */}
          <div style={{ position: 'relative' }}>
            <button
              className="yk-btn-secondary"
              style={{ fontSize: 12, padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => setShowLoraSwitcher(prev => !prev)}
              disabled={switchingLora || !sessionCharacterId}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--yk-text-tertiary)', textTransform: 'uppercase' }}>LoRA</span>
              <span>{switchingLora ? 'Switching…' : (sessionLoraProfileId
                ? (sessionLoraProfiles.find(p => (p.id || p.characterId) === sessionLoraProfileId)?.name || 'Custom')
                : 'None'
              )}</span>
              <span style={{ fontSize: 9 }}>▼</span>
            </button>
            {showLoraSwitcher && (
              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4, background: 'var(--yk-elevated)', border: '1px solid var(--yk-border)', borderRadius: 8, padding: 8, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                <button
                  className="yk-btn-secondary"
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
                      className="yk-btn-secondary"
                      style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 12, padding: '6px 10px', marginBottom: 2, fontWeight: isActive ? 700 : 400, color: isActive ? 'var(--yk-accent, #d97706)' : 'inherit' }}
                      onClick={() => handleSwitchLora(pid)}
                    >
                      {pname}{isActive ? ' ✓' : ''}
                    </button>
                  );
                })}
                {sessionLoraProfiles.length === 0 && (
                  <p style={{ fontSize: 11, color: 'var(--yk-text-tertiary)', padding: '4px 10px', margin: 0 }}>No LoRA profiles for this character.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preset picker */}
      {showPresetPicker && (
        <div style={{ background: 'var(--yk-elevated)', border: '1px solid var(--yk-border)', borderRadius: 12, padding: 24, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Choose a Story Preset</h3>
          <p style={{ fontSize: 12, color: 'var(--yk-text-tertiary)', marginBottom: 16 }}>Select the narrative universe for your new session.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {presets.map(p => (
              <label
                key={p.id}
                style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
                  background: selectedPresetId === p.id ? 'var(--yk-accent-muted, rgba(217,119,6,0.1))' : 'transparent',
                  border: `1px solid ${selectedPresetId === p.id ? 'var(--yk-accent, #d97706)' : 'var(--yk-border)'}`,
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
                  {p.synopsis && <div style={{ fontSize: 11, color: 'var(--yk-text-tertiary)', marginTop: 2 }}>{p.synopsis}</div>}
                  {p.protagonistName && <div style={{ fontSize: 11, color: 'var(--yk-text-secondary)', marginTop: 2 }}>Protagonist: {p.protagonistName}</div>}
                </div>
              </label>
            ))}
            {presets.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--yk-text-tertiary)' }}>No presets available.</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="yk-btn-primary"
              onClick={handleCreateSession}
              disabled={!selectedPresetId || creatingSession}
            >
              {creatingSession ? 'Starting…' : 'Start Session'}
            </button>
            {sessions.length > 0 && (
              <button className="yk-btn-secondary" onClick={() => setShowPresetPicker(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Chat messages */}
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
        {loadingSession ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--yk-text-tertiary)', fontSize: 13 }}>Loading session…</div>
        ) : (
          <div className="yk-chat-container">
            {messages.map((msg, i) => (
              <React.Fragment key={i}>
                {/* System note (e.g. LoRA switch log) */}
                {msg.role === 'system' ? (
                  <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--yk-text-tertiary)', fontStyle: 'italic', margin: '6px 0', padding: '4px 12px', background: 'var(--yk-elevated)', borderRadius: 6, display: 'inline-block', width: '100%', boxSizing: 'border-box' }}>
                    {msg.text}
                  </div>
                ) : (
                <div className={`yk-chat-bubble ${msg.role}`}><ReactMarkdown>{msg.text}</ReactMarkdown></div>
                )}
                {/* Scene illustration card (assistant messages only) */}
                {msg.role === 'assistant' && msg.sceneId && (() => {
                  const scene = scenes[msg.sceneId];
                  if (!scene) return null;
                  const media = getSceneMedia(msg.sceneId);
                  const merged = media ? { ...scene, ...media } : scene;
                  return (
                    <StorySceneCard
                      scene={merged}
                      onIllustrate={() => handleIllustrate(msg.sceneId)}
                      onAnimate={() => triggerAnimation(activeSessionId, msg.sceneId)}
                      onMusic={() => triggerMusic(activeSessionId, msg.sceneId)}
                      onPlayInDock={() => playTrack({
                        url: merged.musicUrl,
                        key: merged.musicKey || merged.musicUrl,
                        source: 'scene',
                        title: merged.title || 'Scene Music',
                        mood: merged.musicMood || '',
                        energy: merged.musicEnergy || '',
                        tempoBpm: merged.musicTempoBpm || null,
                        tags: merged.musicTags || [],
                        updatedAt: merged.createdAt || '',
                      })}
                      animating={merged.videoStatus === 'starting' || merged.videoStatus === 'processing'}
                      generatingMusic={merged.musicStatus === 'starting' || merged.musicStatus === 'processing'}
                    />
                  );
                })()}
                {/* On-demand illustrate button for assistant messages without a scene */}
                {msg.role === 'assistant' && !msg.sceneId && activeSessionId && (
                  <div style={{ marginBottom: 6 }}>
                    {illustratingMessages.has(i) ? (
                      <span style={{ fontSize: 11, color: 'var(--yk-text-tertiary)', fontStyle: 'italic' }}>Generating illustration…</span>
                    ) : (
                      <button
                        className="yk-btn-secondary"
                        style={{ fontSize: 11, padding: '3px 10px' }}
                        onClick={() => handleIllustrateMessage(i)}
                      >
                        🎨 Illustrate
                      </button>
                    )}
                  </div>
                )}
              </React.Fragment>
            ))}
            {sending && <div className="yk-chat-bubble assistant" style={{ opacity: 0.6 }}>Thinking…</div>}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          className="yk-input"
          style={{ flex: 1, resize: 'none', minHeight: 42 }}
          rows={2}
          placeholder={activeSessionId ? 'What do you do or say?' : 'Loading session…'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={sending || loadingSession || !activeSessionId}
        />
        <button
          className="yk-btn-primary"
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
