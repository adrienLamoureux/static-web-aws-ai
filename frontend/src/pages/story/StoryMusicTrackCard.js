import React, { useCallback, useEffect, useRef, useState } from "react";

const GAPLESS_LOOP_CONFIG = Object.freeze({
  silenceThreshold: 0.0008,
  boundaryPaddingSeconds: 0.01,
  restartSafetySeconds: 0.03,
  minLoopSpanSeconds: 0.4,
  maxAnalyzedChannels: 2,
});
const LOSSLESS_LOOP_EXTENSIONS = Object.freeze(["wav", "flac", "aif", "aiff"]);

const isFinitePositiveNumber = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const isLosslessLoopUrl = (url = "") => {
  const normalizedUrl = String(url || "").split("?")[0].toLowerCase();
  return LOSSLESS_LOOP_EXTENSIONS.some((extension) =>
    normalizedUrl.endsWith(`.${extension}`)
  );
};

const resolveLoopWindow = (durationSeconds = 0, candidateWindow = null) => {
  const safeDuration = isFinitePositiveNumber(durationSeconds)
    ? Number(durationSeconds)
    : 0;
  if (!safeDuration) {
    return { start: 0, end: 0 };
  }
  const minimumSpanSeconds = Math.min(
    GAPLESS_LOOP_CONFIG.minLoopSpanSeconds,
    safeDuration
  );
  const candidateStart = Number(candidateWindow?.start);
  const candidateEnd = Number(candidateWindow?.end);
  const start = clamp(
    Number.isFinite(candidateStart) ? candidateStart : 0,
    0,
    safeDuration - minimumSpanSeconds
  );
  const end = clamp(
    Number.isFinite(candidateEnd) ? candidateEnd : safeDuration,
    start + minimumSpanSeconds,
    safeDuration
  );
  return { start, end };
};

const getFramePeak = (channels = [], index = 0) => {
  let peak = 0;
  for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
    const amplitude = Math.abs(channels[channelIndex]?.[index] || 0);
    if (amplitude > peak) peak = amplitude;
  }
  return peak;
};

const analyzeLoopWindowFromBuffer = (audioBuffer) => {
  const durationSeconds = Number(audioBuffer?.duration);
  if (!isFinitePositiveNumber(durationSeconds)) {
    return resolveLoopWindow(0, null);
  }
  const sampleRate = Number(audioBuffer?.sampleRate);
  const sampleCount = Number(audioBuffer?.length);
  const channelCount = Math.min(
    Number(audioBuffer?.numberOfChannels || 0),
    GAPLESS_LOOP_CONFIG.maxAnalyzedChannels
  );
  if (!isFinitePositiveNumber(sampleRate) || !sampleCount || !channelCount) {
    return resolveLoopWindow(durationSeconds, null);
  }

  const channels = Array.from({ length: channelCount }, (_, index) =>
    audioBuffer.getChannelData(index)
  );
  const threshold = GAPLESS_LOOP_CONFIG.silenceThreshold;

  let firstSignalIndex = 0;
  while (firstSignalIndex < sampleCount) {
    if (getFramePeak(channels, firstSignalIndex) > threshold) {
      break;
    }
    firstSignalIndex += 1;
  }
  if (firstSignalIndex >= sampleCount) {
    return resolveLoopWindow(durationSeconds, null);
  }

  let lastSignalIndex = sampleCount - 1;
  while (lastSignalIndex > firstSignalIndex) {
    if (getFramePeak(channels, lastSignalIndex) > threshold) {
      break;
    }
    lastSignalIndex -= 1;
  }

  const candidateStart = Math.max(
    firstSignalIndex / sampleRate - GAPLESS_LOOP_CONFIG.boundaryPaddingSeconds,
    0
  );
  const candidateEnd = Math.min(
    (lastSignalIndex + 1) / sampleRate + GAPLESS_LOOP_CONFIG.boundaryPaddingSeconds,
    durationSeconds
  );
  return resolveLoopWindow(durationSeconds, {
    start: candidateStart,
    end: candidateEnd,
  });
};

