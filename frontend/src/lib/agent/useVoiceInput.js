/**
 * useVoiceInput — wrap the Web Speech API for the agent composer.
 *
 * The browser-native SpeechRecognition handles transcription locally (Chrome
 * sends audio to Google's service, Safari uses Apple's on-device model). No
 * backend or API key required.
 *
 * Returns:
 *   { supported, listening, start(), stop(), transcript, error }
 *
 * The transcript accumulates partial results from every interim event, which
 * makes the composer feel responsive ("kitten" → "kitten in a" → "kitten in
 * a forest"). Caller is responsible for stopping (via the toggle button) or
 * letting it auto-stop on silence.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const getSpeechRecognition = () => {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

export default function useVoiceInput({ lang = "en-US", onResult } = {}) {
  const SpeechRecognition = getSpeechRecognition();
  const supported = Boolean(SpeechRecognition);

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // Build the recognition instance lazily so we don't spin one up unless
  // the user actually engages the mic.
  const ensureRecognition = useCallback(() => {
    if (!supported) return null;
    if (recognitionRef.current) return recognitionRef.current;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i += 1) {
        text += event.results[i][0]?.transcript || "";
      }
      setTranscript(text);
      if (typeof onResultRef.current === "function") onResultRef.current(text);
    };
    recognition.onerror = (event) => {
      setError(event?.error || "speech_error");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    return recognition;
  }, [SpeechRecognition, lang, supported]);

  const start = useCallback(() => {
    if (!supported) return;
    setError(null);
    setTranscript("");
    const recognition = ensureRecognition();
    if (!recognition) return;
    try {
      recognition.start();
      setListening(true);
    } catch (err) {
      // "already started" — flip state without bubbling
      if (!String(err?.message || "").includes("already")) setError(err?.message || "start_failed");
    }
  }, [supported, ensureRecognition]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    }
    setListening(false);
  }, []);

  // Cleanup on unmount — important when the user navigates away mid-listen.
  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;
      if (recognition) {
        try {
          recognition.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return { supported, listening, start, stop, transcript, error };
}
