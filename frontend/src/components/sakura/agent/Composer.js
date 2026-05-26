/**
 * Composer — agent-mode intent input. Auto-focuses on mount, submits to the
 * AgentContext, supports cmd/ctrl+enter to send. Allows typing-ahead while a
 * prior turn is in flight (the AgentContext queues serially).
 *
 * v1.7: mic button surfaces voice input via the Web Speech API. Hidden when
 * the browser doesn't support it. Tapping toggles dictation; live transcript
 * flows into the textarea as the user speaks.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "../../../lib/agent/AgentContext";
import useVoiceInput from "../../../lib/agent/useVoiceInput";

export default function Composer() {
  const { submit, submitting, queueLength, pendingText, clearPendingText, tts } = useAgent();
  const [text, setText] = useState("");
  const taRef = useRef(null);
  // Capture the text the user had before they hit the mic, so live transcript
  // appends rather than overwrites.
  const baseTextRef = useRef("");

  const onVoiceResult = useCallback((transcript) => {
    const base = baseTextRef.current;
    const merged = base ? `${base} ${transcript}`.replace(/\s+/g, " ").trim() : transcript;
    setText(merged);
  }, []);

  const voice = useVoiceInput({ onResult: onVoiceResult });

  useEffect(() => {
    // Auto-focus once the stage has settled (~600ms ink-wash)
    const t = setTimeout(() => taRef.current?.focus(), 600);
    return () => clearTimeout(t);
  }, []);

  // Pull in pending text from selection-to-edit and put the caret at the end
  useEffect(() => {
    if (!pendingText) return;
    setText(pendingText);
    clearPendingText();
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  }, [pendingText, clearPendingText]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    if (voice.listening) voice.stop();
    setText("");
    baseTextRef.current = "";
    await submit(trimmed);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      handleSubmit(e);
    }
  };

  const handleMicToggle = () => {
    if (voice.listening) {
      voice.stop();
    } else {
      baseTextRef.current = text.trim();
      voice.start();
    }
  };

  // Map browser SpeechRecognition error codes to friendly hints. `not-allowed`
  // is the common one (mic permission denied) — without surfacing it the user
  // sees no feedback at all when they tap the mic.
  const voiceErrorHint = (() => {
    if (!voice.error) return null;
    if (voice.error === "not-allowed" || voice.error === "service-not-allowed") {
      return "⚠ Mic permission denied — check your browser settings";
    }
    if (voice.error === "no-speech") return "Didn't catch that — try again?";
    if (voice.error === "audio-capture") return "⚠ No microphone detected";
    if (voice.error === "network") return "⚠ Network error during dictation";
    return `⚠ Dictation failed (${voice.error})`;
  })();

  const queueHint = voiceErrorHint
    ? voiceErrorHint
    : voice.listening
      ? "Listening… click the mic again to stop"
      : queueLength > 0
        ? `${queueLength} queued`
        : submitting
          ? "Hiyori is on it…"
          : "Enter to send · Shift+Enter for newline · type / for shortcuts";

  return (
    <form className="skr-agent-composer" onSubmit={handleSubmit}>
      <div className="skr-agent-composer-row">
        <textarea
          ref={taRef}
          className="skr-agent-composer-input"
          placeholder="What should we make? (try: 'a fox spirit at moonlit shrine')"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          aria-label="Describe your intent"
        />
        {voice.supported ? (
          <button
            type="button"
            className={`skr-agent-composer-mic${voice.listening ? " is-listening" : ""}`}
            onClick={handleMicToggle}
            aria-pressed={voice.listening}
            aria-label={voice.listening ? "Stop voice input" : "Start voice input"}
            title={voice.listening ? "Stop dictation" : "Dictate"}
          >
            {voice.listening ? "■" : "🎙"}
          </button>
        ) : null}
        {tts?.supported ? (
          <button
            type="button"
            className={`skr-agent-composer-mic${tts.enabled ? " is-listening" : ""}`}
            onClick={() => tts.setEnabled(!tts.enabled)}
            aria-pressed={tts.enabled}
            aria-label={tts.enabled ? "Mute Hiyori's voice" : "Let Hiyori speak"}
            title={tts.enabled ? "Mute voice" : "Speak"}
          >
            {tts.enabled ? "🔊" : "🔇"}
          </button>
        ) : null}
        <button
          type="submit"
          className="skr-btn-primary skr-agent-composer-send"
          disabled={!text.trim()}
        >
          {submitting ? "…" : "✦ Send"}
        </button>
      </div>
      <div className="skr-agent-composer-hint" aria-live="polite">
        {queueHint}
      </div>
    </form>
  );
}
