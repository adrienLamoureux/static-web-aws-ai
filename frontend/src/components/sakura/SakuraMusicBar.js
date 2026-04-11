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
  const panelRef = useRef(null);

  const { bars, isPeak } = useAudioBars({
    audioRef,
    isPlaying: playing,
    tempoBpm: currentTrack?.tempoBpm,
    trackKey: currentTrack?.key,
  });

  // 24 bars from the hook is too many for the compact pill — sample 10 from the
  // mid frequency range so the visualizer reads cleanly at this size.
  const visibleBars = useMemo(
    () => bars.filter((_, i) => i % 2 === 0).slice(2, 12),
    [bars]
  );

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
      audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }, [autoPlayRequest, currentTrack?.url]);

  // Close panel when clicking outside
  useEffect(() => {
    if (!expanded) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setExpanded(false);
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
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [playing, currentTrack?.url]);

  const handleSeek = useCallback((e) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = ratio * duration;
  }, [duration]);

  const handleStop = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    dismissTrack();
  }, [dismissTrack]);

  const handlePickTrack = useCallback((track) => {
    setExpanded(false);
    playTrack(track);
  }, [playTrack]);

  const progress = duration ? (currentTime / duration) * 100 : 0;

  const pillClass = `skr-music-pill${playing ? " is-playing" : ""}${isPeak ? " is-peak" : ""}`;

  return (
    <div className={pillClass} ref={panelRef}>
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        loop
      />

      {/* Audio-reactive spectrum or idle note */}
      <div className={`skr-music-eq${playing ? " is-playing" : ""}`} aria-hidden="true">
        {currentTrack ? (
          visibleBars.map((h, i) => (
            <span key={i} style={{ "--skr-bar-h": h }} />
          ))
        ) : (
          <span className="skr-music-note">♪</span>
        )}
      </div>

      {/* Track name or idle label */}
      <span className="skr-music-pill-title">
        {currentTrack ? (currentTrack.title || "Untitled") : "Music"}
      </span>

      {/* Play/pause — only when a track is loaded */}
      {currentTrack && (
        <button type="button" className="skr-music-pill-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "⏸" : "▶"}
        </button>
      )}

      {/* Stop — only when a track is loaded */}
      {currentTrack && (
        <button type="button" className="skr-music-pill-btn skr-music-pill-close" onClick={handleStop} aria-label="Stop">
          ✕
        </button>
      )}

      {/* Expand toggle */}
      <button
        type="button"
        className={`skr-music-pill-btn skr-music-pill-expand${expanded ? " is-open" : ""}`}
        onClick={() => setExpanded(v => !v)}
        aria-label="Toggle track list"
      >
        ▾
      </button>

      {/* Progress bar */}
      {currentTrack && (
        <div className="skr-music-pill-progress" onClick={handleSeek} role="progressbar">
          <div className="skr-music-pill-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Track picker panel */}
      {expanded && (
        <div className="skr-music-pill-panel">
          {tracks.length === 0 ? (
            <p className="skr-music-pill-empty">No tracks available</p>
          ) : (
            <ul className="skr-music-pill-list">
              {tracks.map((t) => (
                <li
                  key={t.key || t.url}
                  className={`skr-music-pill-track${currentTrack?.key === t.key ? " is-active" : ""}`}
                  onClick={() => handlePickTrack(t)}
                >
                  <span className="skr-music-pill-track-icon">
                    {currentTrack?.key === t.key && playing ? "⏸" : "▶"}
                  </span>
                  <span className="skr-music-pill-track-name">{t.title || "Untitled"}</span>
                  {t.mood && <span className="skr-music-pill-track-tag">{t.mood}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
