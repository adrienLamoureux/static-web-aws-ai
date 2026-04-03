/**
 * CompanionPanel — VTuber-style fixed companion overlay.
 *
 * Layout:
 *   +-- Header -----------------------+
 *   |  [Model Name v]   [⤢] [-] (min)|
 *   +--------------------------------+
 *   |      Live2D Canvas             |   ← speech bubble floats LEFT of panel
 *   +--------------------------------+
 *   |  [Chat]              [mood]    |
 *   +-- CompanionChat (when open) ---+
 *
 * Position: fixed bottom-right, above the HUD nav bar.
 * On mobile (<768px): collapsed to a circular avatar button.
 * Minimize + size state persisted to localStorage.
 *
 * Speech bubble: appears to the LEFT of the panel (manga-style, with tail pointing right).
 *   - Proactive messages from the AI
 *   - Live chat replies from Hiyori (fed via onSpeaking/onSpeakingEnd callbacks)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { useConfig } from "../../../contexts/ConfigContext";
import { buildApiUrl } from "../../../services/apiClient";
import { useCompanionEvent } from "../../../lib/companion/CompanionContext";
import { REACTIONS } from "../../../lib/companion/reaction-map";
import useProactiveCompanion from "../../../lib/companion/useProactiveCompanion";
import { getDefaultModel, getModelById } from "../../../lib/live2d/model-registry";
import CompanionCanvas from "./CompanionCanvas";
import CompanionChat from "./CompanionChat";
import ModelSelector from "./ModelSelector";

const SIZES = {
  normal: { w: 240, h: 280 },
  large:  { w: 360, h: 440 },
};
const HUD_H          = 64; // matches --skr-hud-height
const STORAGE_KEY    = "skr-companion-minimized";
const SIZE_STORAGE_KEY = "skr-companion-size";
const SPEAKING_LINGER_MS = 2200;
const BUBBLE_MAX_CHARS = 110;

const EMOTION_LABELS = {
  happy:     "happy",
  sad:       "sad",
  surprised: "!!",
  thinking:  "...",
  neutral:   "",
};

const truncate = (str, n) =>
  str && str.length > n ? str.slice(0, n).trimEnd() + "…" : str;

export default function CompanionPanel() {
  const { user } = useAuth();
  const { apiBaseUrl } = useConfig();
  const navigate = useNavigate();
  const isAdmin = user?.isAdmin || false;

  const engineRef       = useRef(null);
  const speakingTimerRef = useRef(null);

  const [modelEntry, setModelEntry] = useState(getDefaultModel());
  const [minimized, setMinimized] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "true"
  );
  const [charSize, setCharSize] = useState(
    () => localStorage.getItem(SIZE_STORAGE_KEY) || "normal"
  );
  const [chatOpen, setChatOpen]       = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState("neutral");
  const [isMobile, setIsMobile]       = useState(() => window.innerWidth < 768);
  const [speakingText, setSpeakingText] = useState(null);
  const emotionTimerRef = useRef(null);

  const { proactiveText, proactiveEmotion, dismissProactive } = useProactiveCompanion();

  const { w: panelW, h: panelH } = SIZES[charSize] || SIZES.normal;

  // Active speech bubble text — proactive takes priority
  const sideBubbleText        = proactiveText || speakingText;
  const sideBubbleIsProactive = !!proactiveText;

  // Track mobile breakpoint
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => () => {
    clearTimeout(speakingTimerRef.current);
    clearTimeout(emotionTimerRef.current);
  }, []);

  // Fetch persisted model choice from backend (Director setting)
  useEffect(() => {
    if (!apiBaseUrl) return;
    fetch(buildApiUrl(apiBaseUrl, "/api/admin/companion-model"))
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.modelId) {
          const found = getModelById(data.modelId);
          if (found) setModelEntry(found);
        }
      })
      .catch(() => {});
  }, [apiBaseUrl]);

  const toggleMinimized = useCallback(() => {
    setMinimized((v) => {
      const next = !v;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const toggleSize = useCallback(() => {
    setCharSize((v) => {
      const next = v === "normal" ? "large" : "normal";
      localStorage.setItem(SIZE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const triggerEmotion = useCallback((name, durationMs = 3000) => {
    engineRef.current?.setEmotion(name, durationMs);
    setCurrentEmotion(name);
    clearTimeout(emotionTimerRef.current);
    emotionTimerRef.current = setTimeout(() => setCurrentEmotion("neutral"), durationMs);
  }, []);

  // Callbacks for CompanionChat to feed Hiyori's speech into the side bubble
  const handleSpeaking = useCallback((text) => {
    clearTimeout(speakingTimerRef.current);
    setSpeakingText(text);
  }, []);

  const handleSpeakingEnd = useCallback(() => {
    clearTimeout(speakingTimerRef.current);
    speakingTimerRef.current = setTimeout(() => setSpeakingText(null), SPEAKING_LINGER_MS);
  }, []);

  // Apply proactive emotion when a proactive message arrives
  useEffect(() => {
    if (proactiveText && proactiveEmotion) {
      triggerEmotion(proactiveEmotion, 5000);
    }
  }, [proactiveText, proactiveEmotion, triggerEmotion]);

  // React to companion events (motion + emotion reactions)
  useCompanionEvent(useCallback((action) => {
    const reaction = REACTIONS[action];
    if (reaction) {
      if (reaction.motion) engineRef.current?.playMotion(reaction.motion);
      if (reaction.emotion) triggerEmotion(reaction.emotion, 3000);
    }
  }, [triggerEmotion]));

  const handleEngineReady   = useCallback((engine) => { engineRef.current = engine; }, []);
  const handleModelChange   = useCallback((m) => setModelEntry(m), []);
  const handleBubbleReply   = useCallback(() => {
    dismissProactive();
    setChatOpen(true);
  }, [dismissProactive]);

  // ── Mobile: circular button ────────────────────────────────────────────────
  if (isMobile) {
    return (
      <button
        type="button"
        aria-label="Open Hiyori companion"
        onClick={() => setMinimized((v) => !v)}
        style={{
          ...fixedBase,
          bottom: HUD_H + 12,
          right: 12,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "rgba(26, 23, 38, 0.92)",
          border: "1px solid rgba(255, 107, 157, 0.4)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
        }}
      >
        H
      </button>
    );
  }

  // ── Minimized: small floating icon ────────────────────────────────────────
  if (minimized) {
    return (
      <>
        {proactiveText && (
          <div
            style={{
              ...fixedBase,
              bottom: HUD_H + 72,
              right: 16,
              ...styles.bubble,
            }}
          >
            <span>{proactiveText}</span>
            <button type="button" onClick={handleBubbleReply} style={styles.replyBtn}>
              Reply
            </button>
          </div>
        )}
        <button
          type="button"
          aria-label="Expand Hiyori companion"
          onClick={toggleMinimized}
          style={{
            ...fixedBase,
            bottom: HUD_H + 12,
            right: 16,
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "rgba(26, 23, 38, 0.92)",
            border: "1px solid rgba(255, 107, 157, 0.4)",
            boxShadow: "var(--skr-glow)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
          }}
        >
          H
        </button>
      </>
    );
  }

  // ── Full panel ─────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        ...fixedBase,
        bottom: HUD_H + 12,
        right: 16,
        width: panelW,
        display: "flex",
        flexDirection: "column",
        background: "rgba(13, 11, 20, 0.7)",
        border: "1px solid rgba(192, 132, 252, 0.2)",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6), var(--skr-glow)",
        backdropFilter: "blur(12px)",
        overflow: "visible",
      }}
    >
      {/* Chat panel (floats above) */}
      <CompanionChat
        engineRef={engineRef}
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        onNavigate={navigate}
        onExpandChange={setChatExpanded}
        onSpeaking={handleSpeaking}
        onSpeakingEnd={handleSpeakingEnd}
      />

      {/* Header */}
      <div style={styles.header}>
        <ModelSelector
          currentModel={modelEntry}
          onModelChange={handleModelChange}
          isAdmin={isAdmin}
        />
        <div style={styles.headerActions}>
          <button
            type="button"
            onClick={toggleSize}
            style={styles.sizeBtn}
            title={charSize === "normal" ? "Expand character" : "Shrink character"}
            aria-label={charSize === "normal" ? "Expand character" : "Shrink character"}
          >
            {charSize === "normal" ? "⤢" : "⤡"}
          </button>
          <button
            type="button"
            onClick={toggleMinimized}
            style={styles.minBtn}
            aria-label="Minimize companion"
            title="Minimize"
          >
            −
          </button>
        </div>
      </div>

      {/* Live2D canvas — hidden when chat is in expanded mode */}
      <div
        style={{
          width: panelW,
          height: panelH,
          flexShrink: 0,
          position: "relative",
          display: chatExpanded ? "none" : undefined,
        }}
      >
        <CompanionCanvas modelEntry={modelEntry} onEngineReady={handleEngineReady} />

        {/* Side speech bubble — left of panel, with right-pointing tail */}
        {sideBubbleText && (
          <div style={styles.sideBubbleContainer} key={sideBubbleText}>
            <div style={styles.sideBubbleInner}>
              <p style={styles.sideBubbleText}>
                {sideBubbleIsProactive
                  ? sideBubbleText
                  : truncate(sideBubbleText, BUBBLE_MAX_CHARS)}
              </p>
              {sideBubbleIsProactive && (
                <button type="button" onClick={handleBubbleReply} style={styles.replyBtn}>
                  Reply
                </button>
              )}
            </div>
            {/* Tail — two overlapping triangles to create a bordered arrow */}
            <div style={styles.tailOuter} />
            <div style={styles.tailInner} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <button
          type="button"
          style={{ ...styles.chatBtn, ...(chatOpen ? styles.chatBtnActive : {}) }}
          onClick={() => setChatOpen((v) => !v)}
          aria-label="Toggle chat"
        >
          Chat
        </button>
        <span style={styles.emotionIndicator}>
          {EMOTION_LABELS[currentEmotion] || ""}
        </span>
      </div>
    </div>
  );
}

