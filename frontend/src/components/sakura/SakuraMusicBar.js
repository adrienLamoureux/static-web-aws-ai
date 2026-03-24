import React, { useState, useRef, useEffect, useCallback } from "react";
import { useMusic } from "../../contexts/MusicContext";

export default function SakuraMusicBar() {
  const { currentTrack, autoPlayRequest, dismissTrack } = useMusic();
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const lastRequestId = useRef(0);

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

  const handleClose = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    dismissTrack();
  }, [dismissTrack]);

  if (!currentTrack) return null;

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="skr-music-pill">
      <audio
        ref={audioRef}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => setPlaying(false)}
      />
      <div className={`skr-music-eq${playing ? " is-playing" : ""}`} aria-hidden="true">
        <span /><span /><span />
      </div>
      <span className="skr-music-pill-title">{currentTrack.title || "Untitled"}</span>
      <button type="button" className="skr-music-pill-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "⏸" : "▶"}
      </button>
      <button type="button" className="skr-music-pill-btn skr-music-pill-close" onClick={handleClose} aria-label="Close">
        ✕
      </button>
      <div className="skr-music-pill-progress" onClick={handleSeek} role="progressbar">
        <div className="skr-music-pill-progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
