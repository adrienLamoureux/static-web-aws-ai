/**
 * ModeToggle — pill-shaped toggle that flips between Dashboard and Agent.
 *
 * Mounted globally inside Forge so it sits in the same fixed top-right slot
 * regardless of mode. Only renders on /atelier (Forge enforces this by only
 * rendering ModeToggle when mounted).
 */

import React from "react";
import { useMode } from "../../../lib/mode/ModeContext";

export default function ModeToggle() {
  const { mode, toggleMode } = useMode();
  const isAgent = mode === "agent";

  return (
    <button
      type="button"
      className={`skr-mode-toggle${isAgent ? " is-agent" : ""}`}
      onClick={toggleMode}
      aria-pressed={isAgent}
      aria-label={isAgent ? "Switch to Dashboard" : "Switch to Agent mode"}
      title={isAgent ? "Back to Dashboard" : "Let Hiyori drive"}
    >
      <span className="skr-mode-toggle-icon" aria-hidden="true">
        {isAgent ? "✦" : "◈"}
      </span>
      <span className="skr-mode-toggle-label">{isAgent ? "Agent" : "Dashboard"}</span>
    </button>
  );
}
