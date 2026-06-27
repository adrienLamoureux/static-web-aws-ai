/**
 * ConfirmAllPanel — single-button affordance for multi-step plans.
 *
 * When the agent fires 2+ intent tools in the same turn (e.g.
 * continue_story + illustrate_scene), AgentContext drops a synthetic
 * "confirm-all" turn carrying the list of intent payloads. This panel
 * renders one CTA that confirms them in sequence.
 *
 * Individual intent panels still surface their own confirm buttons — this
 * is purely additive, a one-click shortcut for the common multi-step case.
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAgent } from "../../../lib/agent/AgentContext";

const INTENT_LABELS = {
  continue_story: "story",
  illustrate_scene: "illustration",
  generate_music: "music",
};

export default function ConfirmAllPanel({ payload }) {
  const { confirmAllIntents } = useAgent();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const intents = Array.isArray(payload?.intents) ? payload.intents : [];

  if (intents.length === 0) return null;

  const allDone = intents.every((i) => i.executed);
  const summary = intents.map((i) => INTENT_LABELS[i.clientAction] || i.clientAction).join(" + ");

  const handleClick = async () => {
    if (pending || allDone) return;
    setPending(true);
    const path = await confirmAllIntents(intents);
    setPending(false);
    if (path) window.setTimeout(() => navigate(path), 600);
  };

  return (
    <div className="skr-confirm-all">
      <div className="skr-confirm-all-head">
        <span className="skr-confirm-all-title">Multi-step plan</span>
        <span className="skr-confirm-all-summary">{summary}</span>
      </div>
      {allDone ? (
        <span className="skr-intent-panel-done" aria-live="polite">
          opened →
        </span>
      ) : (
        <button
          type="button"
          className="skr-btn-primary skr-confirm-all-btn"
          onClick={handleClick}
          disabled={pending}
        >
          {pending ? "Running…" : `✓ Confirm all (${intents.length})`}
        </button>
      )}
    </div>
  );
}
