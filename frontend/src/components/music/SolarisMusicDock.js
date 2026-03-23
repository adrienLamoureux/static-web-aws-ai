import React, { useEffect, useMemo, useRef, useState } from "react";
import useAudioBars from "./useAudioBars";
import { useMusic } from "../../contexts/MusicContext";

const DEFAULT_TRACK_TITLE = "Soundtrack";
const EMPTY_TRACK_TITLE = "No soundtrack selected";
const EMPTY_TRACK_OPTION = "No music available";
const SEEK_SCALE = 1000;
const START_TIME_SECONDS = 0;
const TAG_LIMIT = 3;
const MIN_DURATION_SECONDS = 0;
const MODE_IDLE = "idle";
const SOURCE_LIBRARY = "library";
const SOURCE_SCENE = "scene";
const EXPAND_LABEL = "Expand music player";
const COLLAPSE_LABEL = "Collapse music player";
const TRACK_PICKER_LABEL = "Choose music track";
const NOW_PLAYING_LABEL = "Now Playing";
const TRACK_LABEL = "Track";
const FALLBACK_TRACK_SOURCE = SOURCE_LIBRARY;

const formatTime = (value) => {
  const safeValue = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const minutes = Math.floor(safeValue / 60);
  const seconds = safeValue % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const parseTrackStamp = (value = "") => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

const toTrackIdentity = (track = {}) =>
  String(track?.key || track?.url || "").trim();

const normalizeTrack = (track = {}, fallbackSource = FALLBACK_TRACK_SOURCE) => {
  const url = String(track?.url || "").trim();
  if (!url) return null;
  return {
    key: String(track?.key || "").trim(),
    url,
    title: String(track?.title || DEFAULT_TRACK_TITLE).trim() || DEFAULT_TRACK_TITLE,
    source: String(track?.source || fallbackSource || FALLBACK_TRACK_SOURCE).trim(),
    mood: String(track?.mood || "").trim(),
    energy: String(track?.energy || "").trim(),
    tempoBpm: typeof track?.tempoBpm === "number" ? track.tempoBpm : null,
    tags: Array.isArray(track?.tags) ? track.tags.filter(Boolean) : [],
    updatedAt: String(track?.updatedAt || "").trim(),
  };
};

const buildTrackCatalog = (availableTracks = [], nowPlayingTrack = null) => {
  const normalizedTracks = Array.isArray(availableTracks)
    ? availableTracks
        .map((track) => normalizeTrack(track, track?.source || FALLBACK_TRACK_SOURCE))
        .filter(Boolean)
    : [];
  const trackMap = new Map();

  const appendTrack = (track) => {
    if (!track) return;
    const identity = toTrackIdentity(track);
    if (!identity) return;
    const previousTrack = trackMap.get(identity);
    if (!previousTrack) {
      trackMap.set(identity, track);
      return;
    }
    if (parseTrackStamp(track.updatedAt) >= parseTrackStamp(previousTrack.updatedAt)) {
      trackMap.set(identity, { ...previousTrack, ...track });
    }
  };

  normalizedTracks.forEach(appendTrack);
  appendTrack(normalizeTrack(nowPlayingTrack, nowPlayingTrack?.source || SOURCE_SCENE));

  return [...trackMap.values()].sort(
    (left, right) => parseTrackStamp(right.updatedAt) - parseTrackStamp(left.updatedAt)
  );
};

const formatTrackOption = (track = {}) => {
  const sourceLabel =
    track?.source === SOURCE_LIBRARY
      ? "Library"
      : track?.source === SOURCE_SCENE
        ? "Scene"
        : "Track";
  return `${track.title || DEFAULT_TRACK_TITLE} · ${sourceLabel}`;
};

function SolarisMusicDock({ nowPlayingTrack: nowPlayingProp, availableTracks: availProp }) {
  const { tracks: contextTracks, currentTrack: contextCurrentTrack, autoPlayRequest } = useMusic();
  // Props take priority if provided; otherwise fall back to context values
  const nowPlayingTrack = nowPlayingProp || contextCurrentTrack || null;
  const availableTracks = Array.isArray(availProp) && availProp.length > 0 ? availProp : (contextTracks || []);
  const audioRef = useRef(null);
  const lastPlayRequestId = useRef(0);
  const [isLooping, setIsLooping] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedTrackIdentity, setSelectedTrackIdentity] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(START_TIME_SECONDS);
  const [durationSeconds, setDurationSeconds] = useState(MIN_DURATION_SECONDS);

  const trackCatalog = useMemo(
    () => buildTrackCatalog(availableTracks, nowPlayingTrack),
    [availableTracks, nowPlayingTrack]
  );

  useEffect(() => {
    if (!trackCatalog.length) {
      setSelectedTrackIdentity("");
      return;
    }
    setSelectedTrackIdentity((previousIdentity) => {
      if (previousIdentity) {
        const previousTrackExists = trackCatalog.some(
          (track) => toTrackIdentity(track) === previousIdentity
        );
        if (previousTrackExists) return previousIdentity;
      }
      const nowPlayingIdentity = toTrackIdentity(nowPlayingTrack);
      if (
        nowPlayingIdentity &&
        trackCatalog.some((track) => toTrackIdentity(track) === nowPlayingIdentity)
      ) {
        return nowPlayingIdentity;
      }
      return toTrackIdentity(trackCatalog[0]);
    });
  }, [trackCatalog, nowPlayingTrack]);

  const selectedTrack = useMemo(() => {
    if (!trackCatalog.length) return null;
    return (
      trackCatalog.find((track) => toTrackIdentity(track) === selectedTrackIdentity) ||
      trackCatalog[0]
    );
  }, [selectedTrackIdentity, trackCatalog]);

  const trackKey = toTrackIdentity(selectedTrack);
  const trackUrl = String(selectedTrack?.url || "").trim();
  const hasTrack = Boolean(trackUrl);
  const trackTitle = hasTrack
    ? selectedTrack?.title || DEFAULT_TRACK_TITLE
    : EMPTY_TRACK_TITLE;
  const sourceLabel =
    selectedTrack?.source === SOURCE_LIBRARY
      ? "Library"
      : selectedTrack?.source === SOURCE_SCENE
        ? "Scene"
        : "";
  const tagList = Array.isArray(selectedTrack?.tags)
    ? selectedTrack.tags.filter(Boolean).slice(0, TAG_LIMIT)
    : [];

  const { bars, mode, isPeak, isReducedMotion } = useAudioBars({
    audioRef,
    isPlaying,
    tempoBpm: selectedTrack?.tempoBpm,
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

  // Respond to playTrack() calls from MusicContext — select + auto-play the track
  useEffect(() => {
    const requestId = autoPlayRequest?.requestId;
    const requestKey = autoPlayRequest?.trackKey;
    if (!requestId || !requestKey || requestId === lastPlayRequestId.current) return;
    lastPlayRequestId.current = requestId;
    setSelectedTrackIdentity(requestKey);
    // Brief delay to let React re-render with the new <audio> src before calling play()
    const timer = setTimeout(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.loop = isLooping;
      audio.play().catch(() => {});
    }, 150);
    return () => clearTimeout(timer);
  }, [autoPlayRequest, isLooping]);

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

  const modeLabel = hasTrack ? mode : MODE_IDLE;

  const barsMarkup = (
    <div
      className={`skr-music-bars${isPeak ? " is-peak" : ""}${
        isPlaying ? " is-playing" : ""
      }${isReducedMotion ? " is-reduced-motion" : ""}${hasTrack ? "" : " is-empty"}`}
      aria-hidden="true"
    >
      {bars.map((value, index) => (
        <span
          key={`${trackKey || "track"}-bar-${index}`}
          className="skr-music-bar"
          style={{ "--skr-bar-scale": clamp(value, 0, 1), height: `${clamp(value, 0, 1) * 100}%` }}
        />
      ))}
    </div>
  );

  return (
    <aside
      className={`skr-music-dock${hasTrack ? "" : " is-idle"}${
        isExpanded ? " is-expanded" : " is-compact"
      }`}
      aria-label="Global soundtrack player"
    >
      {hasTrack ? (
        <audio
          ref={audioRef}
          className="skr-music-audio"
          preload="metadata"
          src={trackUrl}
          loop={isLooping}
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
      ) : null}

      {/* Track picker — visible only when expanded */}
      {isExpanded && (
        <div className="skr-music-expanded-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              className="skr-field-select"
              style={{ flex: 1, fontSize: 12 }}
              value={selectedTrackIdentity}
              onChange={(event) => setSelectedTrackIdentity(event.target.value)}
              aria-label={TRACK_PICKER_LABEL}
              disabled={!trackCatalog.length}
            >
              {trackCatalog.length ? (
                trackCatalog.map((track) => {
                  const identity = toTrackIdentity(track);
                  return (
                    <option key={identity} value={identity}>
                      {formatTrackOption(track)}
                    </option>
                  );
                })
              ) : (
                <option value="">{EMPTY_TRACK_OPTION}</option>
              )}
            </select>
            <button
              type="button"
              className="skr-music-toggle"
              onClick={() => setIsExpanded(false)}
              aria-label={COLLAPSE_LABEL}
              style={{ flexShrink: 0 }}
            >
              ×
            </button>
          </div>
          {(sourceLabel || selectedTrack?.mood || selectedTrack?.energy || tagList.length > 0) && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {sourceLabel ? <span className="skr-lora-chip">{sourceLabel}</span> : null}
              {selectedTrack?.mood ? <span className="skr-lora-chip">{selectedTrack.mood}</span> : null}
              {selectedTrack?.energy ? <span className="skr-lora-chip">{selectedTrack.energy}</span> : null}
              {tagList.map((tag, index) => (
                <span key={`${trackKey || "track"}-${tag}-${index}`} className="skr-track-tag">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Compact bar — always visible */}
      <div className="skr-music-compact-bar">
        {barsMarkup}

        <button
          type="button"
          className="skr-music-controls-btn"
          onClick={handleTogglePlay}
          aria-label={isPlaying ? "Pause soundtrack" : "Play soundtrack"}
          disabled={!hasTrack}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>

        <span
          className="skr-music-track-name"
          title={hasTrack ? trackTitle : undefined}
          style={{ fontSize: 12, flex: 1, minWidth: 0 }}
        >
          {trackTitle}
        </span>

        {hasTrack && (
          <>
            <span className="skr-music-time">{formatTime(elapsedSeconds)}</span>
            <input
              type="range"
              className="skr-music-progress"
              style={{ width: 90, flexShrink: 0 }}
              min="0"
              max={String(SEEK_SCALE)}
              step="1"
              value={String(Math.round(seekValue))}
              onChange={handleSeek}
              aria-label="Seek soundtrack position"
              disabled={durationSeconds <= MIN_DURATION_SECONDS}
            />
            <span className="skr-music-time">{formatTime(durationSeconds)}</span>
          </>
        )}

        <button
          type="button"
          className={`skr-music-controls-btn${isLooping ? " active" : ""}`}
          onClick={() => setIsLooping((previous) => !previous)}
          aria-label={isLooping ? "Disable loop" : "Enable loop"}
          disabled={!hasTrack}
          title="Loop"
        >
          ↺
        </button>
        <button
          type="button"
          className={`skr-music-controls-btn${isMuted ? " active" : ""}`}
          onClick={() => setIsMuted((previous) => !previous)}
          aria-label={isMuted ? "Unmute soundtrack" : "Mute soundtrack"}
          disabled={!hasTrack}
        >
          {isMuted ? "🔇" : "🔊"}
        </button>
        <button
          type="button"
          className="skr-music-toggle"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-label={isExpanded ? COLLAPSE_LABEL : EXPAND_LABEL}
          title="Track list"
        >
          ≡
        </button>
      </div>
    </aside>
  );
}

export default SolarisMusicDock;
