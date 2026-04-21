/**
 * CompanionFullScreen — full-page overlay showing a larger Live2D canvas
 * alongside a wide chat panel. Activated via the ⤢ button in CompanionPanel.
 *
 * Maintains its own independent chat session (fresh history on open).
 */

import { useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import CompanionCanvas from "./CompanionCanvas";
import SideChatPanel from "./SideChatPanel";

export default function CompanionFullScreen({ onClose, modelEntry, characterName }) {
  const engineRef = useRef(null);
  const navigate = useNavigate();

  const handleEngineReady = useCallback((engine) => {
    engineRef.current = engine;
  }, []);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.container} onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <button style={styles.closeBtn} onClick={onClose} aria-label="Close full screen">
          ✕
        </button>

        {/* Left — Live2D canvas */}
        <div style={styles.canvasSide}>
          <div style={styles.canvasWrap}>
            <CompanionCanvas modelEntry={modelEntry} onEngineReady={handleEngineReady} />
          </div>
          <p style={styles.nameLabel}>{characterName}</p>
        </div>

        {/* Right — chat panel (inline / fullscreen mode) */}
        <SideChatPanel
          engineRef={engineRef}
          onNavigate={navigate}
          proactiveText={null}
          onProactiveDismiss={() => {}}
          characterName={characterName}
          mode="fullscreen"
        />
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 1100,
    background: "rgba(0, 0, 0, 0.72)",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    animation: "skr-fade-in var(--skr-duration-fast) var(--skr-ease-out)",
  },
  container: {
    position: "relative",
    display: "flex",
    width: "min(1040px, 96vw)",
    height: "min(640px, 90vh)",
    background: "var(--skr-comp-bg-panel)",
    border: "1px solid var(--skr-comp-border)",
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 28px 80px rgba(0,0,0,0.55), var(--skr-glow)",
  },
  closeBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 10,
    background: "rgba(255,255,255,0.07)",
    border: "1px solid var(--skr-comp-border-faint)",
    borderRadius: 6,
    color: "var(--skr-text-muted)",
    cursor: "pointer",
    fontSize: 13,
    padding: "3px 9px",
    lineHeight: 1,
    backdropFilter: "blur(4px)",
    transition: "background var(--skr-duration-fast) var(--skr-ease-out)",
  },
  canvasSide: {
    flexShrink: 0,
    width: 380,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-end",
    background: "var(--skr-comp-canvas-bg, var(--skr-elevated))",
    paddingBottom: 18,
    borderRight: "1px solid var(--skr-comp-border)",
  },
  canvasWrap: {
    flex: 1,
    width: "100%",
    position: "relative",
  },
  nameLabel: {
    margin: "6px 0 0",
    fontSize: 11,
    color: "var(--skr-text-secondary)",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
};
