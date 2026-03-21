import React, { useState, useRef, useEffect, useCallback } from "react";
import { useMusic } from "../../contexts/MusicContext";

/* ─── Yokai Music Bar ───
   Minimal terminal-style player fixed to bottom.
   Green-on-black with monospaced text and ASCII waveform.
*/

function formatTime(sec) {
  if (!sec || !isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ASCIIWaveform({ playing }) {
  const bars = "▁▂▃▄▅▆▇█";
  const [wave, setWave] = useState("▁▁▁▁▁▁▁▁");

  useEffect(() => {
    if (!playing) {
      setWave("▁▁▁▁▁▁▁▁");
      return;
    }
    const id = setInterval(() => {
      setWave(
        Array.from({ length: 8 }, () => bars[Math.floor(Math.random() * bars.length)]).join("")
      );
    }, 120);
    return () => clearInterval(id);
  }, [playing]);

  return <span className="yk-music-wave">{wave}</span>;
}

export default function YokaiMusicBar() {
  const { activeTrack, setActiveTrack } = useMusic();
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);

  useEffect(() => {
    if (activeTrack?.url && audioRef.current) {
      audioRef.current.src = activeTrack.url;
      audioRef.current.volume = volume;
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
    <div className="yk-music-bar">
      <audio
        ref={audioRef}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => setPlaying(false)}
      />

      <ASCIIWaveform playing={playing} />

      <button type="button" className="yk-music-btn" onClick={togglePlay}>
        {playing ? "[||]" : "[>]"}
      </button>

      <span className="yk-music-title">
        {activeTrack.title || "UNTITLED"}
      </span>

      <span className="yk-music-time">{formatTime(currentTime)}</span>
      <div className="yk-music-progress" onClick={handleSeek}>
        <div
          className="yk-music-progress-fill"
          style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
        />
      </div>
      <span className="yk-music-time">{formatTime(duration)}</span>

      <button type="button" className="yk-music-btn" onClick={handleClose}>
        [X]
      </button>
    </div>
  );
}
