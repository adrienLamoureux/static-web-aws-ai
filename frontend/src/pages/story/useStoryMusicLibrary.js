import { useCallback, useRef, useState } from "react";
import {
  listStoryMusicLibrary,
  recommendStorySceneMusic,
  saveStorySceneMusicToLibrary,
  selectStorySceneLibraryTrack,
} from "../../services/story";

/**
 * Manages the music library: fetching, saving, recommending, and applying
 * tracks to scenes.
 *
 * Cross-hook dependencies that change over time are passed as stable refs
 * (objects with a `.current` property) to avoid stale closures.
 *
 * sceneLibrarySelectionMap and sceneManualSelectionMap are owned by the
 * orchestrator and passed as setter callbacks; the read values are also
 * passed as refs when needed.
 */
function useStoryMusicLibrary({
  resolvedApiBaseUrl,
  normalizeScene,
  setScenes,
  setSceneLibrarySelectionMap,
  setSceneManualSelectionMap,
  // Refs (always up-to-date .current):
  setActiveMusicTrackKeyRef, // { current: fn }
  setMusicAutoPlayRequestRef, // { current: fn }
  setErrorRef, // { current: fn }
}) {
  const [musicLibrary, setMusicLibrary] = useState([]);

  // A ref mirror of sceneManualSelectionMap so recommendation callbacks
  // can read the latest value without a stale closure.
  const sceneManualSelectionRef = useRef({});

  // Called by orchestrator's useEffect whenever sceneManualSelectionMap changes
  const syncManualSelectionRef = useCallback((map) => {
    sceneManualSelectionRef.current = map;
  }, []);

  // ------------------------------------------------------------------
  // Library CRUD
  // ------------------------------------------------------------------

  const refreshMusicLibrary = useCallback(async () => {
    if (!resolvedApiBaseUrl) return;
    try {
      const data = await listStoryMusicLibrary(resolvedApiBaseUrl);
      setMusicLibrary(data.tracks || []);
    } catch (err) {
      setErrorRef.current(err?.message || "Failed to load soundtrack library.");
    }
  }, [resolvedApiBaseUrl, setErrorRef]);

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
        setErrorRef.current(err?.message || "Failed to save soundtrack to library.");
      }
    },
    [
      normalizeScene,
      refreshMusicLibrary,
      resolvedApiBaseUrl,
      setSceneLibrarySelectionMap,
      setSceneManualSelectionMap,
      setScenes,
      setErrorRef,
    ]
  );

  // ------------------------------------------------------------------
  // Selection helpers
  // ------------------------------------------------------------------

  const setSceneLibraryTrackSelection = useCallback(
    (sceneId, trackId) => {
      if (!sceneId) return;
      setSceneLibrarySelectionMap((prev) => ({
        ...prev,
        [sceneId]: trackId || "",
      }));
      setSceneManualSelectionMap((prev) => ({
        ...prev,
        [sceneId]: true,
      }));
    },
    [setSceneLibrarySelectionMap, setSceneManualSelectionMap]
  );

  const applyLibraryTrackToScene = useCallback(
    async (sessionId, sceneId, trackId) => {
      if (!resolvedApiBaseUrl || !sessionId || !sceneId || !trackId) return;
      try {
        const data = await selectStorySceneLibraryTrack(resolvedApiBaseUrl, sessionId, sceneId, {
          trackId,
        });
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
                  musicTags: Array.isArray(data.musicTags) ? data.musicTags : scene.musicTags || [],
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
          setActiveMusicTrackKeyRef.current(data.musicKey);
          setMusicAutoPlayRequestRef.current({
            requestId: `${sceneId}:${Date.now()}`,
            trackKey: data.musicKey,
          });
        }
      } catch (err) {
        setErrorRef.current(err?.message || "Failed to apply soundtrack from library.");
      }
    },
    [
      normalizeScene,
      resolvedApiBaseUrl,
      setActiveMusicTrackKeyRef,
      setMusicAutoPlayRequestRef,
      setSceneLibrarySelectionMap,
      setSceneManualSelectionMap,
      setScenes,
      setErrorRef,
    ]
  );

  // ------------------------------------------------------------------
  // Recommendation
  // ------------------------------------------------------------------

  const recommendLibraryTrackForScene = useCallback(
    async (sessionId, sceneId) => {
      if (!resolvedApiBaseUrl || !sessionId || !sceneId) return;
      try {
        const data = await recommendStorySceneMusic(resolvedApiBaseUrl, sessionId, sceneId);
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

          // Try to find the track in current library snapshot
          let recommendedTrack = null;
          setMusicLibrary((prev) => {
            recommendedTrack = prev.find((t) => t.trackId === recommendedTrackId) || null;
            return prev;
          });

          if (!recommendedTrack?.key) {
            try {
              const libraryData = await listStoryMusicLibrary(resolvedApiBaseUrl, {
                limit: 500,
              });
              const refreshedTracks = Array.isArray(libraryData?.tracks) ? libraryData.tracks : [];
              if (refreshedTracks.length > 0) {
                setMusicLibrary(refreshedTracks);
              }
              recommendedTrack =
                refreshedTracks.find((t) => t.trackId === recommendedTrackId) || recommendedTrack;
            } catch (refreshError) {
              console.warn(
                "Story music recommendation library refresh warning:",
                refreshError?.message || refreshError
              );
            }
          }

          if (recommendedTrack?.key) {
            setActiveMusicTrackKeyRef.current(recommendedTrack.key);
            setMusicAutoPlayRequestRef.current({
              requestId: `${sceneId}:${Date.now()}:recommend`,
              trackKey: recommendedTrack.key,
            });
          }
        }
      } catch (err) {
        console.warn("Scene music recommendation warning:", err?.message || err);
      }
    },
    [
      normalizeScene,
      resolvedApiBaseUrl,
      setActiveMusicTrackKeyRef,
      setMusicAutoPlayRequestRef,
      setSceneLibrarySelectionMap,
      setScenes,
    ]
  );

  return {
    // State
    musicLibrary,
    setMusicLibrary,
    // Ref sync (call in useEffect from orchestrator)
    syncManualSelectionRef,
    // Operations
    refreshMusicLibrary,
    saveSceneMusic,
    setSceneLibraryTrackSelection,
    applyLibraryTrackToScene,
    recommendLibraryTrackForScene,
  };
}

export default useStoryMusicLibrary;
