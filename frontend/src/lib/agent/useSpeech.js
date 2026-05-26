/**
 * useSpeech — text-to-speech wrapper around window.speechSynthesis.
 *
 * Browser-native — no backend, no API key. Lets Hiyori actually say her
 * replies out loud when the user enables the 🔊 toggle next to the mic.
 *
 * Returns:
 *   {
 *     supported,           // browser has speechSynthesis
 *     speaking,            // currently mid-utterance
 *     enabled,             // user preference (persisted)
 *     setEnabled(boolean), // toggle persistence
 *     speak(text),         // strip emotion tags + queue an utterance
 *     stop(),              // cancel current + clear queue
 *   }
 *
 * Persistence: localStorage["skr-tts-enabled"] = "1" | "0".
 *
 * Auto-stops on unmount so leaving a stage mid-utterance doesn't carry
 * a phantom voice into the next page.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "skr-tts-enabled";

// Strip the [EMOTION: …] tag the agent appends to every reply — it's an
// out-of-band signal for the Live2D engine, not part of what we should
// speak.
const EMOTION_RE = /\[EMOTION:\s*\w+\]/gi;
const stripForSpeech = (text) => {
  if (text == null) return "";
  return String(text)
    .replace(EMOTION_RE, "")
    .replace(/\s+/g, " ")
    .trim();
};

const getSynth = () => {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis || null;
};

const readEnabled = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const writeEnabled = (value) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // ignore (quota / private mode)
  }
};

/**
 * Pick a voice that fits Hiyori best when available. Preference order:
 *   1. en-US voice with "female" in the name
 *   2. ja-JP voice (if user has one installed — sounds delightful for the
 *      character even when speaking English)
 *   3. any en-US voice
 *   4. system default (no voice override)
 */
const pickVoice = (voices = []) => {
  if (!voices.length) return null;
  const byLang = (lang) => voices.find((v) => v.lang?.startsWith(lang));
  const female = voices.find(
    (v) => v.lang?.startsWith("en") && /female|samantha|victoria|karen|moira/i.test(v.name || "")
  );
  return female || byLang("ja-JP") || byLang("en-US") || null;
};

export default function useSpeech({ lang = "en-US", rate = 1.0, pitch = 1.05 } = {}) {
  const synth = getSynth();
  const supported = Boolean(synth);

  const [enabled, setEnabledState] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef(null);
  const voiceRef = useRef(null);

  // Hydrate enabled flag from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    setEnabledState(readEnabled());
  }, []);

  // Cache the preferred voice. `getVoices` may return [] until the voiceschanged
  // event fires; listen for it once.
  useEffect(() => {
    if (!supported) return undefined;
    const refresh = () => {
      voiceRef.current = pickVoice(synth.getVoices());
    };
    refresh();
    synth.addEventListener?.("voiceschanged", refresh);
    return () => synth.removeEventListener?.("voiceschanged", refresh);
  }, [supported, synth]);

  const stop = useCallback(() => {
    if (!supported) return;
    try {
      synth.cancel();
    } catch {
      // ignore
    }
    utteranceRef.current = null;
    setSpeaking(false);
  }, [supported, synth]);

  const speak = useCallback(
    (text) => {
      if (!supported) return;
      const clean = stripForSpeech(text);
      if (!clean) return;
      // Always cancel anything pending so a new turn interrupts the old voice.
      try {
        synth.cancel();
      } catch {
        // ignore
      }
      const utter = new window.SpeechSynthesisUtterance(clean);
      utter.lang = lang;
      utter.rate = rate;
      utter.pitch = pitch;
      if (voiceRef.current) utter.voice = voiceRef.current;
      utter.onend = () => {
        // Only flip if THIS utterance ended (cancel races could already
        // have started a new one).
        if (utteranceRef.current === utter) {
          utteranceRef.current = null;
          setSpeaking(false);
        }
      };
      utter.onerror = () => {
        if (utteranceRef.current === utter) {
          utteranceRef.current = null;
          setSpeaking(false);
        }
      };
      utteranceRef.current = utter;
      setSpeaking(true);
      try {
        synth.speak(utter);
      } catch {
        utteranceRef.current = null;
        setSpeaking(false);
      }
    },
    [supported, synth, lang, rate, pitch]
  );

  const setEnabled = useCallback(
    (value) => {
      const next = Boolean(value);
      setEnabledState(next);
      writeEnabled(next);
      // Stop immediately when the user mutes — feels broken otherwise.
      if (!next) stop();
    },
    [stop]
  );

  // Cleanup on unmount — important when the user navigates away mid-speech.
  useEffect(() => {
    return () => {
      if (!supported) return;
      try {
        synth.cancel();
      } catch {
        // ignore
      }
    };
  }, [supported, synth]);

  return { supported, speaking, enabled, setEnabled, speak, stop };
}

// Exported for tests
export { stripForSpeech };
