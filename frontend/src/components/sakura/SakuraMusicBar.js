import React, { useState, useRef, useEffect, useCallback } from "react";
import { useMusic } from "../../contexts/MusicContext";

function formatTime(sec) {
  if (!sec || !isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SakuraMusicBar() {
  const { activeTrack, setActiveTrack } = useMusic();
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (activeTrack?.url && audioRef.current) {
      audioRef.current.src = activeTrack.url;
      audioRef.current.volume = muted ? 0 : volume;
      audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      setPlaying(false);
    }
  }, [activeTrack?.url]); // eslint-disable-line

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

  const handleClose = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setActiveTrack(null);
  }, [setActiveTrack]);

  if (!activeTrack) return null;

  return (
    <div className="skr-music-bar">
      <audio
        ref={audioRef}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => setPlaying(false)}
      />
      <div className="skr-music-info">
        <span className="skr-music-title">{activeTrack.title || "Untitled"}</span>
        {activeTrack.mood && <span className="skr-music-mood">{activeTrack.mood}</span>}
      </div>
      <div className="skr-music-controls">
        <button type="button" className="skr-music-btn" onClick={togglePlay}>
          {playing ? "⏸" : "▶"}
        </button>
        <span className="skr-music-time">{formatTime(currentTime)}</span>
        <div className="skr-music-progress" onClick={handleSeek}>
          <div className="skr-music-progress-fill" style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }} />
        </div>
        <span className="skr-music-time">{formatTime(duration)}</span>
      </div>
      <div className="skr-music-right">
        <button type="button" className="skr-music-btn" onClick={() => { setMuted(m => !m); if (audioRef.current) audioRef.current.volume = muted ? volume : 0; }}>
          {muted || volume === 0 ? "🔇" : "🔊"}
        </button>
        <button type="button" className="skr-music-btn" onClick={handleClose}>✕</button>
      </div>
    </div>
  );
}
