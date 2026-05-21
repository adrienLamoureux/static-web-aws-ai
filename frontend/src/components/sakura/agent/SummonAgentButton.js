/**
 * SummonAgentButton — cross-mode handoff button in Dashboard Forge.
 *
 * Copies the user's current form state (prompt at minimum, plus optional
 * style/aspect) into a localStorage stash, then flips mode to "agent" so
 * the next render mounts AgentStage with the user's draft already in the
 * composer. Equivalent to "Tweak in Atelier" going the other direction.
 *
 * Hidden when the prompt is empty (nothing useful to hand off).
 */

import React from "react";
import { useMode } from "../../../lib/mode/ModeContext";

const STASH_KEY = "skr-agent-summon";

export default function SummonAgentButton({ prompt, style, aspect, className = "" }) {
  const { setMode } = useMode();
  const trimmed = String(prompt || "").trim();
  if (!trimmed) return null;

  const handleClick = () => {
    try {
      window.localStorage.setItem(
        STASH_KEY,
        JSON.stringify({ prompt: trimmed, style, aspect, at: Date.now() })
      );
    } catch {
      // ignore quota / private mode — agent mode will still flip, just no prefill
    }
    setMode("agent");
  };

  return (
    <button
      type="button"
      className={`skr-btn-summon ${className}`.trim()}
      onClick={handleClick}
      title="Let Hiyori take this prompt and pick the rest"
    >
      ✦ Let Hiyori take it
    </button>
  );
}
