import { useCallback, useState } from "react";
import {
  createStorySession,
  deleteStorySession,
  getStorySession,
  listStorySessions,
  sendStoryMessage,
} from "../../services/story";

/**
 * Manages session CRUD and message sending.
 *
 * Cross-hook dependencies that change over time are passed as stable refs
 * (objects with a `.current` property) to avoid stale closures.
 */
function useStorySession({
  resolvedApiBaseUrl,
  selectedPresetId,
  illustrationContextMode,
  normalizeScene,
  // Refs (always up-to-date .current):
  triggerIllustrationRef, // { current: fn }
  clearAllSceneAnimationPollsRef, // { current: fn }
  clearAllSceneMusicPollsRef, // { current: fn }
  setSceneAnimationLoadingMapRef, // { current: fn }
  setSceneMusicLoadingMapRef, // { current: fn }
  setSceneLibrarySelectionMap, // setter (stable — from useState)
  setSceneManualSelectionMap, // setter (stable — from useState)
  setScenes, // setter (stable — from useState)
  setErrorRef, // { current: fn }
}) {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle");
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [activeSessionDetail, setActiveSessionDetail] = useState(null);

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  const clearActiveSession = useCallback(() => {
    clearAllSceneAnimationPollsRef.current();
    clearAllSceneMusicPollsRef.current();
    setSceneAnimationLoadingMapRef.current({});
    setSceneMusicLoadingMapRef.current({});
    setSceneLibrarySelectionMap({});
    setSceneManualSelectionMap({});
    setActiveSessionId("");
    setMessages([]);
    setScenes([]);
    setActiveSessionDetail(null);
  }, [
    clearAllSceneAnimationPollsRef,
    clearAllSceneMusicPollsRef,
    setSceneAnimationLoadingMapRef,
    setSceneMusicLoadingMapRef,
    setSceneLibrarySelectionMap,
    setSceneManualSelectionMap,
    setScenes,
  ]);

  // ------------------------------------------------------------------
  // Session list
  // ------------------------------------------------------------------

  const refreshSessions = useCallback(() => {
    if (!resolvedApiBaseUrl) return;
    listStorySessions(resolvedApiBaseUrl)
      .then((data) => {
        setSessions(data.sessions || []);
      })
      .catch((err) => {
        setErrorRef.current(err?.message || "Failed to load sessions.");
      });
  }, [resolvedApiBaseUrl, setErrorRef]);

  const refreshActiveSessionDetail = useCallback(
    async (sessionId) => {
      if (!resolvedApiBaseUrl || !sessionId) return;
      try {
        const data = await getStorySession(resolvedApiBaseUrl, sessionId);
        setActiveSessionDetail(data.session || null);
      } catch (err) {
        setErrorRef.current(err?.message || "Failed to refresh session detail.");
      }
    },
    [resolvedApiBaseUrl, setErrorRef]
  );

  // ------------------------------------------------------------------
  // Load / select session
  // ------------------------------------------------------------------

  const loadSession = useCallback(
    async (sessionId) => {
      if (!resolvedApiBaseUrl || !sessionId) return;
      setIsLoadingSession(true);
      setErrorRef.current("");
      try {
        const data = await getStorySession(resolvedApiBaseUrl, sessionId);
        const nextScenes = (data.scenes || []).map((scene) => normalizeScene(scene));
        const initialSelection = nextScenes.reduce((acc, scene) => {
          if (scene.sceneId) acc[scene.sceneId] = scene.musicLibraryTrackId || "";
          return acc;
        }, {});
        const initialManualSelection = nextScenes.reduce((acc, scene) => {
          if (scene.sceneId) acc[scene.sceneId] = Boolean(scene.musicLibraryTrackId);
          return acc;
        }, {});
        setActiveSessionId(sessionId);
        setMessages(data.messages || []);
        setScenes(nextScenes);
        setSceneLibrarySelectionMap(initialSelection);
        setSceneManualSelectionMap(initialManualSelection);
        setActiveSessionDetail(data.session || null);
      } catch (err) {
        setErrorRef.current(err?.message || "Failed to load session.");
      } finally {
        setIsLoadingSession(false);
      }
    },
    [
      normalizeScene,
      resolvedApiBaseUrl,
      setSceneLibrarySelectionMap,
      setSceneManualSelectionMap,
      setScenes,
      setErrorRef,
    ]
  );

  const handleSelectSession = useCallback(
    async (sessionId) => {
      clearAllSceneAnimationPollsRef.current();
      clearAllSceneMusicPollsRef.current();
      setSceneAnimationLoadingMapRef.current({});
      setSceneMusicLoadingMapRef.current({});
      if (!sessionId) {
        clearActiveSession();
        return;
      }
      await loadSession(sessionId);
    },
    [
      clearActiveSession,
      clearAllSceneAnimationPollsRef,
      clearAllSceneMusicPollsRef,
      loadSession,
      setSceneAnimationLoadingMapRef,
      setSceneMusicLoadingMapRef,
    ]
  );

  // ------------------------------------------------------------------
  // Delete session
  // ------------------------------------------------------------------

  const handleDeleteSession = useCallback(
    async (session) => {
      if (!session?.id) return;
      const confirmed = window.confirm(
        `Delete "${session.title}"? This will remove the session, messages, and scenes.`
      );
      if (!confirmed) return;
      if (!resolvedApiBaseUrl) {
        setErrorRef.current("API base URL is missing. Set it in config.json or .env.");
        return;
      }
      setErrorRef.current("");
      try {
        await deleteStorySession(resolvedApiBaseUrl, session.id);
        setSessions((prev) => prev.filter((item) => item.id !== session.id));
        if (activeSessionId === session.id) {
          clearActiveSession();
        }
      } catch (err) {
        setErrorRef.current(err?.message || "Failed to delete session.");
      }
    },
    [activeSessionId, clearActiveSession, resolvedApiBaseUrl, setErrorRef]
  );

  // ------------------------------------------------------------------
  // Create session
  // ------------------------------------------------------------------

  const handleCreateSession = useCallback(async () => {
    if (!resolvedApiBaseUrl) {
      setErrorRef.current("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    if (!selectedPresetId) {
      setErrorRef.current("Select a preset to begin.");
      return;
    }
    setStatus("creating");
    setErrorRef.current("");
    try {
      const data = await createStorySession(resolvedApiBaseUrl, {
        presetId: selectedPresetId,
      });
      if (data?.session) {
        const nextScenes = (data.scenes || []).map((scene) => normalizeScene(scene));
        const initialSelection = nextScenes.reduce((acc, scene) => {
          if (scene.sceneId) acc[scene.sceneId] = scene.musicLibraryTrackId || "";
          return acc;
        }, {});
        const initialManualSelection = nextScenes.reduce((acc, scene) => {
          if (scene.sceneId) acc[scene.sceneId] = Boolean(scene.musicLibraryTrackId);
          return acc;
        }, {});
        setSessions((prev) => [data.session, ...prev]);
        setActiveSessionId(data.session.id);
        setMessages(data.messages || []);
        setScenes(nextScenes);
        setSceneLibrarySelectionMap(initialSelection);
        setSceneManualSelectionMap(initialManualSelection);
        setActiveSessionDetail(data.session || null);
        const openingScene = data.scenes?.[0];
        if (openingScene?.sceneId) {
          await triggerIllustrationRef.current(data.session.id, openingScene.sceneId, {
            contextMode: "scene",
          });
        }
      }
    } catch (err) {
      setErrorRef.current(err?.message || "Failed to create session.");
    } finally {
      setStatus("idle");
    }
  }, [
    normalizeScene,
    resolvedApiBaseUrl,
    selectedPresetId,
    setSceneLibrarySelectionMap,
    setSceneManualSelectionMap,
    setScenes,
    setErrorRef,
    triggerIllustrationRef,
  ]);

  // ------------------------------------------------------------------
  // Send message
  // ------------------------------------------------------------------

  const handleSendMessage = useCallback(async () => {
    const messageText = input.trim();
    if (!messageText) return;
    if (!resolvedApiBaseUrl || !activeSessionId) {
      setErrorRef.current("Select or create a story session first.");
      return;
    }
    setInput("");
    setStatus("sending");
    setErrorRef.current("");
    const userMessage = {
      role: "user",
      content: messageText,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    try {
      const data = await sendStoryMessage(resolvedApiBaseUrl, activeSessionId, {
        content: messageText,
      });
      if (data?.assistant?.content) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.assistant.content,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      if (typeof data.turnCount === "number") {
        setSessions((prev) =>
          prev.map((session) =>
            session.id === activeSessionId ? { ...session, turnCount: data.turnCount } : session
          )
        );
      }
      if (data?.storyState || data?.lorebook) {
        setActiveSessionDetail((prev) => {
          if (!prev) {
            return {
              id: activeSessionId,
              storyState: data.storyState || null,
              lorebook: data.lorebook || null,
              turnCount: typeof data.turnCount === "number" ? data.turnCount : 0,
            };
          }
          return {
            ...prev,
            storyState: data.storyState || prev.storyState,
            lorebook: data.lorebook || prev.lorebook,
            turnCount: typeof data.turnCount === "number" ? data.turnCount : prev.turnCount,
          };
        });
      }
      if (data?.scene?.sceneId) {
        const pendingScene = {
          ...data.scene,
          status: "pending",
          videoKey: data.scene?.videoKey || "",
          videoUrl: data.scene?.videoUrl || "",
          videoStatus: data.scene?.videoStatus || "",
          videoPredictionId: data.scene?.videoPredictionId || "",
          videoPrompt: data.scene?.videoPrompt || "",
          musicKey: data.scene?.musicKey || "",
          musicUrl: data.scene?.musicUrl || "",
          musicStatus: data.scene?.musicStatus || "",
          musicPredictionId: data.scene?.musicPredictionId || "",
          musicPrompt: data.scene?.musicPrompt || "",
          musicModelId: data.scene?.musicModelId || "",
          musicMood: data.scene?.musicMood || "",
          musicEnergy: data.scene?.musicEnergy || "",
          musicTempoBpm:
            typeof data.scene?.musicTempoBpm === "number" ? data.scene.musicTempoBpm : null,
          musicTags: Array.isArray(data.scene?.musicTags) ? data.scene.musicTags : [],
          musicLibraryTrackId: data.scene?.musicLibraryTrackId || "",
          createdAt: new Date().toISOString(),
        };
        setScenes((prev) => [...prev, normalizeScene(pendingScene)]);
        setSceneLibrarySelectionMap((prev) => ({
          ...prev,
          [data.scene.sceneId]: data.scene?.musicLibraryTrackId || "",
        }));
        setSceneManualSelectionMap((prev) => ({
          ...prev,
          [data.scene.sceneId]: Boolean(data.scene?.musicLibraryTrackId),
        }));
        await triggerIllustrationRef.current(activeSessionId, data.scene.sceneId, {
          contextMode: illustrationContextMode,
        });
      }
      await refreshActiveSessionDetail(activeSessionId);
      refreshSessions();
    } catch (err) {
      setErrorRef.current(err?.message || "Failed to send message.");
    } finally {
      setStatus("idle");
    }
  }, [
    activeSessionId,
    illustrationContextMode,
    input,
    normalizeScene,
    refreshActiveSessionDetail,
    refreshSessions,
    resolvedApiBaseUrl,
    setSceneLibrarySelectionMap,
    setSceneManualSelectionMap,
    setScenes,
    setErrorRef,
    triggerIllustrationRef,
  ]);

  return {
    // State
    sessions,
    setSessions,
    activeSessionId,
    setActiveSessionId,
    messages,
    setMessages,
    input,
    setInput,
    status,
    setStatus,
    isLoadingSession,
    activeSessionDetail,
    setActiveSessionDetail,
    // Operations
    clearActiveSession,
    refreshSessions,
    refreshActiveSessionDetail,
    loadSession,
    handleSelectSession,
    handleDeleteSession,
    handleCreateSession,
    handleSendMessage,
  };
}

export default useStorySession;
