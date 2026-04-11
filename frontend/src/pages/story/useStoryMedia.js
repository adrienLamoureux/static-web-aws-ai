import { useCallback, useRef, useState } from "react";
import {
  getStorySceneAnimationStatus,
  getStorySceneMusicStatus,
  startStorySceneAnimation,
  startStorySceneMusic,
} from "../../services/story";

const DEFAULT_ANIMATION_PROMPT = "A lot of movements";
const DEFAULT_MUSIC_PROMPT = "";

/**
 * Handles animation and music generation for individual scenes,
 * including polling until each async job completes.
 *
 * Cross-hook dependencies that change over time are passed as stable refs
 * (objects with a `.current` property) to avoid stale closures.
 */
function useStoryMedia({
  resolvedApiBaseUrl,
  normalizeScene,
  setScenes,
  setSceneLibrarySelectionMap,
  setSceneManualSelectionMap,
  // Refs (always up-to-date .current):
  setMusicLibraryRef, // { current: fn } — useStoryMusicLibrary's setMusicLibrary
  setErrorRef,        // { current: fn } — orchestrator's setError
}) {
  const [animationPrompt, setAnimationPrompt] = useState(DEFAULT_ANIMATION_PROMPT);
  const [musicPrompt, setMusicPrompt] = useState(DEFAULT_MUSIC_PROMPT);
  const [sceneAnimationLoadingMap, setSceneAnimationLoadingMap] = useState({});
  const [sceneMusicLoadingMap, setSceneMusicLoadingMap] = useState({});
  const [activeMusicTrackKey, setActiveMusicTrackKey] = useState("");
  const [musicAutoPlayRequest, setMusicAutoPlayRequest] = useState(null);

  const sceneAnimationPollRef = useRef({});
  const sceneMusicPollRef = useRef({});

  // ------------------------------------------------------------------
  // Poll cleanup helpers
  // ------------------------------------------------------------------

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

  // ------------------------------------------------------------------
  // Status helpers
  // ------------------------------------------------------------------

  const isSceneAnimating = useCallback(
    (sceneId) => Boolean(sceneAnimationLoadingMap[sceneId]),
    [sceneAnimationLoadingMap]
  );

  const isSceneGeneratingMusic = useCallback(
    (sceneId) => Boolean(sceneMusicLoadingMap[sceneId]),
    [sceneMusicLoadingMap]
  );

  // ------------------------------------------------------------------
  // Animation
  // ------------------------------------------------------------------

  const triggerSceneAnimation = useCallback(
    async (sessionId, sceneId, options = {}) => {
      if (!resolvedApiBaseUrl || !sessionId || !sceneId) return;
      if (sceneAnimationLoadingMap[sceneId]) return;
      const setError = setErrorRef.current;
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
      setErrorRef,
    ]
  );

  // ------------------------------------------------------------------
  // Music generation
  // ------------------------------------------------------------------

  const triggerSceneMusic = useCallback(
    async (sessionId, sceneId, options = {}) => {
      if (!resolvedApiBaseUrl || !sessionId || !sceneId) return;
      if (sceneMusicLoadingMap[sceneId]) return;
      const setError = setErrorRef.current;
      const setMusicLibrary = setMusicLibraryRef.current;
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
        if (data?.track?.trackId && setMusicLibrary) {
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
      setMusicLibraryRef,
      setSceneLibrarySelectionMap,
      setSceneManualSelectionMap,
      setScenes,
      setErrorRef,
    ]
  );

  return {
    // State
    animationPrompt,
    setAnimationPrompt,
    musicPrompt,
    setMusicPrompt,
    sceneAnimationLoadingMap,
    setSceneAnimationLoadingMap,
    sceneMusicLoadingMap,
    setSceneMusicLoadingMap,
    activeMusicTrackKey,
    setActiveMusicTrackKey,
    musicAutoPlayRequest,
    setMusicAutoPlayRequest,
    // Poll helpers
    clearSceneAnimationPoll,
    clearSceneMusicPoll,
    clearAllSceneAnimationPolls,
    clearAllSceneMusicPolls,
    // Status
    isSceneAnimating,
    isSceneGeneratingMusic,
    // Triggers
    triggerSceneAnimation,
    triggerSceneMusic,
  };
}

export default useStoryMedia;
