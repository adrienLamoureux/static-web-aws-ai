import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useMusic } from "../../contexts/MusicContext";
import useAudioBars from "../music/useAudioBars";

export default function SakuraMusicBar() {
  const { tracks, currentTrack, autoPlayRequest, playTrack, dismissTrack } = useMusic();
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const lastRequestId = useRef(0);
  const rootRef = useRef(null);

  const { bars, isPeak } = useAudioBars({
    audioRef,
    isPlaying: playing,
    tempoBpm: currentTrack?.tempoBpm,
    trackKey: currentTrack?.key,
  });

  // 5 evenly-spaced bars for the compact pill waveform
  const pillBars = useMemo(() => bars.filter((_, i) => i % 4 === 0).slice(1, 6), [bars]);

  useEffect(() => {
    if (currentTrack?.url && audioRef.current) {
      audioRef.current.src = currentTrack.url;
      audioRef.current.volume = 0.7;
    } else if (!currentTrack && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [currentTrack?.url]); // eslint-disable-line

  useEffect(() => {
    if (!autoPlayRequest?.requestId || autoPlayRequest.requestId === lastRequestId.current) return;
    lastRequestId.current = autoPlayRequest.requestId;
    if (audioRef.current && currentTrack?.url) {
      audioRef.current
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    }
  }, [autoPlayRequest, currentTrack?.url]);

  useEffect(() => {
    if (!expanded) return;
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setExpanded(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current || !currentTrack?.url) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setPlaying(true))
        .catch(() => {});
    }
  }, [playing, currentTrack?.url]);

  const handleOrbClick = useCallback(() => {
    if (currentTrack) togglePlay();
    else setExpanded((v) => !v);
  }, [currentTrack, togglePlay]);

  const handleSeek = useCallback(
    (e) => {
      if (!audioRef.current || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audioRef.current.currentTime = ratio * duration;
    },
    [duration]
  );

  const handleStop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    dismissTrack();
  }, [dismissTrack]);

  const handlePickTrack = useCallback(
    (track) => {
      setExpanded(false);
      playTrack(track);
    },
    [playTrack]
  );

  const progress = duration ? (currentTime / duration) * 100 : 0;

  const rootClass = [
    "skr-music",
    currentTrack ? "has-track" : "",
    playing ? "is-playing" : "",
    isPeak ? "is-peak" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const orbIcon = currentTrack ? (playing ? "⏸" : "▶") : "♪";
  const orbLabel = currentTrack
    ? playing
      ? "Pause"
      : "Play"
    : expanded
      ? "Close music library"
      : "Open music library";

  return (
    <div className={rootClass} ref={rootRef}>
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        loop
      />

      {/* Track info pill — only visible when a track is loaded */}
      {currentTrack && (
        <div className="skr-music-pill">
          <div className="skr-music-pill-head">
            <span className="skr-music-title">
              {playing && <span className="skr-music-live-dot" aria-hidden="true" />}
              {currentTrack.title || "Untitled"}
            </span>
            {currentTrack.mood && <span className="skr-music-mood">{currentTrack.mood}</span>}
          </div>

          <div className="skr-music-wave" aria-hidden="true">
            {pillBars.map((h, i) => (
              <span key={i} style={{ "--skr-bar-h": h }} />
            ))}
          </div>

          <button
            type="button"
            className="skr-music-chip"
            onClick={handleStop}
            aria-label="Stop"
            title="Stop"
          >
            ✕
          </button>

          <div
            className="skr-music-scrub"
            onClick={handleSeek}
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="skr-music-scrub-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Library trigger — visible beside the pill when a track is loaded */}
      {currentTrack && (
        <button
          type="button"
          className={`skr-music-lib${expanded ? " is-open" : ""}`}
          onClick={() => setExpanded((v) => !v)}
          aria-label="Toggle music library"
          title="Music library"
        >
          ♬
        </button>
      )}

      {/* Orb — always visible, primary click target */}
      <button
        type="button"
        className="skr-music-orb"
        onClick={handleOrbClick}
        aria-label={orbLabel}
        style={{ "--skr-music-progress": `${progress * 3.6}deg` }}
      >
        <span className="skr-music-orb-ring" aria-hidden="true" />
        <span className="skr-music-orb-disc" aria-hidden="true" />
        <span className="skr-music-orb-icon">{orbIcon}</span>
      </button>

      {/* Track picker panel */}
      {expanded && (
        <div className="skr-music-panel">
          {tracks.length === 0 ? (
            <p className="skr-music-panel-empty">No tracks available</p>
          ) : (
            <ul className="skr-music-panel-list">
              {tracks.map((t) => (
                <li
                  key={t.key || t.url}
                  className={`skr-music-panel-track${currentTrack?.key === t.key ? " is-active" : ""}`}
                  onClick={() => handlePickTrack(t)}
                >
                  <span className="skr-music-panel-icon">
                    {currentTrack?.key === t.key && playing ? "⏸" : "▶"}
                  </span>
                  <span className="skr-music-panel-name">{t.title || "Untitled"}</span>
                  {t.mood && <span className="skr-music-panel-tag">{t.mood}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
