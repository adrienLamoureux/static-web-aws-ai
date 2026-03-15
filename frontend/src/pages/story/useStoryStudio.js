import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createStorySession,
  deleteStorySession,
  generateStoryIllustration,
  getStorySceneAnimationStatus,
  getStorySceneMusicStatus,
  getStorySession,
  listStoryMusicLibrary,
  listStoryPresets,
  listStorySessions,
  recommendStorySceneMusic,
  saveStorySceneMusicToLibrary,
  selectStorySceneLibraryTrack,
  sendStoryMessage,
  startStorySceneAnimation,
  startStorySceneMusic,
} from "../../services/story";
import { STORY_VIEW_MODE } from "./constants";
import {
  DEFAULT_ANIMATION_PROMPT,
  DEFAULT_CONTEXT_MODE,
  DEFAULT_ILLUSTRATION_MODEL,
  DEFAULT_MUSIC_PROMPT,
  normalizeStoryScene,
} from "./storyStudioConfig";
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
  const [musicPrompt, setMusicPrompt] = useState(DEFAULT_MUSIC_PROMPT);
  const [illustrationDebugEnabled, setIllustrationDebugEnabled] = useState(true);
  const [activeSessionDetail, setActiveSessionDetail] = useState(null);
  const [storyDebugEnabled, setStoryDebugEnabled] = useState(false);
  const [storyDebugView, setStoryDebugView] = useState("state");
  const [isForcingIllustration, setIsForcingIllustration] = useState(false);
  const [storyViewMode, setStoryViewMode] = useState(STORY_VIEW_MODE.READER);
  const [sceneLoadingMap, setSceneLoadingMap] = useState({});
  const [sceneAnimationLoadingMap, setSceneAnimationLoadingMap] = useState({});
  const [sceneMusicLoadingMap, setSceneMusicLoadingMap] = useState({});
  const [musicLibrary, setMusicLibrary] = useState([]);
  const [sceneLibrarySelectionMap, setSceneLibrarySelectionMap] = useState({});
  const [sceneManualSelectionMap, setSceneManualSelectionMap] = useState({});
  const [activeMusicTrackKey, setActiveMusicTrackKey] = useState("");
  const [musicAutoPlayRequest, setMusicAutoPlayRequest] = useState(null);
  const sceneAnimationPollRef = useRef({});
  const sceneMusicPollRef = useRef({});
  const sceneManualSelectionRef = useRef({});
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
  const normalizeScene = normalizeStoryScene;
  const clearSceneAnimationPoll = useCallback((sceneId) => {
    if (!sceneId) return;
    const timerId = sceneAnimationPollRef.current[sceneId];
    if (timerId) {
      clearTimeout(timerId);
      delete sceneAnimationPollRef.current[sceneId];
    }
  }, []);
  const clearSceneMusicPoll = useCallback((sceneId) => {
    if (!sceneId) return;
    const timerId = sceneMusicPollRef.current[sceneId];
    if (timerId) {
      clearTimeout(timerId);
      delete sceneMusicPollRef.current[sceneId];
    }
  }, []);
  const clearAllSceneAnimationPolls = useCallback(() => {
    Object.keys(sceneAnimationPollRef.current).forEach((sceneId) => {
      clearSceneAnimationPoll(sceneId);
    });
  }, [clearSceneAnimationPoll]);
  const clearAllSceneMusicPolls = useCallback(() => {
    Object.keys(sceneMusicPollRef.current).forEach((sceneId) => {
      clearSceneMusicPoll(sceneId);
    });
  }, [clearSceneMusicPoll]);
  const clearActiveSession = useCallback(() => {
    clearAllSceneAnimationPolls();
    clearAllSceneMusicPolls();
    setSceneAnimationLoadingMap({});
    setSceneMusicLoadingMap({});
    setSceneLibrarySelectionMap({});
    setSceneManualSelectionMap({});
    setActiveMusicTrackKey("");
    setMusicAutoPlayRequest(null);
    setActiveSessionId("");
    setMessages([]);
    setScenes([]);
    setActiveSessionDetail(null);
  }, [clearAllSceneAnimationPolls, clearAllSceneMusicPolls]);
  useEffect(() => {
    sceneManualSelectionRef.current = sceneManualSelectionMap;
  }, [sceneManualSelectionMap]);
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
      clearAllSceneMusicPolls();
    },
    [clearAllSceneAnimationPolls, clearAllSceneMusicPolls]
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
        const nextScenes = (data.scenes || []).map((scene) => normalizeScene(scene));
        const initialSelection = nextScenes.reduce((acc, scene) => {
          if (scene.sceneId) {
            acc[scene.sceneId] = scene.musicLibraryTrackId || "";
          }
          return acc;
        }, {});
        const initialManualSelection = nextScenes.reduce((acc, scene) => {
          if (scene.sceneId) {
            acc[scene.sceneId] = Boolean(scene.musicLibraryTrackId);
          }
          return acc;
        }, {});
        setActiveSessionId(sessionId);
        setMessages(data.messages || []);
        setScenes(nextScenes);
        setSceneLibrarySelectionMap(initialSelection);
        setSceneManualSelectionMap(initialManualSelection);
        setActiveSessionDetail(data.session || null);
      } catch (err) {
        setError(err?.message || "Failed to load session.");
      } finally {
        setIsLoadingSession(false);
      }
    },
    [normalizeScene, resolvedApiBaseUrl]
  );
  const handleSelectSession = useCallback(
    async (sessionId) => {
      clearAllSceneAnimationPolls();
      clearAllSceneMusicPolls();
      setSceneAnimationLoadingMap({});
      setSceneMusicLoadingMap({});
      if (!sessionId) {
        clearActiveSession();
        return;
      }
      await loadSession(sessionId);
    },
    [clearActiveSession, clearAllSceneAnimationPolls, clearAllSceneMusicPolls, loadSession]
  );
  const isSceneGenerating = useCallback(
    (sceneId) => Boolean(sceneLoadingMap[sceneId]),
    [sceneLoadingMap]
  );
  const isSceneAnimating = useCallback(
    (sceneId) => Boolean(sceneAnimationLoadingMap[sceneId]),
    [sceneAnimationLoadingMap]
  );
  const isSceneGeneratingMusic = useCallback(
    (sceneId) => Boolean(sceneMusicLoadingMap[sceneId]),
    [sceneMusicLoadingMap]
  );
  const recommendLibraryTrackForScene = useCallback(
    async (sessionId, sceneId) => {
      if (!resolvedApiBaseUrl || !sessionId || !sceneId) return;
      try {
        const data = await recommendStorySceneMusic(
          resolvedApiBaseUrl,
          sessionId,
          sceneId
        );
        const recommendedTrackId = String(data?.recommendedTrackId || "");
        const recommendationMethod = String(data?.recommendationMethod || "");
        const recommendationScore = Number(data?.recommendationScore);
        const normalizedRecommendationScore = Number.isFinite(recommendationScore)
          ? recommendationScore
          : null;
        const isManualSelection = Boolean(sceneManualSelectionRef.current?.[sceneId]);
        setScenes((prev) =>
          prev.map((scene) =>
            scene.sceneId === sceneId
              ? normalizeScene({
                  ...scene,
                  recommendedTrackId,
                  recommendationMethod,
                  recommendationScore: normalizedRecommendationScore,
                })
              : scene
          )
        );
        if (!isManualSelection && recommendedTrackId) {
          setSceneLibrarySelectionMap((prev) => ({
            ...prev,
            [sceneId]: recommendedTrackId,
          }));

          let recommendedTrack = musicLibrary.find(
            (track) => track.trackId === recommendedTrackId
          );
          if (!recommendedTrack?.key) {
            try {
              const libraryData = await listStoryMusicLibrary(resolvedApiBaseUrl, {
                limit: 500,
              });
              const refreshedTracks = Array.isArray(libraryData?.tracks)
                ? libraryData.tracks
                : [];
              if (refreshedTracks.length > 0) {
                setMusicLibrary(refreshedTracks);
              }
              recommendedTrack =
                refreshedTracks.find((track) => track.trackId === recommendedTrackId) ||
                recommendedTrack;
            } catch (refreshError) {
              console.warn(
                "Story music recommendation library refresh warning:",
                refreshError?.message || refreshError
              );
            }
          }

          if (recommendedTrack?.key) {
            setActiveMusicTrackKey(recommendedTrack.key);
            setMusicAutoPlayRequest({
              requestId: `${sceneId}:${Date.now()}:recommend`,
              trackKey: recommendedTrack.key,
            });
          }
        }
      } catch (err) {
        console.warn("Scene music recommendation warning:", err?.message || err);
      }
    },
    [musicLibrary, normalizeScene, resolvedApiBaseUrl]
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
                    musicKey:
                      illustration.scene?.musicKey ?? illustration.musicKey ?? "",
                    musicUrl:
                      illustration.scene?.musicUrl ?? illustration.musicUrl ?? "",
                    musicStatus: illustration.scene?.musicStatus || "",
                    musicPredictionId:
                      illustration.scene?.musicPredictionId || "",
                    musicPrompt: illustration.scene?.musicPrompt || "",
                    musicModelId: illustration.scene?.musicModelId || "",
                    musicMood: illustration.scene?.musicMood || "",
                    musicEnergy: illustration.scene?.musicEnergy || "",
                    musicTempoBpm:
                      typeof illustration.scene?.musicTempoBpm === "number"
                        ? illustration.scene.musicTempoBpm
                        : scene.musicTempoBpm || null,
                    musicTags: Array.isArray(illustration.scene?.musicTags)
                      ? illustration.scene.musicTags
                      : scene.musicTags || [],
                    musicLibraryTrackId:
                      illustration.scene?.musicLibraryTrackId || "",
                    debug: debugData || scene.debug,
                  }
                : scene
            )
          );
          if (illustration.scene?.musicKey) {
            setActiveMusicTrackKey(illustration.scene.musicKey);
          }
          if (typeof illustration.scene?.musicLibraryTrackId === "string") {
            const selectedTrackId = illustration.scene.musicLibraryTrackId || "";
            setSceneLibrarySelectionMap((prev) => ({
              ...prev,
              [sceneId]: selectedTrackId,
            }));
            if (selectedTrackId) {
              setSceneManualSelectionMap((prev) => ({
                ...prev,
                [sceneId]: true,
              }));
            }
          }
          void recommendLibraryTrackForScene(sessionId, sceneId);
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
      recommendLibraryTrackForScene,
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
  const triggerSceneMusic = useCallback(
    async (sessionId, sceneId, options = {}) => {
      if (!resolvedApiBaseUrl || !sessionId || !sceneId) return;
      if (sceneMusicLoadingMap[sceneId]) return;
      const resolvedPrompt =
        typeof options.prompt === "string"
          ? options.prompt.trim()
          : (musicPrompt || "").trim();

      const applyMusicData = (data) => {
        if (!data) return;
        setScenes((prev) =>
          prev.map((scene) =>
            scene.sceneId === sceneId
              ? normalizeScene({
                  ...scene,
                  musicStatus: data.status || scene.musicStatus || "",
                  musicPredictionId:
                    data.predictionId || scene.musicPredictionId || "",
                  musicPrompt: data.prompt || scene.musicPrompt || resolvedPrompt,
                  musicKey:
                    data.status === "succeeded"
                      ? data.musicKey || scene.musicKey || ""
                      : data.musicKey || scene.musicKey || "",
                  musicUrl:
                    data.status === "succeeded"
                      ? data.musicUrl || scene.musicUrl || ""
                      : data.musicUrl || scene.musicUrl || "",
                  musicModelId: data.musicModelId || data.modelId || scene.musicModelId || "",
                  musicMood: data.musicMood || data.direction?.mood || scene.musicMood || "",
                  musicEnergy:
                    data.musicEnergy || data.direction?.energy || scene.musicEnergy || "",
                  musicTempoBpm:
                    typeof data.musicTempoBpm === "number"
                      ? data.musicTempoBpm
                      : typeof data.direction?.tempoBpm === "number"
                        ? data.direction.tempoBpm
                        : scene.musicTempoBpm || null,
                  musicTags: Array.isArray(data.musicTags)
                    ? data.musicTags
                    : Array.isArray(data.direction?.tags)
                      ? data.direction.tags
                      : scene.musicTags || [],
                  musicLibraryTrackId:
                    data.musicLibraryTrackId || scene.musicLibraryTrackId || "",
                })
                : scene
          )
        );
        if (data.status === "succeeded" && data.musicKey) {
          setActiveMusicTrackKey(data.musicKey);
          setMusicAutoPlayRequest({
            requestId: `${sceneId}:${Date.now()}`,
            trackKey: data.musicKey,
          });
        }
        if (typeof data.musicLibraryTrackId === "string") {
          const selectedTrackId = data.musicLibraryTrackId || "";
          setSceneLibrarySelectionMap((prev) => ({
            ...prev,
            [sceneId]: selectedTrackId,
          }));
          if (selectedTrackId) {
            setSceneManualSelectionMap((prev) => ({
              ...prev,
              [sceneId]: true,
            }));
          }
        }
        if (data?.track?.trackId) {
          setMusicLibrary((prev) => {
            const filtered = prev.filter((item) => item.trackId !== data.track.trackId);
            return [data.track, ...filtered];
          });
        }
      };

      const finishMusic = () => {
        clearSceneMusicPoll(sceneId);
        setSceneMusicLoadingMap((prev) => {
          const next = { ...prev };
          delete next[sceneId];
          return next;
        });
      };

      clearSceneMusicPoll(sceneId);
      setError("");
      setSceneMusicLoadingMap((prev) => ({ ...prev, [sceneId]: true }));
      setScenes((prev) =>
        prev.map((scene) =>
          scene.sceneId === sceneId
            ? normalizeScene({
                ...scene,
                musicStatus: "starting",
                musicPredictionId: "",
                musicPrompt: resolvedPrompt || scene.musicPrompt || "",
              })
            : scene
        )
      );

      const pollMusic = async (predictionId) => {
        try {
          const statusData = await getStorySceneMusicStatus(
            resolvedApiBaseUrl,
            sessionId,
            sceneId,
            { predictionId }
          );
          applyMusicData(statusData);
          const status = statusData?.status || "";
          if (status === "succeeded") {
            finishMusic();
            return;
          }
          if (status === "failed" || status === "canceled") {
            finishMusic();
            setError("Scene soundtrack generation failed.");
            return;
          }
          sceneMusicPollRef.current[sceneId] = setTimeout(
            () => pollMusic(predictionId),
            5000
          );
        } catch (err) {
          finishMusic();
          setError(err?.message || "Failed to generate scene soundtrack.");
        }
      };

      try {
        const data = await startStorySceneMusic(
          resolvedApiBaseUrl,
          sessionId,
          sceneId,
          resolvedPrompt ? { prompt: resolvedPrompt } : {}
        );
        applyMusicData(data);
        const status = data?.status || "";
        if (status === "succeeded") {
          finishMusic();
          return;
        }
        if (status === "failed" || status === "canceled") {
          finishMusic();
          setError("Scene soundtrack generation failed.");
          return;
        }
        if (!data?.predictionId) {
          finishMusic();
          return;
        }
        sceneMusicPollRef.current[sceneId] = setTimeout(
          () => pollMusic(data.predictionId),
          5000
        );
      } catch (err) {
        finishMusic();
        setError(err?.message || "Failed to generate scene soundtrack.");
      }
    },
    [
      clearSceneMusicPoll,
      musicPrompt,
      normalizeScene,
      resolvedApiBaseUrl,
      sceneMusicLoadingMap,
      setScenes,
    ]
  );
  const refreshMusicLibrary = useCallback(async () => {
    if (!resolvedApiBaseUrl) return;
    try {
      const data = await listStoryMusicLibrary(resolvedApiBaseUrl);
      setMusicLibrary(data.tracks || []);
    } catch (err) {
      setError(err?.message || "Failed to load soundtrack library.");
    }
  }, [resolvedApiBaseUrl]);
  const saveSceneMusic = useCallback(
    async (sessionId, sceneId, options = {}) => {
      if (!resolvedApiBaseUrl || !sessionId || !sceneId) return;
      try {
        const data = await saveStorySceneMusicToLibrary(
          resolvedApiBaseUrl,
          sessionId,
          sceneId,
          options
        );
        const savedTrackId = data?.musicLibraryTrackId || data?.track?.trackId || "";
        if (savedTrackId) {
          setScenes((prev) =>
            prev.map((scene) =>
              scene.sceneId === sceneId
                ? normalizeScene({
                    ...scene,
                    musicLibraryTrackId: savedTrackId,
                  })
                : scene
            )
          );
          setSceneLibrarySelectionMap((prev) => ({
            ...prev,
            [sceneId]: savedTrackId,
          }));
          setSceneManualSelectionMap((prev) => ({
            ...prev,
            [sceneId]: true,
          }));
        }
        if (data?.track?.trackId) {
          setMusicLibrary((prev) => {
            const filtered = prev.filter((item) => item.trackId !== data.track.trackId);
            return [data.track, ...filtered];
          });
          return;
        }
        await refreshMusicLibrary();
      } catch (err) {
        setError(err?.message || "Failed to save soundtrack to library.");
      }
    },
    [normalizeScene, refreshMusicLibrary, resolvedApiBaseUrl]
  );
  const setSceneLibraryTrackSelection = useCallback((sceneId, trackId) => {
    if (!sceneId) return;
    setSceneLibrarySelectionMap((prev) => ({
      ...prev,
      [sceneId]: trackId || "",
    }));
    setSceneManualSelectionMap((prev) => ({
      ...prev,
      [sceneId]: true,
    }));
  }, []);
  const applyLibraryTrackToScene = useCallback(
    async (sessionId, sceneId, trackId) => {
      if (!resolvedApiBaseUrl || !sessionId || !sceneId || !trackId) return;
      try {
        const data = await selectStorySceneLibraryTrack(
          resolvedApiBaseUrl,
          sessionId,
          sceneId,
          { trackId }
        );
        setScenes((prev) =>
          prev.map((scene) =>
            scene.sceneId === sceneId
              ? normalizeScene({
                  ...scene,
                  musicKey: data.musicKey || scene.musicKey || "",
                  musicUrl: data.musicUrl || scene.musicUrl || "",
                  musicStatus: data.musicStatus || "succeeded",
                  musicPredictionId: data.musicPredictionId || "",
                  musicPrompt: data.musicPrompt || scene.musicPrompt || "",
                  musicModelId: data.musicModelId || scene.musicModelId || "",
                  musicMood: data.musicMood || scene.musicMood || "",
                  musicEnergy: data.musicEnergy || scene.musicEnergy || "",
                  musicTempoBpm:
                    typeof data.musicTempoBpm === "number"
                      ? data.musicTempoBpm
                      : scene.musicTempoBpm || null,
                  musicTags: Array.isArray(data.musicTags)
                    ? data.musicTags
                    : scene.musicTags || [],
                  musicLibraryTrackId: data.musicLibraryTrackId || trackId,
                })
              : scene
          )
        );
        setSceneLibrarySelectionMap((prev) => ({
          ...prev,
          [sceneId]: trackId,
        }));
        setSceneManualSelectionMap((prev) => ({
          ...prev,
          [sceneId]: true,
        }));
        if (data.musicKey) {
          setActiveMusicTrackKey(data.musicKey);
          setMusicAutoPlayRequest({
            requestId: `${sceneId}:${Date.now()}`,
            trackKey: data.musicKey,
          });
        }
      } catch (err) {
        setError(err?.message || "Failed to apply soundtrack from library.");
      }
    },
    [normalizeScene, resolvedApiBaseUrl]
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
          musicKey: scene.musicKey ?? illustration.musicKey ?? "",
          musicUrl: scene.musicUrl ?? illustration.musicUrl ?? "",
          musicStatus: scene.musicStatus || "",
          musicPredictionId: scene.musicPredictionId || "",
          musicPrompt: scene.musicPrompt || "",
          musicModelId: scene.musicModelId || "",
          musicMood: scene.musicMood || "",
          musicEnergy: scene.musicEnergy || "",
          musicTempoBpm:
            typeof scene.musicTempoBpm === "number" ? scene.musicTempoBpm : null,
          musicTags: Array.isArray(scene.musicTags) ? scene.musicTags : [],
          musicLibraryTrackId: scene.musicLibraryTrackId || "",
          debug: debugData || scene.debug,
        };
        if (exists) {
          return prev.map((item) =>
            item.sceneId === scene.sceneId ? { ...item, ...nextScene } : item
          );
        }
        return [...prev, nextScene];
      });
      setSceneLibrarySelectionMap((prev) => ({
        ...prev,
        [scene.sceneId]: scene.musicLibraryTrackId || "",
      }));
      setSceneManualSelectionMap((prev) => ({
        ...prev,
        [scene.sceneId]: Boolean(scene.musicLibraryTrackId),
      }));
      void recommendLibraryTrackForScene(activeSessionId, scene.sceneId);
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
    recommendLibraryTrackForScene,
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
        const nextScenes = (data.scenes || []).map((scene) => normalizeScene(scene));
        const initialSelection = nextScenes.reduce((acc, scene) => {
          if (scene.sceneId) {
            acc[scene.sceneId] = scene.musicLibraryTrackId || "";
          }
          return acc;
        }, {});
        const initialManualSelection = nextScenes.reduce((acc, scene) => {
          if (scene.sceneId) {
            acc[scene.sceneId] = Boolean(scene.musicLibraryTrackId);
          }
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
          await triggerIllustration(data.session.id, openingScene.sceneId, {
            contextMode: "scene",
          });
        }
      }
    } catch (err) {
      setError(err?.message || "Failed to create session.");
    } finally {
      setStatus("idle");
    }
  }, [normalizeScene, resolvedApiBaseUrl, selectedPresetId, triggerIllustration]);
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
          musicKey: data.scene?.musicKey || "",
          musicUrl: data.scene?.musicUrl || "",
          musicStatus: data.scene?.musicStatus || "",
          musicPredictionId: data.scene?.musicPredictionId || "",
          musicPrompt: data.scene?.musicPrompt || "",
          musicModelId: data.scene?.musicModelId || "",
          musicMood: data.scene?.musicMood || "",
          musicEnergy: data.scene?.musicEnergy || "",
          musicTempoBpm:
            typeof data.scene?.musicTempoBpm === "number"
              ? data.scene.musicTempoBpm
              : null,
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
    normalizeScene,
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
  useEffect(() => {
    if (!resolvedApiBaseUrl) return;
    refreshMusicLibrary();
  }, [refreshMusicLibrary, resolvedApiBaseUrl]);
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
    musicPrompt,
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
    musicLibrary,
    sceneLibrarySelectionMap,
    activeMusicTrackKey,
    musicAutoPlayRequest,
    setInput,
    setSelectedPresetId,
    setIllustrationContextMode,
    setIllustrationModel,
    setAnimationPrompt,
    setMusicPrompt,
    setActiveMusicTrackKey,
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
    triggerSceneMusic,
    saveSceneMusic,
    applyLibraryTrackToScene,
    setSceneLibraryTrackSelection,
    isSceneGenerating,
    isSceneAnimating,
    isSceneGeneratingMusic,
  };
}
export default useStoryStudio;
