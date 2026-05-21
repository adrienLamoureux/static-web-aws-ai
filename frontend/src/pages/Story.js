import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useConfig } from "../contexts/ConfigContext";
import { useMusic } from "../contexts/MusicContext";
import {
  listStoryPresets,
  listStorySessions,
  getStorySession,
  generateStoryIllustration,
  switchSessionLora,
} from "../services/story";
import { listLoraProfilesForCharacter } from "../services/lora";
import { listCharacters } from "../services/characters";
import useSceneMedia from "./story/useSceneMedia";
import useStoryActions from "./story/useStoryActions";
import StorySessionList from "./story/StorySessionList";
import StoryComposer from "./story/StoryComposer";
import StoryLoraSwitcher from "./story/StoryLoraSwitcher";
import StoryPresetPicker from "./story/StoryPresetPicker";
import StoryChatMessages from "./story/StoryChatMessages";
import AgentIntentBanner from "../components/sakura/agent/AgentIntentBanner";

export default function Story() {
  const { apiBaseUrl } = useConfig();
  const location = useLocation();
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState("");
  const [presets, setPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  // scenes: map of sceneId → { sceneId, title, description, imageUrl, illustrating, error }
  const [scenes, setScenes] = useState({});
  // Character + LoRA state (bound to active session)
  const [sessionCharacterId, setSessionCharacterId] = useState(null);
  const [sessionLoraProfileId, setSessionLoraProfileId] = useState(null);
  const [sessionLoraProfiles, setSessionLoraProfiles] = useState([]);
  const [characterName, setCharacterName] = useState("");
  const [showLoraSwitcher, setShowLoraSwitcher] = useState(false);
  const [switchingLora, setSwitchingLora] = useState(false);
  // All characters (for name lookup)
  const [allCharacters, setAllCharacters] = useState([]);
  // Set of message indices currently waiting for an on-demand illustration
  const [illustratingMessages, setIllustratingMessages] = useState(new Set());
  // Hint from companion chat (pre-fills the preset picker)
  const [companionHint, setCompanionHint] = useState(null);
  const { triggerAnimation, triggerMusic, getSceneMedia, clearAllPolls, mediaMap } =
    useSceneMedia(apiBaseUrl);
  const { pushTracks, playTrack } = useMusic();
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // When scene music generation completes, push track to the music dock and auto-play it
  useEffect(() => {
    for (const [sceneId, media] of Object.entries(mediaMap)) {
      if (media?.musicStatus === "succeeded" && media?.musicUrl) {
        const scene = scenes[sceneId];
        const track = {
          url: media.musicUrl,
          key: media.musicKey || media.musicUrl,
          source: "scene",
          title: scene?.title || "Scene Music",
          mood: media.musicMood || scene?.musicMood || "",
          energy: media.musicEnergy || scene?.musicEnergy || "",
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
      .then((data) => setAllCharacters(data?.characters || []))
      .catch(() => {});
  }, [apiBaseUrl]);

  // Load presets once
  useEffect(() => {
    if (!apiBaseUrl) return;
    listStoryPresets(apiBaseUrl)
      .then((data) => {
        const list = data?.presets || [];
        setPresets(list);
        if (list.length > 0) setSelectedPresetId(list[0].id);
      })
      .catch(() => {});
  }, [apiBaseUrl]);

  const mergeScenes = useCallback((incoming = []) => {
    if (!incoming.length) return;
    setScenes((prev) => {
      const next = { ...prev };
      for (const s of incoming) {
        if (s?.sceneId) next[s.sceneId] = { ...next[s.sceneId], ...s };
      }
      return next;
    });
  }, []);

  const selectSession = useCallback(
    async (sessionId) => {
      if (!sessionId || !apiBaseUrl) return;
      clearAllPolls();
      setActiveSessionId(sessionId);
      setLoadingSession(true);
      setMessages([]);
      setIllustratingMessages(new Set());
      setError("");
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
        const rawScenes = data?.scenes || session?.scenes || [];

        // Populate scenes map (includes signed imageUrl, videoUrl, musicUrl)
        mergeScenes(rawScenes);

        // Push any already-generated music tracks from this session to the dock
        const musicTracks = rawScenes
          .filter((s) => s?.musicUrl)
          .map((s) => ({
            url: s.musicUrl,
            key: s.musicKey || s.musicUrl,
            source: "scene",
            title: s.title || "Scene Music",
            mood: s.musicMood || "",
            energy: s.musicEnergy || "",
            tempoBpm: s.musicTempoBpm || null,
            tags: s.musicTags || [],
            updatedAt: s.createdAt || "",
          }));
        if (musicTracks.length > 0) pushTracks(musicTracks);

        // Build message list preserving createdAt for scene matching below
        const msgs = rawMessages.map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          text: m.content || m.text || "",
          sceneId: m.sceneId || null,
          createdAt: m.createdAt || null,
        }));

        // The DB does not store sceneId on messages — match chronologically:
        // sort scenes by createdAt, then pair each scene with the nearest
        // assistant message that doesn't already have a sceneId.
        if (rawScenes.length > 0) {
          const sorted = [...rawScenes]
            .filter((s) => s?.sceneId)
            .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
          for (const scene of sorted) {
            const sceneTime = new Date(scene.createdAt || 0).getTime();
            let bestIdx = -1;
            for (let k = 0; k < msgs.length; k++) {
              if (msgs[k].role === "assistant" && !msgs[k].sceneId) {
                const msgTime = new Date(msgs[k].createdAt || 0).getTime();
                if (msgTime <= sceneTime + 10000) bestIdx = k;
              }
            }
            if (bestIdx !== -1) msgs[bestIdx] = { ...msgs[bestIdx], sceneId: scene.sceneId };
          }
        }

        if (msgs.length === 0) {
          const opening = session?.opening || session?.preset?.opening || null;
          setMessages([
            {
              role: "assistant",
              text: opening || "Welcome to your story. Describe what you do or say.",
              sceneId: null,
            },
          ]);
        } else {
          setMessages(msgs);
        }
      } catch (e) {
        setError(e?.message || "Failed to load session.");
      } finally {
        setLoadingSession(false);
      }
    },
    [apiBaseUrl, mergeScenes, clearAllPolls, pushTracks]
  );

  // Load LoRA profiles + resolve character name when session character changes
  useEffect(() => {
    if (!apiBaseUrl || !sessionCharacterId) {
      setSessionLoraProfiles([]);
      setCharacterName("");
      return;
    }
    const found = allCharacters.find((c) => c.id === sessionCharacterId);
    setCharacterName(found?.name || sessionCharacterId);
    listLoraProfilesForCharacter(apiBaseUrl, sessionCharacterId)
      .then((data) => setSessionLoraProfiles(data?.items || data?.profiles || []))
      .catch(() => setSessionLoraProfiles([]));
  }, [apiBaseUrl, sessionCharacterId, allCharacters]);

  // Handle LoRA switch mid-session
  const handleSwitchLora = useCallback(
    async (loraProfileId) => {
      if (!activeSessionId || !apiBaseUrl) return;
      setSwitchingLora(true);
      const prevId = sessionLoraProfileId;
      try {
        await switchSessionLora(apiBaseUrl, activeSessionId, loraProfileId);
        setSessionLoraProfileId(loraProfileId || null);
        setShowLoraSwitcher(false);
        const profile = sessionLoraProfiles.find((p) => (p.id || p.characterId) === loraProfileId);
        const profileName = profile?.name || profile?.displayName || loraProfileId || "None";
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            text: loraProfileId
              ? `LoRA profile switched to "${profileName}"`
              : "LoRA profile cleared (no LoRA)",
            sceneId: null,
          },
        ]);
      } catch {
        setSessionLoraProfileId(prevId);
      } finally {
        setSwitchingLora(false);
      }
    },
    [apiBaseUrl, activeSessionId, sessionLoraProfileId, sessionLoraProfiles]
  );

  // Bootstrap: load sessions, show preset picker if none exist
  const bootstrapSessions = useCallback(async () => {
    if (!apiBaseUrl) return;
    setError("");
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
      setError(e?.message || "Failed to load sessions.");
    }
  }, [apiBaseUrl, selectSession]);

  useEffect(() => {
    if (apiBaseUrl) bootstrapSessions();
  }, [apiBaseUrl, bootstrapSessions]);

  // Open preset picker with companion-suggested values when arriving from chat
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const companionTitle = params.get("companionTitle");
    const companionGenre = params.get("companionGenre");
    if (companionTitle || companionGenre) {
      setShowPresetPicker(true);
      setCompanionHint({ title: companionTitle || "", genre: companionGenre || "" });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { handleCreateSession, sendMessage } = useStoryActions({
    apiBaseUrl,
    presets,
    selectedPresetId,
    selectSession,
    mergeScenes,
    setCreatingSession,
    setError,
    setSessions,
    setShowPresetPicker,
    setScenes,
    setMessages,
    input,
    setInput,
    setSending,
    activeSessionId,
  });

  const handleIllustrate = useCallback(
    async (sceneId) => {
      if (!sceneId || !apiBaseUrl) return;
      setScenes((prev) => ({
        ...prev,
        [sceneId]: { ...prev[sceneId], illustrating: true, illustrationError: null },
      }));
      try {
        const data = await generateStoryIllustration(apiBaseUrl, activeSessionId, { sceneId });
        setScenes((prev) => ({
          ...prev,
          [sceneId]: {
            ...prev[sceneId],
            illustrating: false,
            imageUrl: data?.imageUrl || prev[sceneId]?.imageUrl,
          },
        }));
      } catch (e) {
        setScenes((prev) => ({
          ...prev,
          [sceneId]: {
            ...prev[sceneId],
            illustrating: false,
            illustrationError: e?.message || "Illustration failed.",
          },
        }));
      }
    },
    [apiBaseUrl, activeSessionId]
  );

  const handleIllustrateMessage = useCallback(
    async (msgIndex) => {
      if (!activeSessionId || !apiBaseUrl) return;
      setIllustratingMessages((prev) => new Set([...prev, msgIndex]));
      try {
        const data = await generateStoryIllustration(apiBaseUrl, activeSessionId, {
          forceCurrent: true,
        });
        const scene = data?.scene || null;
        const sceneId = data?.sceneId || scene?.sceneId || null;
        if (!sceneId) return;
        mergeScenes([{ ...(scene || {}), sceneId, imageUrl: data?.imageUrl || scene?.imageUrl }]);
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[msgIndex] && !updated[msgIndex].sceneId) {
            updated[msgIndex] = { ...updated[msgIndex], sceneId };
          }
          return updated;
        });
      } catch {
        // Non-fatal — button reappears automatically
      } finally {
        setIllustratingMessages((prev) => {
          const next = new Set(prev);
          next.delete(msgIndex);
          return next;
        });
      }
    },
    [apiBaseUrl, activeSessionId, mergeScenes]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 112px)" }}>
      <AgentIntentBanner />
      {/* Header with session selector */}
      <div className="skr-page-header" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <h2 className="skr-page-title">Storytelling Studio</h2>
            <p className="skr-page-subtitle">AI-assisted narrative creation</p>
          </div>
          <StorySessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={selectSession}
          />
          <button
            className="skr-btn-secondary"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => setShowPresetPicker(true)}
          >
            + New Session
          </button>
        </div>
      </div>

      {error && <p style={{ fontSize: 12, color: "#ef4444", marginBottom: 8 }}>{error}</p>}

      <StoryLoraSwitcher
        activeSessionId={activeSessionId}
        sessionCharacterId={sessionCharacterId}
        sessionLoraProfileId={sessionLoraProfileId}
        sessionLoraProfiles={sessionLoraProfiles}
        characterName={characterName}
        showLoraSwitcher={showLoraSwitcher}
        setShowLoraSwitcher={setShowLoraSwitcher}
        onSwitchLora={handleSwitchLora}
        switchingLora={switchingLora}
      />

      {showPresetPicker && (
        <StoryPresetPicker
          presets={presets}
          selectedPresetId={selectedPresetId}
          setSelectedPresetId={setSelectedPresetId}
          companionHint={companionHint}
          sessions={sessions}
          creatingSession={creatingSession}
          onCreateSession={handleCreateSession}
          onCancel={() => setShowPresetPicker(false)}
        />
      )}

      <StoryChatMessages
        messages={messages}
        loadingSession={loadingSession}
        scenes={scenes}
        getSceneMedia={getSceneMedia}
        onIllustrate={handleIllustrate}
        onAnimate={triggerAnimation}
        onMusic={triggerMusic}
        onPlayInDock={playTrack}
        activeSessionId={activeSessionId}
        illustratingMessages={illustratingMessages}
        onIllustrateMessage={handleIllustrateMessage}
        sending={sending}
        bottomRef={bottomRef}
      />

      <StoryComposer
        input={input}
        onInputChange={setInput}
        onSend={sendMessage}
        isLoading={loadingSession}
        isSending={sending}
        activeSessionId={activeSessionId}
      />
    </div>
  );
}
