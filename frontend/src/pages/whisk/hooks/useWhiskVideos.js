import { useCallback, useEffect, useState } from "react";
import { deleteVideo, listVideos } from "../../../services/s3";
import { readSessionCache, writeSessionCache } from "../../../utils/sessionCache";

export const useWhiskVideos = ({
  apiBaseUrl,
  cacheKey,
  cacheMaxAge,
  onError,
}) => {
  const [videos, setVideos] = useState([]);
  const [videoUrls, setVideoUrls] = useState({});
  const [loadingVideoKey, setLoadingVideoKey] = useState("");

  const refreshVideos = useCallback(
    async (force = false) => {
      if (!apiBaseUrl) return;
      onError?.("");
      if (!force) {
        const cached = readSessionCache(cacheKey, cacheMaxAge);
        if (cached) {
          setVideos(cached);
          return;
        }
      }
      try {
        const data = await listVideos(apiBaseUrl, {
          includeUrls: false,
          includePosters: true,
        });
        const nextVideos = data.videos || [];
        setVideos(nextVideos);
        writeSessionCache(cacheKey, nextVideos);
      } catch (error) {
        onError?.(error?.message || "Failed to load videos.");
      }
    },
    [apiBaseUrl, cacheKey, cacheMaxAge, onError]
  );

  useEffect(() => {
    if (!apiBaseUrl) return;
    refreshVideos();
  }, [apiBaseUrl, refreshVideos]);

  const removeVideo = useCallback(
    async (video) => {
      if (!video?.key || !apiBaseUrl) return;
      onError?.("");
      try {
        await deleteVideo(apiBaseUrl, video.key);
        setVideos((prev) => {
          const next = prev.filter((item) => item.key !== video.key);
          writeSessionCache(cacheKey, next);
          return next;
        });
        setVideoUrls((prev) => {
          const next = { ...prev };
          delete next[video.key];
          return next;
        });
      } catch (error) {
        onError?.(error?.message || "Failed to delete video.");
      }
    },
    [apiBaseUrl, cacheKey, onError]
  );

  const toggleVideoPreview = useCallback(
    async (video) => {
      if (!video?.key || !apiBaseUrl) return;
      if (videoUrls[video.key]) {
        setVideoUrls((prev) => {
          const next = { ...prev };
          delete next[video.key];
          return next;
        });
        return;
      }
      setLoadingVideoKey(video.key);
      onError?.("");
      try {
        const data = await listVideos(apiBaseUrl, {
          includeUrls: true,
          includePosters: false,
        });
        const matched = (data.videos || []).find(
          (item) => item.key === video.key
        );
        if (matched?.url) {
          setVideoUrls((prev) => ({ ...prev, [video.key]: matched.url }));
        }
      } catch (error) {
        onError?.(error?.message || "Failed to load video.");
      } finally {
        setLoadingVideoKey("");
      }
    },
    [apiBaseUrl, onError, videoUrls]
  );

  return {
    videos,
    videoUrls,
    loadingVideoKey,
    refreshVideos,
    removeVideo,
    toggleVideoPreview,
  };
};