const detectGaplessLoopWindow = async (url = "", signal) => {
  if (!url || typeof window === "undefined") return null;
  const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
  if (typeof AudioContextImpl !== "function") return null;

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load soundtrack for loop analysis (${response.status})`);
  }
  const encodedAudioBuffer = await response.arrayBuffer();
  if (signal?.aborted) return null;

  const audioContext = new AudioContextImpl();
  try {
    const decodedAudioBuffer = await audioContext.decodeAudioData(
      encodedAudioBuffer.slice(0)
    );
    return analyzeLoopWindowFromBuffer(decodedAudioBuffer);
  } finally {
    await audioContext.close().catch(() => {});
  }
};

const formatTrackStamp = (value = "") => {
  const parsed = Date.parse(value || "");
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toLocaleString();
};

function StoryMusicTrackCard({
  track = {},
  isSelected = false,
  onSelect,
  loop = false,
  onLoopChange,
  autoPlayRequest = null,
  showSource = false,
}) {
  const {
    trackId = "",
    key = "",
    title = "",
    description = "",
    url = "",
    mood = "",
    energy = "",
    tempoBpm = null,
    tags = [],
    source = "",
    updatedAt = "",
    createdAt = "",
  } = track;

  const stampLabel = formatTrackStamp(updatedAt || createdAt);
  const sourceLabel = showSource
    ? source === "library"
      ? "Source: library"
      : source === "scene"
        ? "Source: scene"
        : source
          ? `Source: ${source}`
          : ""
    : "";
  const showMeta =
    Boolean(sourceLabel) ||
    Boolean(mood) ||
    Boolean(energy) ||
    Boolean(tempoBpm);
  const safeTagList = Array.isArray(tags) ? tags : [];
  const showLoopToggle = typeof onLoopChange === "function" && Boolean(url);
  const audioRef = useRef(null);
  const loopMonitorRef = useRef(null);
  const handledAutoPlayRequestRef = useRef("");
  const [gaplessLoopWindow, setGaplessLoopWindow] = useState(null);
  const [isPreparingGaplessLoop, setIsPreparingGaplessLoop] = useState(false);
  const prefersNativeLoop = loop && isLosslessLoopUrl(url);
  const useManualLoopFallback = loop && !prefersNativeLoop;
  const preloadMode = showLoopToggle ? "auto" : "metadata";

  const stopLoopMonitor = useCallback(() => {
    if (loopMonitorRef.current != null) {
      cancelAnimationFrame(loopMonitorRef.current);
      loopMonitorRef.current = null;
    }
  }, []);

  const syncLoopPosition = useCallback(() => {
    if (!useManualLoopFallback) return;
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const durationSeconds = Number(audioElement.duration);
    if (!isFinitePositiveNumber(durationSeconds)) return;

    const loopWindow = resolveLoopWindow(durationSeconds, gaplessLoopWindow);
    const restartAtSeconds = Math.max(
      loopWindow.end - GAPLESS_LOOP_CONFIG.restartSafetySeconds,
      loopWindow.start
    );
    if (audioElement.currentTime < restartAtSeconds) return;

    const overflowSeconds = Math.max(audioElement.currentTime - restartAtSeconds, 0);
    const nextTime = loopWindow.start + overflowSeconds;
    audioElement.currentTime =
      nextTime < loopWindow.end ? nextTime : loopWindow.start;
  }, [gaplessLoopWindow, useManualLoopFallback]);

  const startLoopMonitor = useCallback(() => {
    if (!useManualLoopFallback || loopMonitorRef.current != null) return;
    const tick = () => {
      syncLoopPosition();
      const audioElement = audioRef.current;
      if (
        !audioElement ||
        audioElement.paused ||
        audioElement.ended ||
        !useManualLoopFallback
      ) {
        loopMonitorRef.current = null;
        return;
      }
      loopMonitorRef.current = requestAnimationFrame(tick);
    };
    loopMonitorRef.current = requestAnimationFrame(tick);
  }, [syncLoopPosition, useManualLoopFallback]);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!useManualLoopFallback || !audioElement || !url) {
      setGaplessLoopWindow(null);
      setIsPreparingGaplessLoop(false);
      return undefined;
    }

    let isDisposed = false;
    const abortController = new AbortController();
    setIsPreparingGaplessLoop(true);

    const loadLoopWindow = async () => {
      try {
        const detectedWindow = await detectGaplessLoopWindow(
          url,
          abortController.signal
        );
        if (isDisposed) return;
        setGaplessLoopWindow(detectedWindow);
      } catch (error) {
        if (isDisposed || abortController.signal.aborted) return;
        setGaplessLoopWindow(null);
      } finally {
        if (!isDisposed) setIsPreparingGaplessLoop(false);
      }
    };

    loadLoopWindow();

    return () => {
      isDisposed = true;
      abortController.abort();
    };
  }, [url, useManualLoopFallback]);

  useEffect(() => {
    const requestId = String(autoPlayRequest?.requestId || "");
    const requestTrackKey = String(autoPlayRequest?.trackKey || "");
    const audioElement = audioRef.current;
    if (!requestId || !requestTrackKey || requestTrackKey !== key || !audioElement || !url) {
      return undefined;
    }
    if (handledAutoPlayRequestRef.current === requestId) {
      return undefined;
    }
    handledAutoPlayRequestRef.current = requestId;

    const attemptPlay = () => {
      const playPromise = audioElement.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    };

    if (audioElement.readyState >= 2) {
      attemptPlay();
      return undefined;
    }

    const handleCanPlay = () => {
      audioElement.removeEventListener("canplay", handleCanPlay);
      attemptPlay();
    };
    audioElement.addEventListener("canplay", handleCanPlay);
    return () => {
      audioElement.removeEventListener("canplay", handleCanPlay);
    };
  }, [autoPlayRequest, key, url]);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return undefined;

    const handlePlay = () => {
      if (!useManualLoopFallback) return;
      syncLoopPosition();
      startLoopMonitor();
    };
    const handlePause = () => {
      stopLoopMonitor();
    };
    const handleEnded = () => {
      if (!useManualLoopFallback) return;
      const loopWindow = resolveLoopWindow(audioElement.duration, gaplessLoopWindow);
      audioElement.currentTime = loopWindow.start;
      void audioElement.play().catch(() => {});
    };
    const handleLoadedMetadata = () => {
      if (!useManualLoopFallback) return;
      const loopWindow = resolveLoopWindow(audioElement.duration, gaplessLoopWindow);
      if (
        audioElement.currentTime < loopWindow.start ||
        audioElement.currentTime >= loopWindow.end
      ) {
        audioElement.currentTime = loopWindow.start;
      }
    };
    const handleTimeUpdate = () => {
      if (!useManualLoopFallback) return;
      syncLoopPosition();
    };

    audioElement.addEventListener("play", handlePlay);
    audioElement.addEventListener("pause", handlePause);
    audioElement.addEventListener("ended", handleEnded);
    audioElement.addEventListener("loadedmetadata", handleLoadedMetadata);
    audioElement.addEventListener("timeupdate", handleTimeUpdate);

    if (useManualLoopFallback && !audioElement.paused) {
      syncLoopPosition();
      startLoopMonitor();
    }

    return () => {
      audioElement.removeEventListener("play", handlePlay);
      audioElement.removeEventListener("pause", handlePause);
      audioElement.removeEventListener("ended", handleEnded);
      audioElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audioElement.removeEventListener("timeupdate", handleTimeUpdate);
      stopLoopMonitor();
    };
  }, [
    gaplessLoopWindow,
    startLoopMonitor,
    stopLoopMonitor,
    syncLoopPosition,
    useManualLoopFallback,
  ]);

  return (
    <div className={`music-library-item ${isSelected ? "music-library-item--selected" : ""}`}>
      <div className="music-library-item-head">
        <p className="music-library-item-title">{title || "Untitled track"}</p>
        <span className="music-library-item-date">{stampLabel}</span>
      </div>
      {description && <p className="music-library-item-description">{description}</p>}
      {url && (
        <audio
          ref={audioRef}
          className="music-library-audio"
          controls
          preload={preloadMode}
          src={url}
          loop={prefersNativeLoop}
        />
      )}
      {showLoopToggle && loop && (
        <p className="story-music-track-loop-note">
          {prefersNativeLoop
            ? "Seamless loop active (lossless mode)."
            : isPreparingGaplessLoop
              ? "Optimizing seamless loop..."
              : "Seamless loop active (compatibility mode)."}
        </p>
      )}
      {(typeof onSelect === "function" || showLoopToggle) && (
        <div className="story-music-track-item-actions">
          {typeof onSelect === "function" && (
            <button
              type="button"
              className="btn-ghost px-3 py-1 text-xs story-music-track-select-btn"
              onClick={() => onSelect(track)}
              disabled={isSelected}
            >
              {isSelected ? "Selected" : "Select"}
            </button>
          )}
          {showLoopToggle && (
            <label className="story-music-track-loop">
              <input
                type="checkbox"
                checked={loop}
                onChange={(event) => onLoopChange(event.target.checked)}
              />
              Loop
            </label>
          )}
        </div>
      )}
      {showMeta && (
        <div className="music-library-meta-row">
          {sourceLabel && <span className="music-library-pill">{sourceLabel}</span>}
          {mood && <span className="music-library-pill">Mood: {mood}</span>}
          {energy && <span className="music-library-pill">Energy: {energy}</span>}
          {tempoBpm ? <span className="music-library-pill">Tempo: {tempoBpm}</span> : null}
        </div>
      )}
      {safeTagList.length > 0 && (
        <div className="music-library-meta-row">
          {safeTagList.map((tag, index) => (
            <span key={`${trackId || key || title || "track"}-${tag}-${index}`} className="music-library-tag">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default StoryMusicTrackCard;
