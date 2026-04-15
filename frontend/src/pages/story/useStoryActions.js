import { useCallback } from "react";
import {
  createStorySession,
  generateStoryIllustration,
  sendStoryMessage,
} from "../../services/story";

/**
 * Encapsulates the three primary async actions for the Story page:
 *   - autoIllustrateOpening  (fires after session creation)
 *   - handleCreateSession    (creates a new session + triggers opening illustration)
 *   - sendMessage            (sends a user turn and appends the reply)
 *
 * All state setters are passed in as stable references (from useState/useCallback)
 * so this hook has no stale-closure risk.
 */
export default function useStoryActions({
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
}) {
  const autoIllustrateOpening = useCallback(
    async (sessionId, knownSceneId = null) => {
      if (!sessionId || !apiBaseUrl) return;
      const payload = knownSceneId ? { sceneId: knownSceneId } : { forceCurrent: true };
      try {
        const data = await generateStoryIllustration(apiBaseUrl, sessionId, payload);
        const imageUrl = data?.imageUrl || null;
        const scene = data?.scene || null;
        const sceneId = data?.sceneId || scene?.sceneId || null;
        if (!sceneId) return;
        mergeScenes([
          { ...(scene || {}), sceneId, imageUrl: imageUrl || scene?.imageUrl, illustrating: false },
        ]);
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.role === "assistant" && !m.sceneId);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = { ...updated[idx], sceneId };
          return updated;
        });
      } catch {
        setScenes((prev) => {
          const updated = { ...prev };
          for (const [key, val] of Object.entries(updated)) {
            if (val?.illustrating) updated[key] = { ...val, illustrating: false };
          }
          return updated;
        });
      }
    },
    [apiBaseUrl, mergeScenes, setMessages, setScenes]
  );

  const handleCreateSession = useCallback(async () => {
    if (!apiBaseUrl || !selectedPresetId) return;
    setCreatingSession(true);
    setError("");
    try {
      const preset = presets.find((p) => p.id === selectedPresetId);
      const payload = { presetId: selectedPresetId };
      if (preset?.defaultCharacterId) payload.characterId = preset.defaultCharacterId;
      const created = await createStorySession(apiBaseUrl, payload);
      const newSession = created?.session || created;
      const sessionId = newSession?.id || newSession?.sessionId;
      if (sessionId) {
        const normalized = { ...newSession, sessionId };
        setSessions((prev) => [normalized, ...prev]);
        setShowPresetPicker(false);
        await selectSession(sessionId);
        const openingScenes = Array.isArray(created?.scenes) ? created.scenes : [];
        const openingSceneId = openingScenes[0]?.sceneId;
        if (openingSceneId) {
          mergeScenes(openingScenes);
          setScenes((prev) => ({
            ...prev,
            [openingSceneId]: { ...(prev[openingSceneId] || openingScenes[0]), illustrating: true },
          }));
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.role === "assistant" && !m.sceneId);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = { ...updated[idx], sceneId: openingSceneId };
            return updated;
          });
        }
        autoIllustrateOpening(sessionId, openingSceneId || null);
      }
    } catch (e) {
      setError(e?.message || "Failed to create session.");
    } finally {
      setCreatingSession(false);
    }
  }, [
    apiBaseUrl,
    selectedPresetId,
    presets,
    selectSession,
    mergeScenes,
    setCreatingSession,
    setError,
    setSessions,
    setShowPresetPicker,
    setScenes,
    setMessages,
    autoIllustrateOpening,
  ]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || !activeSessionId) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text, sceneId: null }]);
    setSending(true);
    setError("");
    try {
      const data = await sendStoryMessage(apiBaseUrl, activeSessionId, { content: text });
      const reply =
        data?.assistant?.content || data?.reply || data?.message || data?.content || "…";
      const scene = data?.scene || null;
      if (scene?.sceneId) mergeScenes([scene]);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: reply, sceneId: scene?.sceneId || null },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Sorry, something went wrong. Please try again.",
          sceneId: null,
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [
    apiBaseUrl,
    activeSessionId,
    input,
    setInput,
    setMessages,
    setSending,
    setError,
    mergeScenes,
  ]);

  return { handleCreateSession, sendMessage };
}
