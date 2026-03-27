import { useEffect, useRef, useState, useCallback } from "react";
import { useConfig } from "../../contexts/ConfigContext";

const AUTO_CLOSE_MS = 10000;

/**
 * Speech bubble anchored above the Live2D character.
 * Calls POST /api/companion/chat and shows the response.
 *
 * Props:
 *   anchorX          — character's current screen X
 *   canvasBottomOffset — px from viewport bottom to position bubble
 *   onClose          — called when dialog should close
 *   onEmotion(str)   — called with emotion string when response arrives (Option A)
 *   onSpeakingChange(bool) — called to start/stop lipsync (Option B)
 */
export default function CompanionDialog({ anchorX, canvasBottomOffset, onClose, onEmotion, onSpeakingChange }) {
  const { apiBaseUrl } = useConfig();
  const [text, setText] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const timerRef = useRef(null);

  const scheduleClose = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onClose, AUTO_CLOSE_MS);
  }, [onClose]);

  // Stop lipsync when this component unmounts (dialog closed)
  useEffect(() => {
    return () => onSpeakingChange?.(false);
  }, [onSpeakingChange]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/companion/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "greet" }),
        });
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        if (!cancelled) {
          setText(data.text);
          setLoading(false);
          onEmotion?.(data.emotion);    // Option A: trigger emotion motion
          onSpeakingChange?.(true);     // Option B: start lipsync
          scheduleClose();
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
          scheduleClose();
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [apiBaseUrl, scheduleClose, onEmotion, onSpeakingChange]);

  // Position bubble above the character, clamped to viewport
  const BUBBLE_W = 240;
  const BUBBLE_BOTTOM = canvasBottomOffset + 16;
  const left = Math.max(8, Math.min(anchorX - BUBBLE_W / 2, window.innerWidth - BUBBLE_W - 8));

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        bottom: BUBBLE_BOTTOM,
        left,
        width: BUBBLE_W,
        zIndex: 60,
        cursor: "pointer",
      }}
    >
      {/* Tail */}
      <div style={{
        position: "absolute",
        bottom: -8,
        left: Math.max(12, anchorX - left - 8),
        width: 0,
        height: 0,
        borderLeft: "8px solid transparent",
        borderRight: "8px solid transparent",
        borderTop: "8px solid rgba(30, 24, 48, 0.92)",
      }} />

      {/* Bubble */}
      <div style={{
        background: "rgba(30, 24, 48, 0.92)",
        border: "1px solid rgba(192, 132, 252, 0.4)",
        borderRadius: 12,
        padding: "12px 14px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,107,157,0.1)",
      }}>
        <div style={{
          fontSize: 11,
          color: "var(--skr-accent)",
          marginBottom: 6,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}>
          Hiyori ✦
        </div>
        <div style={{
          fontSize: 13,
          color: "var(--skr-text)",
          lineHeight: 1.5,
          minHeight: 36,
        }}>
          {loading && (
            <span style={{ color: "var(--skr-text-secondary)", fontStyle: "italic" }}>
              thinking…
            </span>
          )}
          {!loading && error && (
            <span style={{ color: "var(--skr-text-secondary)", fontStyle: "italic" }}>
              (whispers something inaudible)
            </span>
          )}
          {!loading && !error && text}
        </div>
        <div style={{
          marginTop: 8,
          fontSize: 10,
          color: "var(--skr-text-muted)",
          textAlign: "right",
        }}>
          click to dismiss
        </div>
      </div>
    </div>
  );
}
