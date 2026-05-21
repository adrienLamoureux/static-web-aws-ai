/**
 * AgentStage — top-level overlay rendered when mode === "agent" on /atelier.
 *
 * On mount, dispatches the canned greeting from `useAgent().greet()` (no LLM
 * round-trip, zero latency first impression). The composer auto-focuses ~600ms
 * after mount to coincide with the ink-wash transition.
 *
 * Layout: column (default) vs bento (CSS columns, multi-track). User toggle
 * persists to localStorage `skr-agent-layout`. Auto-collapses to column on
 * narrow viewports via the agent.css responsive block.
 *
 * The Hiyori Live2D corner is intentionally NOT mounted here — the existing
 * CompanionPanel still renders globally and handles her presence + reactions.
 * See ADR-007.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import MangaPanel from "./MangaPanel";
import Composer from "./Composer";
import MemoryBadge from "./MemoryBadge";
import AgentSessionPicker from "./AgentSessionPicker";
import { useAgent } from "../../../lib/agent/AgentContext";
import { turnsToMarkdown, downloadMarkdown } from "../../../lib/agent/exportTurns";

const LAYOUT_STORAGE_KEY = "skr-agent-layout";
const VALID_LAYOUTS = ["column", "bento"];

const readStoredLayout = () => {
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    return VALID_LAYOUTS.includes(raw) ? raw : "column";
  } catch {
    return "column";
  }
};

export default function AgentStage() {
  const { turns, greet } = useAgent();
  const scrollRef = useRef(null);
  const [layout, setLayoutState] = useState("column");

  // Hydrate persisted layout after mount (avoids SSR mismatch)
  useEffect(() => {
    setLayoutState(readStoredLayout());
  }, []);

  const setLayout = useCallback((next) => {
    if (!VALID_LAYOUTS.includes(next)) return;
    setLayoutState(next);
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  // Drop the canned greeting once on mount
  useEffect(() => {
    greet();
  }, [greet]);

  // Auto-scroll to bottom on new turns — only meaningful in column mode;
  // bento packs visually so the "newest" doesn't have a stable bottom.
  useEffect(() => {
    if (layout !== "column") return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns.length, layout]);

  return (
    <div className="skr-agent-stage" data-layout={layout} role="main">
      <div className="skr-agent-stage-backdrop" aria-hidden="true" />

      <div className="skr-agent-stage-meta">
        <MemoryBadge />
        <AgentSessionPicker />
        <button
          type="button"
          className="skr-layout-toggle"
          onClick={() => setLayout(layout === "bento" ? "column" : "bento")}
          aria-pressed={layout === "bento"}
          aria-label={
            layout === "bento" ? "Switch to single-column layout" : "Switch to bento layout"
          }
          title={layout === "bento" ? "Single column" : "Bento grid"}
        >
          {layout === "bento" ? "⋮⋮ Column" : "▦ Bento"}
        </button>
        <button
          type="button"
          className="skr-layout-toggle"
          onClick={() => {
            const md = turnsToMarkdown(turns);
            const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            downloadMarkdown(md, `hiyori-transcript-${stamp}.md`);
          }}
          disabled={turns.length === 0}
          aria-label="Export transcript as markdown"
          title="Download transcript (.md)"
        >
          ↓ Export
        </button>
      </div>

      <div className="skr-agent-stage-scroll" ref={scrollRef}>
        <div className="skr-agent-stage-stream">
          {turns.map((turn) => (
            <MangaPanel key={turn.id} turn={turn} />
          ))}
        </div>
      </div>

      <div className="skr-agent-stage-composer-wrap">
        <Composer />
      </div>
    </div>
  );
}
