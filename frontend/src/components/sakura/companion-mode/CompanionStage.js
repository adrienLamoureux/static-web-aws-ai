/**
 * CompanionStage — viewport-takeover surface for Companion Mode.
 *
 * When mode === "companion", App.js renders THIS instead of the dashboard
 * shell. Hiyori dominates the viewport (left ~50% on desktop), the agent
 * turn stream + tool results sit on the right, and the composer is sticky
 * at the bottom. The only escape affordance is a frosted ✕ button top-right.
 *
 * Reuses:
 *   - useAgent  — turn stream, submit, TTS, voice (no new state)
 *   - MangaPanel — renders each turn type (user/agent/thinking/tool-result)
 *   - Composer  — input + mic + 🔊 (already wired in v1.7 + this work)
 *   - CompanionCanvas — Live2D renderer (mounted larger here)
 *
 * Live2D model selection uses the existing /api/admin/companion-model
 * endpoint + getDefaultModel fallback. Same pattern as CompanionPanel /
 * CompanionFullScreen — keeps the runtime model swap consistent across
 * surfaces.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { useConfig } from "../../../contexts/ConfigContext";
import { buildApiUrl } from "../../../services/apiClient";
import { getDefaultModel, getModelById } from "../../../lib/live2d/model-registry";
import { useMode } from "../../../lib/mode/ModeContext";
import { useAgent } from "../../../lib/agent/AgentContext";
import CompanionCanvas from "../companion/CompanionCanvas";
import MangaPanel from "../agent/MangaPanel";
import Composer from "../agent/Composer";

export default function CompanionStage() {
  const { setMode } = useMode();
  const { isAuthenticated } = useAuth();
  const { apiBaseUrl } = useConfig();
  const { turns, greet } = useAgent();
  const scrollRef = useRef(null);
  const engineRef = useRef(null);
  const [modelEntry, setModelEntry] = useState(getDefaultModel());
  const characterName = modelEntry.name.split(/[\s(]/)[0];

  // Fetch the admin-configured model on mount — same pattern as CompanionPanel.
  useEffect(() => {
    if (!apiBaseUrl) return;
    fetch(buildApiUrl(apiBaseUrl, "/api/admin/companion-model"))
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        const m = cfg?.modelId && getModelById(cfg.modelId);
        if (m) setModelEntry(m);
      })
      .catch(() => {
        // ignore — getDefaultModel fallback is fine
      });
  }, [apiBaseUrl]);

  // Canned greeting once — no LLM call. Same trick as AgentStage.
  useEffect(() => {
    greet();
  }, [greet]);

  // Auto-scroll the conversation column on new turns.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns.length]);

  const handleExit = useCallback(() => {
    setMode("dashboard");
  }, [setMode]);

  const handleEngineReady = useCallback((engine) => {
    engineRef.current = engine;
  }, []);

  // If the user signed out while in companion mode, kick them back to the
  // dashboard rather than leaving them stranded with no shell.
  useEffect(() => {
    if (!isAuthenticated) setMode("dashboard");
  }, [isAuthenticated, setMode]);

  return (
    <div className="skr-companion-stage" role="main">
      <div className="skr-companion-stage-backdrop" aria-hidden="true" />

      <button
        type="button"
        className="skr-companion-exit"
        onClick={handleExit}
        aria-label="Exit companion mode"
        title="Back to dashboard"
      >
        ✕
      </button>

      <div className="skr-companion-stage-layout">
        {/* Left — dominant Live2D canvas */}
        <div className="skr-companion-canvas-side">
          <div className="skr-companion-canvas-wrap">
            <CompanionCanvas modelEntry={modelEntry} onEngineReady={handleEngineReady} />
          </div>
          <p className="skr-companion-name-label">{characterName}</p>
        </div>

        {/* Right — conversation stream + tool result cards */}
        <div className="skr-companion-conversation">
          <div className="skr-companion-scroll" ref={scrollRef}>
            <div className="skr-companion-stream">
              {turns.map((turn) => (
                <MangaPanel key={turn.id} turn={turn} />
              ))}
            </div>
          </div>

          <div className="skr-companion-composer-wrap">
            <Composer />
          </div>
        </div>
      </div>
    </div>
  );
}
