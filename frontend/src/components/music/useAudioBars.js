import { useEffect, useMemo, useRef, useState } from "react";

const BAR_COUNT = 24;
const FFT_SIZE = 512;
const SMOOTHING = 0.78;
const FPS_CAP = 30;
const IDLE_BAR_HEIGHT = 0.12;
const PEAK_THRESHOLD = 0.7;
const FALLBACK_BPM_DEFAULT = 96;

const ANALYZER_BAR_GAIN = 1.35;
const ANALYZER_LERP_FACTOR = 0.34;
const FALLBACK_BAR_SWAY = 0.2;
const FALLBACK_BEAT_WIDTH = 0.34;
const FALLBACK_BEAT_OFFSET = 0.09;
const FALLBACK_BEAT_GAIN = 0.48;
const FALLBACK_BAND_OFFSET = 0.9;
const FALLBACK_TIME_SPEED = 1.6;
const BAR_MIN = IDLE_BAR_HEIGHT;
const BAR_MAX = 1;
const SECOND_IN_MS = 1000;
const SAFE_BPM_MIN = 1;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getSafeBpm = (tempoBpm) => {
  const parsed = Number(tempoBpm);
  if (!Number.isFinite(parsed) || parsed < SAFE_BPM_MIN) return FALLBACK_BPM_DEFAULT;
  return parsed;
};

const createIdleBars = () => Array.from({ length: BAR_COUNT }, () => IDLE_BAR_HEIGHT);

const toNormalizedBars = (dataArray) => {
  const segmentSize = Math.max(1, Math.floor(dataArray.length / BAR_COUNT));
  const bars = [];
  for (let index = 0; index < BAR_COUNT; index += 1) {
    const start = index * segmentSize;
    const end = Math.min(start + segmentSize, dataArray.length);
    let sum = 0;
    let count = 0;
    for (let cursor = start; cursor < end; cursor += 1) {
      sum += dataArray[cursor];
      count += 1;
    }
    const avg = count > 0 ? sum / count : 0;
    const normalized = clamp((avg / 255) * ANALYZER_BAR_GAIN, BAR_MIN, BAR_MAX);
    bars.push(normalized);
  }
  return bars;
};

const blendBars = (previousBars, nextBars) =>
  nextBars.map((value, index) => {
    const previous = previousBars[index] ?? IDLE_BAR_HEIGHT;
    return clamp(
      previous + (value - previous) * ANALYZER_LERP_FACTOR,
      BAR_MIN,
      BAR_MAX
    );
  });

const computeFallbackBars = (timeSeconds, tempoBpm) => {
  const beatPeriod = 60 / getSafeBpm(tempoBpm);
  const beatPhase = (timeSeconds % beatPeriod) / beatPeriod;
  const beatShape = Math.max(
    0,
    1 - Math.abs(beatPhase - FALLBACK_BEAT_OFFSET) / FALLBACK_BEAT_WIDTH
  );
  return Array.from({ length: BAR_COUNT }, (_, index) => {
    const bandPosition = (index + FALLBACK_BAND_OFFSET) / BAR_COUNT;
    const sway = Math.sin(
      timeSeconds * FALLBACK_TIME_SPEED + bandPosition * Math.PI * 2
    );
    const value =
      IDLE_BAR_HEIGHT +
      Math.max(0, sway) * FALLBACK_BAR_SWAY +
      beatShape * FALLBACK_BEAT_GAIN * (1 - Math.abs(0.5 - bandPosition));
    return clamp(value, BAR_MIN, BAR_MAX);
  });
};

function useAudioBars({ audioRef, isPlaying, tempoBpm, trackKey }) {
  const [bars, setBars] = useState(() => createIdleBars());
  const [mode, setMode] = useState("fallback");
  const [isPeak, setIsPeak] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  const animationFrameRef = useRef(null);
  const lastFrameRef = useRef(0);
  const audioContextRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const analyserRef = useRef(null);
  const frequencyDataRef = useRef(null);

  const frameIntervalMs = useMemo(
    () => Math.round(SECOND_IN_MS / Math.max(1, FPS_CAP)),
    []
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyPreference = () => setIsReducedMotion(Boolean(mediaQuery.matches));
    applyPreference();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", applyPreference);
      return () => mediaQuery.removeEventListener("change", applyPreference);
    }
    mediaQuery.addListener(applyPreference);
    return () => mediaQuery.removeListener(applyPreference);
  }, []);

  useEffect(() => {
    if (!trackKey) {
      setBars(createIdleBars());
      setIsPeak(false);
      return;
    }
    setBars(createIdleBars());
    setIsPeak(false);
  }, [trackKey]);

  useEffect(() => {
    const audioElement = audioRef?.current;
    if (!audioElement || typeof window === "undefined") {
      setMode("fallback");
      return undefined;
    }
    const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
    if (typeof AudioContextImpl !== "function") {
      setMode("fallback");
      return undefined;
    }

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextImpl();
      }
      if (!mediaSourceRef.current) {
        mediaSourceRef.current = audioContextRef.current.createMediaElementSource(audioElement);
      }
      if (!analyserRef.current) {
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = SMOOTHING;
        mediaSourceRef.current.connect(analyser);
        analyser.connect(audioContextRef.current.destination);
        analyserRef.current = analyser;
      }
      if (!frequencyDataRef.current) {
        frequencyDataRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      }
      setMode("analyzer");
    } catch {
      setMode("fallback");
    }

    return () => {};
  }, [audioRef, trackKey]);

  useEffect(() => {
    if (!isPlaying || mode !== "analyzer") return;
    const context = audioContextRef.current;
    if (context && context.state === "suspended") {
      context.resume().catch(() => {});
    }
  }, [isPlaying, mode]);

  useEffect(() => {
    const stop = () => {
      if (animationFrameRef.current != null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastFrameRef.current = 0;
    };

    if (!isPlaying || isReducedMotion) {
      stop();
      setBars(createIdleBars());
      setIsPeak(false);
      return stop;
    }

    const tick = (timestamp) => {
      if (lastFrameRef.current && timestamp - lastFrameRef.current < frameIntervalMs) {
        animationFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      lastFrameRef.current = timestamp;

      if (mode === "analyzer" && analyserRef.current && frequencyDataRef.current) {
        analyserRef.current.getByteFrequencyData(frequencyDataRef.current);
        const normalizedBars = toNormalizedBars(frequencyDataRef.current);
        setBars((previousBars) => blendBars(previousBars, normalizedBars));
        const averageEnergy =
          normalizedBars.reduce((accumulator, value) => accumulator + value, 0) /
          normalizedBars.length;
        setIsPeak(averageEnergy >= PEAK_THRESHOLD);
      } else {
        const fallbackBars = computeFallbackBars(timestamp / SECOND_IN_MS, tempoBpm);
        setBars(fallbackBars);
        const averageEnergy =
          fallbackBars.reduce((accumulator, value) => accumulator + value, 0) /
          fallbackBars.length;
        setIsPeak(averageEnergy >= PEAK_THRESHOLD);
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
    return stop;
  }, [frameIntervalMs, isPlaying, isReducedMotion, mode, tempoBpm]);

  useEffect(
    () => () => {
      if (animationFrameRef.current != null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    },
    []
  );

  return { bars, mode, isPeak, isReducedMotion };
}

export default useAudioBars;
