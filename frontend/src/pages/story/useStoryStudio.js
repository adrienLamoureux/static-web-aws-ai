import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createStorySession,
  deleteStorySession,
  generateStoryIllustration,
  getStorySceneAnimationStatus,
  getStorySession,
  listStoryPresets,
  listStorySessions,
  sendStoryMessage,
  startStorySceneAnimation,
} from "../../services/story";
import { STORY_VIEW_MODE } from "./constants";
const DEFAULT_CONTEXT_MODE = "summary+scene";
const DEFAULT_ILLUSTRATION_MODEL = "wai-nsfw-illustrious-v11";
const DEFAULT_ANIMATION_PROMPT = "A lot of movements";
function useStoryStudio(apiBaseUrl = "") {
  const [presets, setPresets] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [messages, setMessages] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [illustrationContextMode, setIllustrationContextMode] =
    useState(DEFAULT_CONTEXT_MODE);
  const [illustrationModel, setIllustrationModel] = useState(
    DEFAULT_ILLUSTRATION_MODEL
  );
  const [animationPrompt, setAnimationPrompt] = useState(
    DEFAULT_ANIMATION_PROMPT
  );
  const [illustrationDebugEnabled, setIllustrationDebugEnabled] = useState(true);
  const [activeSessionDetail, setActiveSessionDetail] = useState(null);
  const [storyDebugEnabled, setStoryDebugEnabled] = useState(false);
  const [storyDebugView, setStoryDebugView] = useState("state");
  const [isForcingIllustration, setIsForcingIllustration] = useState(false);
  const [storyViewMode, setStoryViewMode] = useState(STORY_VIEW_MODE.READER);
  const [sceneLoadingMap, setSceneLoadingMap] = useState({});
  const [sceneAnimationLoadingMap, setSceneAnimationLoadingMap] = useState({});
  const sceneAnimationPollRef = useRef({});
  const resolvedApiBaseUrl = apiBaseUrl || process.env.REACT_APP_API_URL || "";
  const isDirectorMode = storyViewMode === STORY_VIEW_MODE.DIRECTOR;
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [sessions, activeSessionId]
  );
  const activeTurnCount =
    activeSessionDetail?.turnCount ??
    activeSessionDetail?.storyState?.meta?.turn ??
    activeSession?.turnCount ??
    0;
  const readerScenes = useMemo(() => [...scenes].reverse(), [scenes]);
  const featuredScene = readerScenes[0] || null;
  const clearSceneAnimationPoll = useCallback((sceneId) => {
    if (!sceneId) return;
    const timerId = sceneAnimationPollRef.current[sceneId];
    if (timerId) {
      clearTimeout(timerId);
      delete sceneAnimationPollRef.current[sceneId];
    }
  }, []);
  const clearAllSceneAnimationPolls = useCallback(() => {
    Object.keys(sceneAnimationPollRef.current).forEach((sceneId) => {
      clearSceneAnimationPoll(sceneId);
    });
  }, [clearSceneAnimationPoll]);
  const clearActiveSession = useCallback(() => {
    clearAllSceneAnimationPolls();
    setSceneAnimationLoadingMap({});
    setActiveSessionId("");
    setMessages([]);
    setScenes([]);
    setActiveSessionDetail(null);
  }, [clearAllSceneAnimationPolls]);
  const refreshSessions = useCallback(() => {
    if (!resolvedApiBaseUrl) return;
    listStorySessions(resolvedApiBaseUrl)
      .then((data) => {
        setSessions(data.sessions || []);
      })
      .catch((err) => {
        setError(err?.message || "Failed to load sessions.");
      });
  }, [resolvedApiBaseUrl]);
  useEffect(
    () => () => {
      clearAllSceneAnimationPolls();
    },
    [clearAllSceneAnimationPolls]
  );
  const refreshActiveSessionDetail = useCallback(
    async (sessionId) => {
      if (!resolvedApiBaseUrl || !sessionId) return;
      try {
        const data = await getStorySession(resolvedApiBaseUrl, sessionId);
        setActiveSessionDetail(data.session || null);
      } catch (err) {
        setError(err?.message || "Failed to refresh session detail.");
      }
    },
    [resolvedApiBaseUrl]
  );
  const loadSession = useCallback(
    async (sessionId) => {
      if (!resolvedApiBaseUrl || !sessionId) return;
      setIsLoadingSession(true);
      setError("");
      try {
        const data = await getStorySession(resolvedApiBaseUrl, sessionId);
        setActiveSessionId(sessionId);
        setMessages(data.messages || []);
        setScenes(data.scenes || []);
        setActiveSessionDetail(data.session || null);
      } catch (err) {
        setError(err?.message || "Failed to load session.");
      } finally {
        setIsLoadingSession(false);
      }
    },
    [resolvedApiBaseUrl]
  );
  const handleSelectSession = useCallback(
    async (sessionId) => {
      clearAllSceneAnimationPolls();
      setSceneAnimationLoadingMap({});
      if (!sessionId) {
        clearActiveSession();
        return;
      }
      await loadSession(sessionId);
    },
    [clearActiveSession, clearAllSceneAnimationPolls, loadSession]
  );
  const isSceneGenerating = useCallback(
    (sceneId) => Boolean(sceneLoadingMap[sceneId]),
    [sceneLoadingMap]
  );
  const isSceneAnimating = useCallback(
    (sceneId) => Boolean(sceneAnimationLoadingMap[sceneId]),
    [sceneAnimationLoadingMap]
  );
  const triggerIllustration = useCallback(
    async (sessionId, sceneId, options = {}) => {
      if (!resolvedApiBaseUrl || !sessionId || !sceneId) return;
      const shouldDebug =
        typeof options.debug === "boolean"
          ? options.debug
          : illustrationDebugEnabled;
      setSceneLoadingMap((prev) => ({ ...prev, [sceneId]: true }));
      setScenes((prev) =>
        prev.map((scene) =>
          scene.sceneId === sceneId
            ? {
                ...scene,
                status: scene.imageUrl ? scene.status : "generating",
              }
            : scene
        )
      );
      try {
        const illustration = await generateStoryIllustration(
          resolvedApiBaseUrl,
          sessionId,
          {
            sceneId,
            contextMode: options.contextMode || illustrationContextMode,
            model: options.model || illustrationModel,
            ...(options.regenerate ? { regenerate: true } : {}),
          },
          { debug: shouldDebug }
        );
        if (illustration?.imageUrl) {
          const debugData =
            illustration?.identity || illustration?.context || illustration?.replicate
              ? {
                  identity: illustration.identity,
                  context: illustration.context,
                  promptPattern: illustration.promptPattern,
                  replicate: illustration.replicate,
                }
              : null;
          setScenes((prev) =>
            prev.map((scene) =>
              scene.sceneId === sceneId
                ? {
                    ...scene,
                    status: "completed",
                    imageUrl: illustration.imageUrl,
                    imageKey: illustration.imageKey,
                    promptPositive:
                      illustration.prompt?.positive || scene.promptPositive,
                    promptNegative:
                      illustration.prompt?.negative || scene.promptNegative,
                    sceneEnvironment:
                      illustration.context?.sceneEnvironment || scene.sceneEnvironment,
                    sceneAction:
                      illustration.context?.sceneAction || scene.sceneAction,
                    videoKey:
                      illustration.scene?.videoKey ?? illustration.videoKey ?? "",
                    videoUrl:
                      illustration.scene?.videoUrl ?? illustration.videoUrl ?? "",
                    videoStatus: illustration.scene?.videoStatus || "",
                    videoPredictionId:
                      illustration.scene?.videoPredictionId || "",
                    videoPrompt: illustration.scene?.videoPrompt || "",
                    debug: debugData || scene.debug,
                  }
                : scene
            )
          );
        } else {
          setScenes((prev) =>
            prev.map((scene) =>
              scene.sceneId === sceneId
                ? {
                    ...scene,
                    status: "pending",
                  }
                : scene
            )
          );
        }
      } catch (err) {
        setError(err?.message || "Failed to generate illustration.");
        setScenes((prev) =>
          prev.map((scene) =>
            scene.sceneId === sceneId
              ? {
                  ...scene,
                  status: scene.imageUrl ? scene.status : "pending",
                }
              : scene
          )
        );
      } finally {
        setSceneLoadingMap((prev) => {
          const next = { ...prev };
          delete next[sceneId];
          return next;
        });
      }
    },
    [
      illustrationContextMode,
      illustrationModel,
      illustrationDebugEnabled,
      resolvedApiBaseUrl,
      setScenes,
      setSceneLoadingMap,
    ]
  );
  const triggerSceneAnimation = useCallback(
    async (sessionId, sceneId, options = {}) => {
      if (!resolvedApiBaseUrl || !sessionId || !sceneId) return;
      if (sceneAnimationLoadingMap[sceneId]) return;
      const resolvedPrompt =
        (options.prompt || animationPrompt || DEFAULT_ANIMATION_PROMPT).trim() ||
        DEFAULT_ANIMATION_PROMPT;

      const applyAnimationData = (data) => {
        if (!data) return;
        setScenes((prev) =>
          prev.map((scene) =>
            scene.sceneId === sceneId
              ? {
                  ...scene,
                  videoStatus: data.status || scene.videoStatus || "",
                  videoPredictionId:
                    data.predictionId || scene.videoPredictionId || "",
                  videoPrompt: data.prompt || resolvedPrompt,
                  videoKey:
                    data.status === "succeeded"
                      ? data.videoKey || scene.videoKey || ""
                      : data.videoKey || "",
                  videoUrl:
                    data.status === "succeeded"
                      ? data.videoUrl || scene.videoUrl || ""
                      : data.videoUrl || "",
                }
              : scene
          )
        );
      };

      const finishAnimation = () => {
        clearSceneAnimationPoll(sceneId);
        setSceneAnimationLoadingMap((prev) => {
          const next = { ...prev };
          delete next[sceneId];
          return next;
        });
      };

      clearSceneAnimationPoll(sceneId);
      setError("");
      setSceneAnimationLoadingMap((prev) => ({ ...prev, [sceneId]: true }));
      setScenes((prev) =>
        prev.map((scene) =>
          scene.sceneId === sceneId
            ? {
                ...scene,
                videoStatus: "starting",
                videoPrompt: resolvedPrompt,
                videoPredictionId: "",
                videoKey: "",
                videoUrl: "",
              }
            : scene
        )
      );

      const pollAnimation = async (predictionId) => {
        try {
          const statusData = await getStorySceneAnimationStatus(
            resolvedApiBaseUrl,
            sessionId,
            sceneId,
            { predictionId }
          );
          applyAnimationData(statusData);
          const status = statusData?.status || "";
          if (status === "succeeded") {
            finishAnimation();
            return;
          }
          if (status === "failed" || status === "canceled") {
            finishAnimation();
            setError("Scene animation failed.");
            return;
          }
          sceneAnimationPollRef.current[sceneId] = setTimeout(
            () => pollAnimation(predictionId),
            5000
          );
        } catch (err) {
          finishAnimation();
          setError(err?.message || "Failed to animate scene.");
        }
      };

      try {
        const data = await startStorySceneAnimation(
          resolvedApiBaseUrl,
          sessionId,
          sceneId,
          { prompt: resolvedPrompt }
        );
        applyAnimationData(data);
        const status = data?.status || "";
        if (status === "succeeded") {
          finishAnimation();
          return;
        }
        if (status === "failed" || status === "canceled") {
          finishAnimation();
          setError("Scene animation failed.");
          return;
        }
        if (!data?.predictionId) {
          finishAnimation();
          return;
        }
        sceneAnimationPollRef.current[sceneId] = setTimeout(
          () => pollAnimation(data.predictionId),
          5000
        );
      } catch (err) {
        finishAnimation();
        setError(err?.message || "Failed to animate scene.");
      }
    },
    [
      animationPrompt,
      clearSceneAnimationPoll,
      resolvedApiBaseUrl,
      sceneAnimationLoadingMap,
      setScenes,
    ]
  );
  const handleDeleteSession = useCallback(
    async (session) => {
      if (!session?.id) return;
      const confirmed = window.confirm(
        `Delete "${session.title}"? This will remove the session, messages, and scenes.`
      );
      if (!confirmed) return;
      if (!resolvedApiBaseUrl) {
        setError("API base URL is missing. Set it in config.json or .env.");
        return;
      }
      setError("");
      try {
        await deleteStorySession(resolvedApiBaseUrl, session.id);
        setSessions((prev) => prev.filter((item) => item.id !== session.id));
        if (activeSessionId === session.id) {
          clearActiveSession();
        }
      } catch (err) {
        setError(err?.message || "Failed to delete session.");
      }
    },
    [activeSessionId, clearActiveSession, resolvedApiBaseUrl]
  );
  const handleForceIllustration = useCallback(async () => {
    if (!resolvedApiBaseUrl || !activeSessionId) {
      setError("Select or create a story session first.");
      return;
    }
    if (isForcingIllustration) return;
    setIsForcingIllustration(true);
    setError("");
    try {
      const illustration = await generateStoryIllustration(
        resolvedApiBaseUrl,
        activeSessionId,
        {
          forceCurrent: true,
          contextMode: illustrationContextMode,
          model: illustrationModel,
        },
        { debug: illustrationDebugEnabled }
      );
      const scene = illustration?.scene;
      if (!scene?.sceneId) {
        setError("Failed to create a scene from current context.");
        return;
      }
      const debugData =
        illustration?.identity || illustration?.context || illustration?.replicate
          ? {
              identity: illustration.identity,
              context: illustration.context,
              promptPattern: illustration.promptPattern,
              replicate: illustration.replicate,
            }
          : null;
      setScenes((prev) => {
        const exists = prev.some((item) => item.sceneId === scene.sceneId);
        const nextScene = {
          ...scene,
          imageUrl: illustration.imageUrl,
          imageKey: illustration.imageKey,
          status: illustration.imageUrl ? "completed" : scene.status || "pending",
          promptPositive: illustration.prompt?.positive || scene.promptPositive,
          promptNegative: illustration.prompt?.negative || scene.promptNegative,
          sceneEnvironment:
            illustration.context?.sceneEnvironment || scene.sceneEnvironment,
          sceneAction: illustration.context?.sceneAction || scene.sceneAction,
          videoKey: scene.videoKey ?? illustration.videoKey ?? "",
          videoUrl: scene.videoUrl ?? illustration.videoUrl ?? "",
          videoStatus: scene.videoStatus || "",
          videoPredictionId: scene.videoPredictionId || "",
          videoPrompt: scene.videoPrompt || "",
          debug: debugData || scene.debug,
        };
        if (exists) {
          return prev.map((item) =>
            item.sceneId === scene.sceneId ? { ...item, ...nextScene } : item
          );
        }
        return [...prev, nextScene];
      });
      await refreshActiveSessionDetail(activeSessionId);
      refreshSessions();
    } catch (err) {
      setError(err?.message || "Failed to force an illustration.");
    } finally {
      setIsForcingIllustration(false);
    }
  }, [
    activeSessionId,
    illustrationContextMode,
    illustrationModel,
    illustrationDebugEnabled,
    isForcingIllustration,
    refreshActiveSessionDetail,
    refreshSessions,
    resolvedApiBaseUrl,
  ]);
  const handleCreateSession = useCallback(async () => {
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    if (!selectedPresetId) {
      setError("Select a preset to begin.");
      return;
    }
    setStatus("creating");
    setError("");
    try {
      const data = await createStorySession(resolvedApiBaseUrl, {
        presetId: selectedPresetId,
      });
      if (data?.session) {
        setSessions((prev) => [data.session, ...prev]);
        setActiveSessionId(data.session.id);
        setMessages(data.messages || []);
        setScenes(data.scenes || []);
        setActiveSessionDetail(data.session || null);
        const openingScene = data.scenes?.[0];
        if (openingScene?.sceneId) {
          await triggerIllustration(data.session.id, openingScene.sceneId);
        }
      }
    } catch (err) {
      setError(err?.message || "Failed to create session.");
    } finally {
      setStatus("idle");
    }
  }, [resolvedApiBaseUrl, selectedPresetId, triggerIllustration]);
  const handleSendMessage = useCallback(async () => {
    const messageText = input.trim();
    if (!messageText) return;
    if (!resolvedApiBaseUrl || !activeSessionId) {
      setError("Select or create a story session first.");
      return;
    }
    setInput("");
    setStatus("sending");
    setError("");
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
            session.id === activeSessionId
              ? { ...session, turnCount: data.turnCount }
              : session
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
            turnCount:
              typeof data.turnCount === "number" ? data.turnCount : prev.turnCount,
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
          createdAt: new Date().toISOString(),
        };
        setScenes((prev) => [...prev, pendingScene]);
        await triggerIllustration(activeSessionId, data.scene.sceneId, {
          contextMode: illustrationContextMode,
        });
      }
      await refreshActiveSessionDetail(activeSessionId);
      refreshSessions();
    } catch (err) {
      setError(err?.message || "Failed to send message.");
    } finally {
      setStatus("idle");
    }
  }, [
    activeSessionId,
    illustrationContextMode,
    input,
    refreshActiveSessionDetail,
    refreshSessions,
    resolvedApiBaseUrl,
    triggerIllustration,
  ]);
  useEffect(() => {
    if (!resolvedApiBaseUrl) return;
    listStoryPresets(resolvedApiBaseUrl)
      .then((data) => {
        setPresets(data.presets || []);
        setSelectedPresetId((prev) => prev || data.presets?.[0]?.id || "");
      })
      .catch((err) => {
        setError(err?.message || "Failed to load presets.");
      });
  }, [resolvedApiBaseUrl]);
  useEffect(() => {
    if (!resolvedApiBaseUrl) return;
    refreshSessions();
  }, [resolvedApiBaseUrl, refreshSessions]);
  return {
    presets,
    sessions,
    activeSessionId,
    messages,
    scenes,
    input,
    status,
    error,
    selectedPresetId,
    isLoadingSession,
    illustrationContextMode,
    illustrationModel,
    animationPrompt,
    illustrationDebugEnabled,
    activeSessionDetail,
    storyDebugEnabled,
    storyDebugView,
    isForcingIllustration,
    storyViewMode,
    isDirectorMode,
    activeSession,
    activeTurnCount,
    readerScenes,
    featuredScene,
    setInput,
    setSelectedPresetId,
    setIllustrationContextMode,
    setIllustrationModel,
    setAnimationPrompt,
    setIllustrationDebugEnabled,
    setStoryDebugEnabled,
    setStoryDebugView,
    setStoryViewMode,
    refreshSessions,
    handleSelectSession,
    handleDeleteSession,
    handleCreateSession,
    handleSendMessage,
    handleForceIllustration,
    triggerIllustration,
    triggerSceneAnimation,
    isSceneGenerating,
    isSceneAnimating,
  };
}
export default useStoryStudio;
