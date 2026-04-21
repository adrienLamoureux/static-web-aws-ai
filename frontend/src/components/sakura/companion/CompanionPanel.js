/**
 * CompanionPanel — VTuber-style fixed companion overlay.
 *
 * Always renders at large size (360×440).
 * Chat lives permanently in SideChatPanel — a floating bubble panel
 * left of the character. No slide-up chat popup.
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
import SideChatPanel from "./SideChatPanel";
import ModelSelector from "./ModelSelector";
import CompanionFullScreen from "./CompanionFullScreen";

const PANEL_W = 360;
const PANEL_H = 440;
const HUD_H = 64;
const STORAGE_KEY = "skr-companion-minimized";
const CHAT_OPEN_KEY = "skr-chat-open";

export default function CompanionPanel() {
  const { user } = useAuth();
  const { apiBaseUrl } = useConfig();
  const navigate = useNavigate();
  const isAdmin = user?.isAdmin || false;

  const engineRef = useRef(null);

  const [modelEntry, setModelEntry] = useState(getDefaultModel());
  const characterName = modelEntry.name.split(/[\s(]/)[0];
  const [minimized, setMinimized] = useState(() => localStorage.getItem(STORAGE_KEY) === "true");
  const [chatOpen, setChatOpen] = useState(() => localStorage.getItem(CHAT_OPEN_KEY) !== "false");
  const [fullscreen, setFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  const { proactiveText, proactiveEmotion, dismissProactive } = useProactiveCompanion();

  // Mobile breakpoint listener
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const h = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // Fetch persisted companion model from backend
  useEffect(() => {
    if (!apiBaseUrl) return;
    fetch(buildApiUrl(apiBaseUrl, "/api/admin/companion-model"))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.modelId) {
          const found = getModelById(d.modelId);
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

  const toggleChat = useCallback(() => {
    setChatOpen((v) => {
      const next = !v;
      localStorage.setItem(CHAT_OPEN_KEY, String(next));
      return next;
    });
  }, []);

  // Drive proactive emotion via interact() so the model-specific mapping is applied
  useEffect(() => {
    if (proactiveText && proactiveEmotion) {
      engineRef.current?.interact(proactiveEmotion);
    }
  }, [proactiveText, proactiveEmotion]);

  useCompanionEvent(
    useCallback((action) => {
      const interaction = REACTIONS[action];
      if (interaction) engineRef.current?.interact(interaction);
    }, [])
  );

  const handleEngineReady = useCallback((engine) => {
    engineRef.current = engine;
  }, []);
  const handleModelChange = useCallback((m) => setModelEntry(m), []);

  // ── Mobile ─────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <button
        type="button"
        aria-label={`Open ${characterName} companion`}
        onClick={() => setMinimized((v) => !v)}
        style={{
          ...fixedBase,
          bottom: HUD_H + 12,
          right: 12,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--skr-comp-fab-bg)",
          border: "1px solid var(--skr-comp-fab-border)",
          boxShadow: "var(--skr-comp-shadow)",
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

  // ── Minimized ──────────────────────────────────────────────────────────────
  if (minimized) {
    return (
      <>
        {proactiveText && (
          <div style={{ ...fixedBase, bottom: HUD_H + 72, right: 16, ...styles.standaloneBubble }}>
            <span>{proactiveText}</span>
            <button
              type="button"
              onClick={() => {
                dismissProactive();
                setMinimized(false);
              }}
              style={styles.replyBtn}
            >
              Reply
            </button>
          </div>
        )}
        <button
          type="button"
          aria-label={`Expand ${characterName} companion`}
          onClick={toggleMinimized}
          style={{
            ...fixedBase,
            bottom: HUD_H + 12,
            right: 16,
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "var(--skr-comp-fab-bg)",
            border: "1px solid var(--skr-comp-fab-border)",
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
        width: PANEL_W,
        display: "flex",
        flexDirection: "column",
        background: "var(--skr-comp-bg-panel)",
        border: "1px solid var(--skr-comp-border)",
        borderRadius: 12,
        boxShadow: "var(--skr-comp-shadow), var(--skr-glow)",
        backdropFilter: "blur(12px)",
        overflow: "visible",
      }}
    >
      {/* Header */}
      <div style={styles.header}>
        <ModelSelector
          currentModel={modelEntry}
          onModelChange={handleModelChange}
          isAdmin={isAdmin}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            onClick={toggleChat}
            style={{ ...styles.minBtn, opacity: chatOpen ? 1 : 0.45 }}
            aria-label={chatOpen ? "Hide chat" : "Show chat"}
            title={chatOpen ? "Hide chat" : "Show chat"}
          >
            💬
          </button>
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            style={styles.minBtn}
            aria-label="Open full screen"
            title="Full screen"
          >
            ⤢
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

      {/* Full-screen overlay */}
      {fullscreen && (
        <CompanionFullScreen
          onClose={() => setFullscreen(false)}
          modelEntry={modelEntry}
          characterName={characterName}
        />
      )}

      {/* Canvas + side panel */}
      <div style={{ width: PANEL_W, height: PANEL_H, flexShrink: 0, position: "relative" }}>
        <CompanionCanvas modelEntry={modelEntry} onEngineReady={handleEngineReady} />

        {chatOpen ? (
          <SideChatPanel
            engineRef={engineRef}
            onNavigate={navigate}
            proactiveText={proactiveText}
            onProactiveDismiss={dismissProactive}
            characterName={characterName}
          />
        ) : proactiveText ? (
          /* Simple speech bubble when chat is hidden */
          <div style={styles.sideBubbleAnchor}>
            <div style={styles.sideBubbleInner}>
              <p style={styles.bubbleText}>{proactiveText}</p>
              <button
                type="button"
                onClick={() => {
                  dismissProactive();
                  setChatOpen(true);
                  localStorage.setItem(CHAT_OPEN_KEY, "true");
                }}
                style={styles.replyBtn}
              >
                Reply
              </button>
            </div>
            <div style={styles.tailOuter} />
            <div style={styles.tailInner} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

const fixedBase = { position: "fixed", zIndex: 900 };

const styles = {
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 10px",
    borderBottom: "1px solid var(--skr-comp-border-faint)",
    flexShrink: 0,
  },
  minBtn: {
    background: "none",
    border: "none",
    color: "var(--skr-text-muted)",
    cursor: "pointer",
    fontSize: 14,
    padding: "0 3px",
    lineHeight: 1,
  },
  sideBubbleAnchor: {
    position: "absolute",
    right: "calc(100% + 14px)",
    top: "50%",
    transform: "translateY(-50%)",
    width: 210,
    zIndex: 10,
    pointerEvents: "auto",
  },
  sideBubbleInner: {
    background: "var(--skr-comp-bg)",
    border: "1px solid var(--skr-comp-fab-border)",
    borderRadius: 10,
    padding: "10px 13px",
    boxShadow: "var(--skr-comp-shadow), var(--skr-glow)",
    lineHeight: 1.45,
    display: "flex",
    flexDirection: "column",
    gap: 7,
    animation: "skr-bubble-in-side var(--skr-duration-normal) var(--skr-ease-out)",
  },
  bubbleText: {
    margin: 0,
    fontSize: 12,
    color: "var(--skr-text)",
  },
  tailOuter: {
    position: "absolute",
    right: -9,
    top: "50%",
    transform: "translateY(-50%)",
    width: 0,
    height: 0,
    borderTop: "8px solid transparent",
    borderBottom: "8px solid transparent",
    borderLeft: "9px solid var(--skr-comp-fab-border)",
    pointerEvents: "none",
  },
  tailInner: {
    position: "absolute",
    right: -7,
    top: "50%",
    transform: "translateY(-50%)",
    width: 0,
    height: 0,
    borderTop: "7px solid transparent",
    borderBottom: "7px solid transparent",
    borderLeft: "8px solid var(--skr-comp-bg)",
    pointerEvents: "none",
  },
  standaloneBubble: {
    background: "var(--skr-comp-bg)",
    border: "1px solid var(--skr-comp-fab-border)",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 11,
    color: "var(--skr-text)",
    boxShadow: "var(--skr-comp-shadow), var(--skr-glow)",
    maxWidth: 200,
    textAlign: "center",
    lineHeight: 1.4,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    animation: "skr-bubble-in var(--skr-duration-normal) var(--skr-ease-out)",
  },
  replyBtn: {
    alignSelf: "flex-start",
    background: "rgba(255,107,157,0.15)",
    border: "1px solid rgba(255,107,157,0.3)",
    borderRadius: 4,
    color: "var(--skr-accent)",
    cursor: "pointer",
    fontSize: 10,
    padding: "2px 10px",
    fontWeight: 600,
    letterSpacing: "0.04em",
  },
};
