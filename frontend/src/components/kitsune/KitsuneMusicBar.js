import React, { useState, useRef, useEffect, useCallback } from "react";
import { useMusic } from "../../contexts/MusicContext";

/* ─── Kitsune Music Bar ───
   Spotify-style now-playing bar fixed to bottom of main content area.
   Connects to the shared MusicContext for cross-page track playback.
*/

function formatTime(sec) {
  if (!sec || !isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function KitsuneMusicBar() {
  const { activeTrack, setActiveTrack } = useMusic();
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);

  // Auto-play when track changes
  useEffect(() => {
    if (activeTrack?.url && audioRef.current) {
      audioRef.current.src = activeTrack.url;
      audioRef.current.volume = muted ? 0 : volume;
      audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      setPlaying(false);
    }
  }, [activeTrack?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = useCallback(() => {
    if (!audioRef.current || !activeTrack?.url) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [playing, activeTrack?.url]);

  const handleSeek = useCallback((e) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = ratio * duration;
  }, [duration]);

  const handleVolumeChange = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setVolume(ratio);
    setMuted(false);
    if (audioRef.current) audioRef.current.volume = ratio;
  }, []);

  const handleClose = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setActiveTrack(null);
  }, [setActiveTrack]);

  if (!activeTrack) return null;

  return (
    <div className="kit-music-bar">
      <audio
        ref={audioRef}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => setPlaying(false)}
      />

      {/* Track info */}
      <div className="kit-music-info">
        <span className="kit-music-title">{activeTrack.title || "Untitled"}</span>
        {activeTrack.mood && (
          <span className="kit-music-meta">{activeTrack.mood}</span>
        )}
      </div>

      {/* Controls */}
      <div className="kit-music-controls">
        <button type="button" className="kit-music-btn" onClick={togglePlay}>
          {playing ? "⏸" : "▶"}
        </button>

        <span className="kit-music-time">{formatTime(currentTime)}</span>
        <div className="kit-music-progress" onClick={handleSeek}>
          <div
            className="kit-music-progress-fill"
            style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
          />
        </div>
        <span className="kit-music-time">{formatTime(duration)}</span>
      </div>

      {/* Volume + close */}
      <div className="kit-music-right">
        <button
          type="button"
          className="kit-music-btn"
          onClick={() => {
            setMuted((m) => !m);
            if (audioRef.current) audioRef.current.volume = muted ? volume : 0;
          }}
        >
          {muted || volume === 0 ? "🔇" : "🔊"}
        </button>
        <div className="kit-music-volume" onClick={handleVolumeChange}>
          <div
            className="kit-music-volume-fill"
            style={{ width: `${muted ? 0 : volume * 100}%` }}
          />
        </div>
        <button type="button" className="kit-music-btn kit-music-close" onClick={handleClose}>
          ✕
        </button>
      </div>
    </div>
  );
}