const fixedBase = {
  position: "fixed",
  zIndex: 900,
};

const styles = {
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 10px",
    borderBottom: "1px solid rgba(192, 132, 252, 0.12)",
    flexShrink: 0,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  sizeBtn: {
    background: "none",
    border: "none",
    color: "var(--skr-text-muted)",
    cursor: "pointer",
    fontSize: 14,
    padding: "0 3px",
    lineHeight: 1,
    opacity: 0.7,
    transition: "opacity 0.15s",
  },
  minBtn: {
    background: "none",
    border: "none",
    color: "var(--skr-text-muted)",
    cursor: "pointer",
    fontSize: 14,
    padding: "0 3px",
    lineHeight: 1,
    letterSpacing: 1,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 10px",
    borderTop: "1px solid rgba(192, 132, 252, 0.12)",
    flexShrink: 0,
  },
  chatBtn: {
    background: "none",
    border: "1px solid rgba(192, 132, 252, 0.2)",
    borderRadius: 6,
    color: "var(--skr-text-secondary)",
    cursor: "pointer",
    fontSize: 11,
    padding: "3px 8px",
    transition: "all 0.15s",
  },
  chatBtnActive: {
    background: "rgba(255, 107, 157, 0.12)",
    border: "1px solid rgba(255, 107, 157, 0.35)",
    color: "var(--skr-accent)",
  },
  emotionIndicator: {
    fontSize: 10,
    color: "var(--skr-accent)",
    letterSpacing: "0.06em",
    minWidth: 48,
    textAlign: "right",
    opacity: 0.8,
  },

  // ── Side speech bubble ────────────────────────────────────────────────────
  sideBubbleContainer: {
    position: "absolute",
    right: "calc(100% + 14px)",
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 10,
    width: 220,
    animation: "skr-bubble-in 0.25s ease",
    pointerEvents: "auto",
  },
  sideBubbleInner: {
    background: "rgba(22, 18, 36, 0.96)",
    border: "1px solid rgba(255, 107, 157, 0.4)",
    borderRadius: 10,
    padding: "10px 14px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.55), var(--skr-glow)",
    lineHeight: 1.45,
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },
  sideBubbleText: {
    margin: 0,
    fontSize: 12,
    color: "var(--skr-text)",
  },
  // Outer triangle (border color)
  tailOuter: {
    position: "absolute",
    right: -9,
    top: "50%",
    transform: "translateY(-50%)",
    width: 0,
    height: 0,
    borderTop: "8px solid transparent",
    borderBottom: "8px solid transparent",
    borderLeft: "9px solid rgba(255, 107, 157, 0.4)",
    pointerEvents: "none",
  },
  // Inner triangle (background fill, slightly offset to cover border)
  tailInner: {
    position: "absolute",
    right: -7,
    top: "50%",
    transform: "translateY(-50%)",
    width: 0,
    height: 0,
    borderTop: "7px solid transparent",
    borderBottom: "7px solid transparent",
    borderLeft: "8px solid rgba(22, 18, 36, 0.96)",
    pointerEvents: "none",
  },

  // ── Standalone bubble (minimized mode) ───────────────────────────────────
  bubble: {
    background: "rgba(26, 23, 38, 0.95)",
    border: "1px solid rgba(255, 107, 157, 0.4)",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 11,
    color: "var(--skr-text)",
    boxShadow: "0 2px 12px rgba(0,0,0,0.5), var(--skr-glow)",
    maxWidth: 200,
    textAlign: "center",
    lineHeight: 1.4,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    animation: "skr-bubble-in 0.2s ease",
  },
  replyBtn: {
    alignSelf: "flex-start",
    background: "rgba(255, 107, 157, 0.15)",
    border: "1px solid rgba(255, 107, 157, 0.3)",
    borderRadius: 4,
    color: "var(--skr-accent)",
    cursor: "pointer",
    fontSize: 10,
    padding: "2px 10px",
    fontWeight: 600,
    letterSpacing: "0.04em",
  },
};
