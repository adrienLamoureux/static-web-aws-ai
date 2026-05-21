/**
 * TweakChips — quick transform suggestions under each result panel. Each chip
 * pre-fills the composer with `<prior prompt>, <suffix>` and auto-submits via
 * `useAgent().tweak`. Surfaces the multi-turn loop without forcing the user
 * to type variations from scratch.
 */

import React from "react";
import { useAgent } from "../../../lib/agent/AgentContext";

const CHIPS = [
  { label: "more like this", suffix: "same composition, slight variation, refined details" },
  { label: "wider shot", suffix: "wide angle, full body, more environment visible" },
  { label: "softer light", suffix: "soft diffused lighting, gentle pastel palette" },
  { label: "more dramatic", suffix: "cinematic lighting, deep shadows, high contrast" },
];

export default function TweakChips({ payload }) {
  const { tweak, submitting } = useAgent();
  if (!payload?.prompt) return null;

  return (
    <div className="skr-tweak-chips" role="group" aria-label="Quick variations">
      {CHIPS.map((chip) => (
        <button
          key={chip.label}
          type="button"
          className="skr-tweak-chip"
          onClick={() => tweak(payload, chip.suffix)}
          disabled={submitting}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
