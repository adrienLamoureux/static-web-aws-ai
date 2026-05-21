/**
 * RerollButton — one-click variation using the same prompt + a fresh seed.
 * Suno/Midjourney convention. Wraps useAgent().reroll().
 */

import React from "react";
import { useAgent } from "../../../lib/agent/AgentContext";

export default function RerollButton({ payload }) {
  const { reroll, submitting } = useAgent();
  if (!payload?.prompt) return null;

  return (
    <button
      type="button"
      className="skr-btn-reroll"
      onClick={() => reroll(payload)}
      disabled={submitting}
      title="Generate a variation with a fresh seed"
    >
      ↻ Re-roll
    </button>
  );
}
