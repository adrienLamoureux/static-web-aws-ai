import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listStoryPresets } from "../../services/story";
import { STORY_VIEW_MODE } from "./constants";
import useStoryMedia from "./useStoryMedia";
import useStoryMusicLibrary from "./useStoryMusicLibrary";
import useStoryIllustration from "./useStoryIllustration";
import useStorySession from "./useStorySession";

const DEFAULT_CONTEXT_MODE = "summary+scene";
const DEFAULT_ILLUSTRATION_MODEL = "wai-nsfw-illustrious-v11";

/**
 * Orchestrator: composes the four sub-hooks and exposes the same unified API
 * shape as the original monolithic hook.
 *
 * State that multiple sub-hooks write is owned here and passed as stable
 * useState setters (which are always stable references).
 * Functions that sub-hooks call on each other are injected via useRef so
 * no hook ever closes over a stale value.
 */
function useStoryStudio(apiBaseUrl = "") {
  const resolvedApiBaseUrl = apiBaseUrl || process.env.REACT_APP_API_URL || "";

  // ─── Shared state owned by the orchestrator ────────────────────────
  // Multiple sub-hooks read AND write these; owning them here means each
  // sub-hook only needs the stable setter (never a stale read).

  const [scenes, setScenes] = useState([]);
  const [error, setError] = useState("");
  const [sceneLibrarySelectionMap, setSceneLibrarySelectionMap] = useState({});
  const [sceneManualSelectionMap, setSceneManualSelectionMap] = useState({});

  // ─── UI / settings state ───────────────────────────────────────────

  const [presets, setPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [illustrationContextMode, setIllustrationContextMode] = useState(DEFAULT_CONTEXT_MODE);
  const [illustrationModel, setIllustrationModel] = useState(DEFAULT_ILLUSTRATION_MODEL);
  const [illustrationDebugEnabled, setIllustrationDebugEnabled] = useState(true);
  const [storyDebugEnabled, setStoryDebugEnabled] = useState(false);
  const [storyDebugView, setStoryDebugView] = useState("state");
  const [storyViewMode, setStoryViewMode] = useState(STORY_VIEW_MODE.READER);

  const isDirectorMode = storyViewMode === STORY_VIEW_MODE.DIRECTOR;

  // ─── normalizeScene — pure helper shared by all sub-hooks ──────────

  const normalizeScene = useCallback((scene = {}) => {
    const parsedTempo = Number(scene.musicTempoBpm);
    const hasRecommendationScore =
      scene.recommendationScore !== null &&
      scene.recommendationScore !== "" &&
      typeof scene.recommendationScore !== "undefined";
    const parsedRecommendationScore = Number(scene.recommendationScore);
    return {
      ...scene,
      videoKey: scene.videoKey || "",
      videoUrl: scene.videoUrl || "",
      videoStatus: scene.videoStatus || "",
      videoPredictionId: scene.videoPredictionId || "",
      videoPrompt: scene.videoPrompt || "",
      musicKey: scene.musicKey || "",
      musicUrl: scene.musicUrl || "",
      musicStatus: scene.musicStatus || "",
      musicPredictionId: scene.musicPredictionId || "",
      musicPrompt: scene.musicPrompt || "",
      musicModelId: scene.musicModelId || "",
      musicMood: scene.musicMood || "",
      musicEnergy: scene.musicEnergy || "",
      musicTempoBpm: Number.isFinite(parsedTempo) ? Math.round(parsedTempo) : null,
      musicTags: Array.isArray(scene.musicTags) ? scene.musicTags : [],
      musicLibraryTrackId: scene.musicLibraryTrackId || "",
      recommendedTrackId: scene.recommendedTrackId || "",
      recommendationMethod: scene.recommendationMethod || "",
      recommendationScore:
        hasRecommendationScore && Number.isFinite(parsedRecommendationScore)
          ? parsedRecommendationScore
          : null,
    };
  }, []);

  // ─── Stable refs for cross-hook wiring ────────────────────────────
  // Created once; .current values are kept up-to-date via useEffect.

  const setErrorRef = useRef(setError);
  useEffect(() => {
    setErrorRef.current = setError;
  }, [setError]);

  // Refs for media setters (populated after useStoryMedia instantiation)
  const setSceneAnimationLoadingMapRef = useRef(() => {});
  const setSceneMusicLoadingMapRef = useRef(() => {});
  const clearAllSceneAnimationPollsRef = useRef(() => {});
  const clearAllSceneMusicPollsRef = useRef(() => {});
  const setActiveMusicTrackKeyRef = useRef(() => {});
  const setMusicAutoPlayRequestRef = useRef(() => {});
  const setMusicLibraryRef = useRef(() => {});

  // Refs for illustration/session cross-wiring
  const triggerIllustrationRef = useRef(async () => {});
  const recommendLibraryTrackForSceneRef = useRef(async () => {});
  const refreshActiveSessionDetailRef = useRef(async () => {});
  const refreshSessionsRef = useRef(() => {});
  const activeSessionIdRef = useRef("");

  // ─── 1. useStoryMedia ─────────────────────────────────────────────

  const media = useStoryMedia({
    resolvedApiBaseUrl,
    normalizeScene,
    setScenes,
    setSceneLibrarySelectionMap,
    setSceneManualSelectionMap,
    setMusicLibraryRef,
    setErrorRef,
  });

  // Keep media refs current
  useEffect(() => {
    setSceneAnimationLoadingMapRef.current = media.setSceneAnimationLoadingMap;
  }, [media.setSceneAnimationLoadingMap]);
  useEffect(() => {
    setSceneMusicLoadingMapRef.current = media.setSceneMusicLoadingMap;
  }, [media.setSceneMusicLoadingMap]);
  useEffect(() => {
    clearAllSceneAnimationPollsRef.current = media.clearAllSceneAnimationPolls;
  }, [media.clearAllSceneAnimationPolls]);
  useEffect(() => {
    clearAllSceneMusicPollsRef.current = media.clearAllSceneMusicPolls;
  }, [media.clearAllSceneMusicPolls]);
  useEffect(() => {
    setActiveMusicTrackKeyRef.current = media.setActiveMusicTrackKey;
  }, [media.setActiveMusicTrackKey]);
  useEffect(() => {
    setMusicAutoPlayRequestRef.current = media.setMusicAutoPlayRequest;
  }, [media.setMusicAutoPlayRequest]);

  // ─── 2. useStoryMusicLibrary ──────────────────────────────────────

  const musicLib = useStoryMusicLibrary({
    resolvedApiBaseUrl,
    normalizeScene,
    setScenes,
    setSceneLibrarySelectionMap,
    setSceneManualSelectionMap,
    setActiveMusicTrackKeyRef,
    setMusicAutoPlayRequestRef,
    setErrorRef,
  });

  // Keep music library ref current
  useEffect(() => {
    setMusicLibraryRef.current = musicLib.setMusicLibrary;
  }, [musicLib.setMusicLibrary]);
  useEffect(() => {
    recommendLibraryTrackForSceneRef.current = musicLib.recommendLibraryTrackForScene;
  }, [musicLib.recommendLibraryTrackForScene]);

  // Keep sceneManualSelectionRef inside musicLib in sync
  useEffect(() => {
    musicLib.syncManualSelectionRef(sceneManualSelectionMap);
  }, [sceneManualSelectionMap, musicLib]);

  // ─── 3. useStoryIllustration ──────────────────────────────────────

  const illustration = useStoryIllustration({
    resolvedApiBaseUrl,
    illustrationContextMode,
    illustrationModel,
    illustrationDebugEnabled,
    normalizeScene,
    setScenes,
    setSceneLibrarySelectionMap,
    setSceneManualSelectionMap,
    setActiveMusicTrackKey: media.setActiveMusicTrackKey,
    recommendLibraryTrackForSceneRef,
    refreshActiveSessionDetailRef,
    refreshSessionsRef,
    activeSessionIdRef,
    setErrorRef,
  });

  // Keep triggerIllustration ref current
  useEffect(() => {
    triggerIllustrationRef.current = illustration.triggerIllustration;
  }, [illustration.triggerIllustration]);

  // ─── 4. useStorySession ───────────────────────────────────────────

  const session = useStorySession({
    resolvedApiBaseUrl,
    selectedPresetId,
    illustrationContextMode,
    normalizeScene,
    triggerIllustrationRef,
    clearAllSceneAnimationPollsRef,
    clearAllSceneMusicPollsRef,
    setSceneAnimationLoadingMapRef,
    setSceneMusicLoadingMapRef,
    setSceneLibrarySelectionMap,
    setSceneManualSelectionMap,
    setScenes,
    setErrorRef,
  });

  // Keep session refs current
  useEffect(() => {
    refreshActiveSessionDetailRef.current = session.refreshActiveSessionDetail;
  }, [session.refreshActiveSessionDetail]);
  useEffect(() => {
    refreshSessionsRef.current = session.refreshSessions;
  }, [session.refreshSessions]);
  useEffect(() => {
    activeSessionIdRef.current = session.activeSessionId;
  }, [session.activeSessionId]);

  // ─── Bootstrap effects ────────────────────────────────────────────

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
    session.refreshSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedApiBaseUrl]);

  useEffect(() => {
    if (!resolvedApiBaseUrl) return;
    musicLib.refreshMusicLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedApiBaseUrl]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      media.clearAllSceneAnimationPolls();
      media.clearAllSceneMusicPolls();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ─── Derived / computed values ────────────────────────────────────

  const activeSession = useMemo(
    () => session.sessions.find((s) => s.id === session.activeSessionId),
    [session.sessions, session.activeSessionId]
  );

  const activeTurnCount =
    session.activeSessionDetail?.turnCount ??
    session.activeSessionDetail?.storyState?.meta?.turn ??
    activeSession?.turnCount ??
    0;

  const readerScenes = useMemo(() => [...scenes].reverse(), [scenes]);
  const featuredScene = readerScenes[0] || null;

  // ─── Public API — same shape as the original useStoryStudio ───────

  return {
    presets,
    sessions: session.sessions,
    activeSessionId: session.activeSessionId,
    messages: session.messages,
    scenes,
    input: session.input,
    status: session.status,
    error,
    selectedPresetId,
    isLoadingSession: session.isLoadingSession,
    illustrationContextMode,
    illustrationModel,
    animationPrompt: media.animationPrompt,
    musicPrompt: media.musicPrompt,
    illustrationDebugEnabled,
    activeSessionDetail: session.activeSessionDetail,
    storyDebugEnabled,
    storyDebugView,
    isForcingIllustration: illustration.isForcingIllustration,
    storyViewMode,
    isDirectorMode,
    activeSession,
    activeTurnCount,
    readerScenes,
    featuredScene,
    musicLibrary: musicLib.musicLibrary,
    sceneLibrarySelectionMap,
    activeMusicTrackKey: media.activeMusicTrackKey,
    musicAutoPlayRequest: media.musicAutoPlayRequest,
    // Setters
    setInput: session.setInput,
    setSelectedPresetId,
    setIllustrationContextMode,
    setIllustrationModel,
    setAnimationPrompt: media.setAnimationPrompt,
    setMusicPrompt: media.setMusicPrompt,
    setActiveMusicTrackKey: media.setActiveMusicTrackKey,
    setIllustrationDebugEnabled,
    setStoryDebugEnabled,
    setStoryDebugView,
    setStoryViewMode,
    // Session operations
    refreshSessions: session.refreshSessions,
    handleSelectSession: session.handleSelectSession,
    handleDeleteSession: session.handleDeleteSession,
    handleCreateSession: session.handleCreateSession,
    handleSendMessage: session.handleSendMessage,
    // Illustration
    handleForceIllustration: illustration.handleForceIllustration,
    triggerIllustration: illustration.triggerIllustration,
    // Animation + music
    triggerSceneAnimation: media.triggerSceneAnimation,
    triggerSceneMusic: media.triggerSceneMusic,
    // Music library
    saveSceneMusic: musicLib.saveSceneMusic,
    applyLibraryTrackToScene: musicLib.applyLibraryTrackToScene,
    setSceneLibraryTrackSelection: musicLib.setSceneLibraryTrackSelection,
    // Status predicates
    isSceneGenerating: illustration.isSceneGenerating,
    isSceneAnimating: media.isSceneAnimating,
    isSceneGeneratingMusic: media.isSceneGeneratingMusic,
  };
}

export default useStoryStudio;
