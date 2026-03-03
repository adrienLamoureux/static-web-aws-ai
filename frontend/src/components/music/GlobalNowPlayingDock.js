import React, { useEffect, useMemo, useRef, useState } from "react";
import useAudioBars from "./useAudioBars";

const DEFAULT_TRACK_TITLE = "Soundtrack";
const SEEK_SCALE = 1000;
const START_TIME_SECONDS = 0;
const TAG_LIMIT = 3;
const MIN_DURATION_SECONDS = 0;

const formatTime = (value) => {
  const safeValue = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const minutes = Math.floor(safeValue / 60);
  const seconds = safeValue % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function GlobalNowPlayingDock({ nowPlayingTrack }) {
  const audioRef = useRef(null);
  const [isLooping, setIsLooping] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(START_TIME_SECONDS);
  const [durationSeconds, setDurationSeconds] = useState(MIN_DURATION_SECONDS);

  const trackKey = String(nowPlayingTrack?.key || "").trim();
  const trackUrl = String(nowPlayingTrack?.url || "").trim();
  const trackTitle = nowPlayingTrack?.title || DEFAULT_TRACK_TITLE;
  const sourceLabel =
    nowPlayingTrack?.source === "library"
      ? "Library"
      : nowPlayingTrack?.source === "scene"
        ? "Scene"
        : "";
  const tagList = Array.isArray(nowPlayingTrack?.tags)
    ? nowPlayingTrack.tags.filter(Boolean).slice(0, TAG_LIMIT)
    : [];
  const hasTrack = Boolean(trackUrl);

  const { bars, mode, isPeak, isReducedMotion } = useAudioBars({
    audioRef,
    isPlaying,
    tempoBpm: nowPlayingTrack?.tempoBpm,
    trackKey,
  });

  const seekValue = useMemo(() => {
    if (!durationSeconds) return 0;
    return clamp((elapsedSeconds / durationSeconds) * SEEK_SCALE, 0, SEEK_SCALE);
  }, [durationSeconds, elapsedSeconds]);

  useEffect(() => {
    if (!hasTrack) {
      setElapsedSeconds(START_TIME_SECONDS);
      setDurationSeconds(MIN_DURATION_SECONDS);
      setIsPlaying(false);
      return;
    }
    setElapsedSeconds(START_TIME_SECONDS);
    setDurationSeconds(MIN_DURATION_SECONDS);
    setIsPlaying(false);
  }, [hasTrack, trackKey, trackUrl]);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;
    audioElement.loop = isLooping;
  }, [isLooping]);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;
    audioElement.muted = isMuted;
  }, [isMuted]);

  const handleTogglePlay = () => {
    const audioElement = audioRef.current;
    if (!audioElement || !hasTrack) return;
    if (audioElement.paused) {
      audioElement.play().catch(() => {});
      return;
    }
    audioElement.pause();
  };

  const handleSeek = (event) => {
    const audioElement = audioRef.current;
    if (!audioElement || !durationSeconds) return;
    const nextValue = Number(event.target.value);
    if (!Number.isFinite(nextValue)) return;
    const nextTime = clamp((nextValue / SEEK_SCALE) * durationSeconds, 0, durationSeconds);
    audioElement.currentTime = nextTime;
    setElapsedSeconds(nextTime);
  };

  if (!hasTrack) return null;

  return (
    <aside className="pixnovel-global-music-dock" aria-label="Global soundtrack player">
      <audio
        ref={audioRef}
        className="pixnovel-global-music-audio"
        preload="metadata"
        src={trackUrl}
        crossOrigin="anonymous"
        onLoadedMetadata={(event) => {
          const nextDuration = Number(event.currentTarget.duration);
          setDurationSeconds(Number.isFinite(nextDuration) ? nextDuration : MIN_DURATION_SECONDS);
        }}
        onTimeUpdate={(event) => {
          const nextElapsed = Number(event.currentTarget.currentTime);
          const nextDuration = Number(event.currentTarget.duration);
          setElapsedSeconds(Number.isFinite(nextElapsed) ? nextElapsed : START_TIME_SECONDS);
          setDurationSeconds(Number.isFinite(nextDuration) ? nextDuration : MIN_DURATION_SECONDS);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="pixnovel-global-music-head">
        <p className="pixnovel-global-music-kicker">Now Playing</p>
        <span className="pixnovel-global-music-mode">{mode}</span>
      </div>

      <p className="pixnovel-global-music-title">{trackTitle}</p>

      <div className="pixnovel-global-music-meta-row">
        {sourceLabel ? <span className="pixnovel-global-music-chip">{sourceLabel}</span> : null}
        {nowPlayingTrack?.mood ? (
          <span className="pixnovel-global-music-chip">{nowPlayingTrack.mood}</span>
        ) : null}
        {nowPlayingTrack?.energy ? (
          <span className="pixnovel-global-music-chip">{nowPlayingTrack.energy}</span>
        ) : null}
      </div>

      {tagList.length > 0 ? (
        <div className="pixnovel-global-music-tags">
          {tagList.map((tag, index) => (
            <span key={`${trackKey || "track"}-${tag}-${index}`} className="pixnovel-global-music-tag">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div
        className={`pixnovel-global-music-bars${isPeak ? " is-peak" : ""}${
          isPlaying ? " is-playing" : ""
        }${isReducedMotion ? " is-reduced-motion" : ""}`}
        aria-hidden="true"
      >
        {bars.map((value, index) => (
          <span
            key={`${trackKey || "track"}-bar-${index}`}
            className="pixnovel-global-music-bar"
            style={{ "--pix-bar-scale": clamp(value, 0, 1) }}
          />
        ))}
      </div>

      <div className="pixnovel-global-music-controls" role="group" aria-label="Soundtrack controls">
        <button
          type="button"
          className="pixnovel-global-music-btn"
          onClick={handleTogglePlay}
          aria-label={isPlaying ? "Pause soundtrack" : "Play soundtrack"}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="pixnovel-global-music-btn"
          onClick={() => setIsMuted((previous) => !previous)}
          aria-label={isMuted ? "Unmute soundtrack" : "Mute soundtrack"}
        >
          {isMuted ? "Unmute" : "Mute"}
        </button>
        <button
          type="button"
          className={`pixnovel-global-music-btn${isLooping ? " is-active" : ""}`}
          onClick={() => setIsLooping((previous) => !previous)}
          aria-label={isLooping ? "Disable loop" : "Enable loop"}
        >
          Loop
        </button>
      </div>

      <div className="pixnovel-global-music-progress">
        <span>{formatTime(elapsedSeconds)}</span>
        <input
          type="range"
          min="0"
          max={String(SEEK_SCALE)}
          step="1"
          value={String(Math.round(seekValue))}
          onChange={handleSeek}
          aria-label="Seek soundtrack position"
        />
        <span>{formatTime(durationSeconds)}</span>
      </div>
    </aside>
  );
}

export default GlobalNowPlayingDock;
