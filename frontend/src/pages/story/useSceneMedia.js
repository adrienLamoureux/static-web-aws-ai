import { useState, useRef, useCallback, useEffect } from "react";
import {
  startStorySceneAnimation,
  getStorySceneAnimationStatus,
  startStorySceneMusic,
  getStorySceneMusicStatus,
} from "../../services/story";

/**
 * Hook encapsulating animation + music trigger/poll for story scenes.
 * Pattern adapted from design-pixnovel useStoryStudio.js (lines 431-729).
 */
export default function useSceneMedia(apiBaseUrl) {
  const [mediaMap, setMediaMap] = useState({});
  const animPollTimers = useRef({});
  const musicPollTimers = useRef({});

  // --- helpers ---
  const updateScene = useCallback((sceneId, patch) => {
    setMediaMap((prev) => ({
      ...prev,
      [sceneId]: { ...(prev[sceneId] || {}), ...patch },
    }));
  }, []);

  const clearAnimPoll = useCallback((sceneId) => {
    if (animPollTimers.current[sceneId]) {
      clearTimeout(animPollTimers.current[sceneId]);
      delete animPollTimers.current[sceneId];
    }
  }, []);

  const clearMusicPoll = useCallback((sceneId) => {
    if (musicPollTimers.current[sceneId]) {
      clearTimeout(musicPollTimers.current[sceneId]);
      delete musicPollTimers.current[sceneId];
    }
  }, []);

  const clearAllPolls = useCallback(() => {
    Object.keys(animPollTimers.current).forEach((id) => clearTimeout(animPollTimers.current[id]));
    Object.keys(musicPollTimers.current).forEach((id) => clearTimeout(musicPollTimers.current[id]));
    animPollTimers.current = {};
    musicPollTimers.current = {};
    setMediaMap({});
  }, []);

  // Cleanup on unmount
  useEffect(() => clearAllPolls, [clearAllPolls]);

  // --- animation ---
  const triggerAnimation = useCallback(
    async (sessionId, sceneId) => {
      if (!apiBaseUrl || !sessionId || !sceneId) return;
      const current = mediaMap[sceneId];
      if (current?.videoStatus === "starting" || current?.videoStatus === "processing") return;

      clearAnimPoll(sceneId);
      updateScene(sceneId, { videoStatus: "starting", videoUrl: "", videoPredictionId: "" });

      const applyData = (data) => {
        if (!data) return;
        const patch = { videoStatus: data.status || "" };
        if (data.predictionId) patch.videoPredictionId = data.predictionId;
        if (data.status === "succeeded" && data.videoUrl) patch.videoUrl = data.videoUrl;
        if (data.videoKey) patch.videoKey = data.videoKey;
        updateScene(sceneId, patch);
      };

      const finish = () => clearAnimPoll(sceneId);

      const poll = async (predictionId) => {
        try {
          const statusData = await getStorySceneAnimationStatus(apiBaseUrl, sessionId, sceneId, {
            predictionId,
          });
          applyData(statusData);
          const st = statusData?.status || "";
          if (st === "succeeded" || st === "failed" || st === "canceled") {
            finish();
            return;
          }
          animPollTimers.current[sceneId] = setTimeout(() => poll(predictionId), 5000);
        } catch {
          finish();
        }
      };

      try {
        const data = await startStorySceneAnimation(apiBaseUrl, sessionId, sceneId, {
          prompt: "A lot of movements",
        });
        applyData(data);
        const st = data?.status || "";
        if (st === "succeeded" || st === "failed" || st === "canceled") {
          finish();
          return;
        }
        if (!data?.predictionId) {
          finish();
          return;
        }
        animPollTimers.current[sceneId] = setTimeout(() => poll(data.predictionId), 5000);
      } catch {
        finish();
        updateScene(sceneId, { videoStatus: "failed" });
      }
    },
    [apiBaseUrl, mediaMap, clearAnimPoll, updateScene]
  );

  // --- music ---
  const triggerMusic = useCallback(
    async (sessionId, sceneId) => {
      if (!apiBaseUrl || !sessionId || !sceneId) return;
      const current = mediaMap[sceneId];
      if (current?.musicStatus === "starting" || current?.musicStatus === "processing") return;

      clearMusicPoll(sceneId);
      updateScene(sceneId, { musicStatus: "starting", musicUrl: "", musicPredictionId: "" });

      const applyData = (data) => {
        if (!data) return;
        const patch = { musicStatus: data.status || "" };
        if (data.predictionId) patch.musicPredictionId = data.predictionId;
        if (data.status === "succeeded" && data.musicUrl) patch.musicUrl = data.musicUrl;
        if (data.musicKey) patch.musicKey = data.musicKey;
        if (data.musicMood) patch.musicMood = data.musicMood;
        if (data.musicTags) patch.musicTags = data.musicTags;
        updateScene(sceneId, patch);
      };

      const finish = () => clearMusicPoll(sceneId);

      const poll = async (predictionId) => {
        try {
          const statusData = await getStorySceneMusicStatus(apiBaseUrl, sessionId, sceneId, {
            predictionId,
          });
          applyData(statusData);
          const st = statusData?.status || "";
          if (st === "succeeded" || st === "failed" || st === "canceled") {
            finish();
            return;
          }
          musicPollTimers.current[sceneId] = setTimeout(() => poll(predictionId), 5000);
        } catch {
          finish();
        }
      };

      try {
        const data = await startStorySceneMusic(apiBaseUrl, sessionId, sceneId, {});
        applyData(data);
        const st = data?.status || "";
        if (st === "succeeded" || st === "failed" || st === "canceled") {
          finish();
          return;
        }
        if (!data?.predictionId) {
          finish();
          return;
        }
        musicPollTimers.current[sceneId] = setTimeout(() => poll(data.predictionId), 5000);
      } catch {
        finish();
        updateScene(sceneId, { musicStatus: "failed" });
      }
    },
    [apiBaseUrl, mediaMap, clearMusicPoll, updateScene]
  );

  // --- accessor ---
  const getSceneMedia = useCallback((sceneId) => mediaMap[sceneId] || null, [mediaMap]);

  return { triggerAnimation, triggerMusic, getSceneMedia, clearAllPolls, mediaMap };
}
