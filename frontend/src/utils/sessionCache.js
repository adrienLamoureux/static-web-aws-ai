export const readSessionCache = (key, maxAgeMs) => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { ts, data } = parsed;
    if (maxAgeMs && ts && Date.now() - ts > maxAgeMs) return null;
    return data;
  } catch (error) {
    return null;
  }
};

export const writeSessionCache = (key, data) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ ts: Date.now(), data })
    );
  } catch (error) {
    // ignore cache write failures
  }
};

export const clearSessionCache = () => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem("whisk_images_cache");
    window.sessionStorage.removeItem("whisk_videos_cache");
  } catch (error) {
    // ignore cache clear failures
  }
};
