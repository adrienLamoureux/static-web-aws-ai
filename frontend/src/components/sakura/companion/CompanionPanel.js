/**
 * CompanionPanel — VTuber-style fixed companion overlay.
 *
 * Layout:
 *   ┌─ Header ─────────────────────┐
 *   │  [Model Name ▾]   [─] (min) │
 *   ├──────────────────────────────┤
 *   │      Live2D Canvas           │
 *   ├──────────────────────────────┤
 *   │  [💬 Chat]         [mood ◉] │
 *   └─ CompanionChat (when open) ──┘
 *
 * Position: fixed bottom-right, above the HUD nav bar.
 * On mobile (<768px): collapsed to a circular avatar button.
 * Minimize state persisted to localStorage.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { useCompanionEvent } from "../../../lib/companion/CompanionContext";
import { REACTIONS } from "../../../lib/companion/reaction-map";
import { getDefaultModel, getModelById } from "../../../lib/live2d/model-registry";
import CompanionCanvas from "./CompanionCanvas";
import CompanionChat from "./CompanionChat";
import ModelSelector from "./ModelSelector";

const PANEL_W = 240;
const PANEL_H = 280;
const HUD_H   = 64; // matches --skr-hud-height

const EMOTION_LABELS = {
  happy:     "✦ happy",
  sad:       "✦ sad",
  surprised: "✦ !!",
  thinking:  "✦ …",
  neutral:   "",
};

const STORAGE_KEY = "skr-companion-minimized";

export default function CompanionPanel() {
  const { user } = useAuth();
  const isAdmin = user?.isAdmin || false;

  const engineRef = useRef(null);
  const [modelEntry, setModelEntry] = useState(getDefaultModel());
  const [minimized, setMinimized] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "true"
  );
  const [chatOpen, setChatOpen] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState("neutral");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const emotionTimerRef = useRef(null);

  // Track mobile breakpoint
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Fetch persisted model choice from backend (Director setting)
  useEffect(() => {
    const API_BASE = process.env.REACT_APP_API_BASE_URL || "";
    fetch(`${API_BASE}/api/admin/companion-model`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.modelId) {
          const found = getModelById(data.modelId);
          if (found) setModelEntry(found);
        }
      })
      .catch(() => {}); // silent fallback
  }, []);

  // Persist minimize state
  const toggleMinimized = useCallback(() => {
    setMinimized((v) => {
      const next = !v;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  // Trigger an emotion on the model and update the indicator
  const triggerEmotion = useCallback((name, durationMs = 3000) => {
    engineRef.current?.setEmotion(name, durationMs);
    setCurrentEmotion(name);
    clearTimeout(emotionTimerRef.current);
    emotionTimerRef.current = setTimeout(() => setCurrentEmotion("neutral"), durationMs);
  }, []);

  // React to companion events (page navigation, generation, idle, etc.)
  useCompanionEvent(useCallback((action, payload) => {
    const reaction = REACTIONS[action];
    if (!reaction) return;
    if (reaction.motion) engineRef.current?.playMotion(reaction.motion);
    if (reaction.emotion) triggerEmotion(reaction.emotion, 3000);
  }, [triggerEmotion]));

  const handleEngineReady = useCallback((engine) => {
    engineRef.current = engine;
  }, []);

  const handleModelChange = useCallback((newModel) => {
    setModelEntry(newModel);
  }, []);

  // ─── Mobile: circular button ─────────────────────────────────
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
        ✦
      </button>
    );
  }

  // ─── Minimized: small floating icon ──────────────────────────
  if (minimized) {
    return (
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
        ✦
      </button>
    );
  }

  // ─── Full panel ───────────────────────────────────────────────
  return (
    <div
      style={{
        ...fixedBase,
        bottom: HUD_H + 12,
        right: 16,
        width: PANEL_W,
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
      />

      {/* Header */}
      <div style={styles.header}>
        <ModelSelector
          currentModel={modelEntry}
          onModelChange={handleModelChange}
          isAdmin={isAdmin}
        />
        <button
          type="button"
          onClick={toggleMinimized}
          style={styles.minBtn}
          aria-label="Minimize companion"
          title="Minimize"
        >
          ─
        </button>
      </div>

      {/* Live2D canvas */}
      <div style={{ width: PANEL_W, height: PANEL_H, flexShrink: 0, position: "relative" }}>
        <CompanionCanvas
          modelEntry={modelEntry}
          onEngineReady={handleEngineReady}
        />
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <button
          type="button"
          style={{
            ...styles.chatBtn,
            ...(chatOpen ? styles.chatBtnActive : {}),
          }}
          onClick={() => setChatOpen((v) => !v)}
          aria-label="Toggle chat"
        >
          💬 Chat
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
  minBtn: {
    background: "none",
    border: "none",
    color: "var(--skr-text-muted)",
    cursor: "pointer",
    fontSize: 12,
    padding: "0 2px",
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
};
