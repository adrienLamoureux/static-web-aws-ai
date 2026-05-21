/**
 * IntentPanel — renders a `requiresConfirm` tool result. The confirm button
 * fires the agent's intent server-side via the existing story endpoints
 * (see AgentContext.confirmIntent), then navigates to Chronicle once the
 * write succeeds. Surfaces the executing/executed/error states inline so
 * the user can see progress without leaving agent mode.
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAgent } from "../../../lib/agent/AgentContext";
import { friendlyAgentError } from "../../../lib/agent/errorMessages";

const INTENT_LABELS = {
  continue_story: {
    title: "Continue story",
    confirm: "✓ Continue in Chronicle",
    executingLabel: "Adding turn…",
    successLabel: "Added — opening Chronicle…",
    describe: (p) =>
      [p.sessionTitle && `"${p.sessionTitle}"`, p.content && `→ "${p.content}"`]
        .filter(Boolean)
        .join(" "),
  },
  illustrate_scene: {
    title: "Illustrate scene",
    confirm: "✓ Illustrate in Chronicle",
    executingLabel: "Queueing illustration…",
    successLabel: "Queued — opening Chronicle…",
    describe: (p) =>
      [`scene ${p.sceneId}`, p.style && `· style=${p.style}`].filter(Boolean).join(" "),
  },
  generate_music: {
    title: "Score scene",
    confirm: "✓ Queue music",
    executingLabel: "Queueing music…",
    successLabel: "Queued — opening Chronicle…",
    describe: (p) =>
      [
        p.sessionTitle && `"${p.sessionTitle}"`,
        `mood=${p.mood}`,
        p.description && `· ${p.description}`,
      ]
        .filter(Boolean)
        .join(" "),
  },
};

export default function IntentPanel({ payload }) {
  const { confirmIntent } = useAgent();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const meta = INTENT_LABELS[payload?.clientAction];
  if (!meta) return null;

  const handleConfirm = async () => {
    if (pending || payload.executing || payload.executed) return;
    setPending(true);
    const path = await confirmIntent(payload);
    setPending(false);
    if (path) {
      // Small dwell so the success state is visible before the route change
      window.setTimeout(() => navigate(path), 600);
    }
  };

  const showExecuting = payload.executing || pending;
  const showExecuted = payload.executed;
  const showError = payload.executeError;

  return (
    <div className="skr-intent-panel" data-action={payload.clientAction}>
      <div className="skr-intent-panel-head">
        <span className="skr-intent-panel-title">{meta.title}</span>
        <span className="skr-intent-panel-desc">{meta.describe(payload)}</span>
      </div>
      {showError ? (
        <span className="skr-intent-panel-error" aria-live="polite">
          ⚠ {friendlyAgentError(showError)}
        </span>
      ) : showExecuted ? (
        <span className="skr-intent-panel-done" aria-live="polite">
          {meta.successLabel}
        </span>
      ) : showExecuting ? (
        <span className="skr-intent-panel-done" aria-live="polite">
          {meta.executingLabel}
        </span>
      ) : (
        <button type="button" className="skr-btn-primary skr-intent-confirm" onClick={handleConfirm}>
          {meta.confirm}
        </button>
      )}
    </div>
  );
}
