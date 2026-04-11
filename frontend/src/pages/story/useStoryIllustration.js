import { useCallback, useState } from "react";
import { generateStoryIllustration } from "../../services/story";

/**
 * Handles illustration generation for individual scenes and the
 * "force illustration" action that creates a new scene from current context.
 *
 * Cross-hook dependencies that change over time are passed as stable refs
 * (objects with a `.current` property) to avoid stale closures.
 */
function useStoryIllustration({
  resolvedApiBaseUrl,
  illustrationContextMode,
  illustrationModel,
  illustrationDebugEnabled,
  normalizeScene,
  setScenes,
  setSceneLibrarySelectionMap,
  setSceneManualSelectionMap,
  setActiveMusicTrackKey,
  // Refs (always up-to-date .current):
  recommendLibraryTrackForSceneRef,  // { current: fn }
  refreshActiveSessionDetailRef,      // { current: fn }
  refreshSessionsRef,                 // { current: fn }
  activeSessionIdRef,                 // { current: string }
  setErrorRef,                        // { current: fn }
}) {
  const [sceneLoadingMap, setSceneLoadingMap] = useState({});
  const [isForcingIllustration, setIsForcingIllustration] = useState(false);

  const isSceneGenerating = useCallback(
    (sceneId) => Boolean(sceneLoadingMap[sceneId]),
    [sceneLoadingMap]
  );

  // ------------------------------------------------------------------
  // Trigger illustration for a known sceneId
  // ------------------------------------------------------------------

  const triggerIllustration = useCallback(
    async (sessionId, sceneId, options = {}) => {
      if (!resolvedApiBaseUrl || !sessionId || !sceneId) return;
      const setError = setErrorRef.current;
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
          void recommendLibraryTrackForSceneRef.current(sessionId, sceneId);
        } else {
          setScenes((prev) =>
            prev.map((scene) =>
              scene.sceneId === sceneId
                ? { ...scene, status: "pending" }
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
      recommendLibraryTrackForSceneRef,
      resolvedApiBaseUrl,
      setActiveMusicTrackKey,
      setSceneLibrarySelectionMap,
      setSceneManualSelectionMap,
      setScenes,
      setErrorRef,
    ]
  );

  // ------------------------------------------------------------------
  // Force illustration — creates a new scene from current story context
  // ------------------------------------------------------------------

  const handleForceIllustration = useCallback(async () => {
    const activeSessionId = activeSessionIdRef.current;
    const setError = setErrorRef.current;
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
      void recommendLibraryTrackForSceneRef.current(activeSessionId, scene.sceneId);
      await refreshActiveSessionDetailRef.current(activeSessionId);
      refreshSessionsRef.current();
    } catch (err) {
      setError(err?.message || "Failed to force an illustration.");
    } finally {
      setIsForcingIllustration(false);
    }
  }, [
    activeSessionIdRef,
    illustrationContextMode,
    illustrationModel,
    illustrationDebugEnabled,
    isForcingIllustration,
    recommendLibraryTrackForSceneRef,
    refreshActiveSessionDetailRef,
    refreshSessionsRef,
    resolvedApiBaseUrl,
    setSceneLibrarySelectionMap,
    setSceneManualSelectionMap,
    setScenes,
    setErrorRef,
  ]);

  return {
    sceneLoadingMap,
    isForcingIllustration,
    isSceneGenerating,
    triggerIllustration,
    handleForceIllustration,
  };
}

export default useStoryIllustration;
