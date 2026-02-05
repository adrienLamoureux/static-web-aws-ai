import { useCallback, useEffect, useState } from "react";
import { deleteImage, listImages } from "../../../services/s3";
import { readSessionCache, writeSessionCache } from "../../../utils/sessionCache";

export const useWhiskImages = ({
  apiBaseUrl,
  cacheKey,
  cacheMaxAge,
  onError,
}) => {
  const [images, setImages] = useState([]);
  const [status, setStatus] = useState("idle");

  const refreshImages = useCallback(
    async (force = false) => {
      if (!apiBaseUrl) return;
      onError?.("");
      if (!force) {
        const cached = readSessionCache(cacheKey, cacheMaxAge);
        if (cached) {
          setImages(cached);
          setStatus("success");
          return;
        }
      }
      setStatus("loading");
      try {
        const data = await listImages(apiBaseUrl);
        const nextImages = data.images || [];
        setImages(nextImages);
        writeSessionCache(cacheKey, nextImages);
        setStatus("success");
      } catch (error) {
        setStatus("error");
        onError?.(error?.message || "Failed to load images.");
      }
    },
    [apiBaseUrl, cacheKey, cacheMaxAge, onError]
  );

  useEffect(() => {
    if (!apiBaseUrl) return;
    const cached = readSessionCache(cacheKey, cacheMaxAge);
    if (cached) {
      setImages(cached);
      setStatus("success");
      onError?.("");
      return;
    }
    refreshImages();
  }, [apiBaseUrl, cacheKey, cacheMaxAge, refreshImages]);

  const updateImages = useCallback(
    (updater) => {
      setImages((prev) => {
        const next = updater(prev);
        writeSessionCache(cacheKey, next);
        return next;
      });
    },
    [cacheKey]
  );

  const removeImage = useCallback(
    async (image) => {
      if (!image?.key || !apiBaseUrl) return;
      onError?.("");
      try {
        await deleteImage(apiBaseUrl, image.key);
        updateImages((prev) => prev.filter((item) => item.key !== image.key));
      } catch (error) {
        onError?.(error?.message || "Failed to delete image.");
      }
    },
    [apiBaseUrl, onError, updateImages]
  );

  return {
    images,
    status,
    refreshImages,
    updateImages,
    removeImage,
  };
};
