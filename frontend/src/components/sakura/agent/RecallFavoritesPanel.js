/**
 * RecallFavoritesPanel — renders the result of the `recall_favorites` tool.
 *
 * Shows a horizontal strip of thumbnail tiles (the user's most-recent IMG
 * items, signed for ~15min). Hovering or focusing a tile reveals the prompt.
 * Clicking a tile pre-fills the composer with its prompt so the user can
 * iterate from it directly.
 */

import React from "react";
import { useAgent } from "../../../lib/agent/AgentContext";

export default function RecallFavoritesPanel({ payload }) {
  const { setPendingText } = useAgent();
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length === 0) {
    return (
      <div className="skr-recall-empty">
        Nothing in your gallery yet — let's make something first, neh~
      </div>
    );
  }

  return (
    <div className="skr-recall-panel">
      <div className="skr-recall-head">
        ◆ Pulled <strong>{items.length}</strong> from your gallery
      </div>
      <div className="skr-recall-strip" role="list">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            className="skr-recall-tile"
            role="listitem"
            onClick={() => it.prompt && setPendingText(it.prompt)}
            title={it.prompt || "no prompt"}
            aria-label={`Use prompt: ${it.prompt || "no prompt"}`}
          >
            {it.url ? (
              <img src={it.url} alt={it.prompt || ""} loading="lazy" />
            ) : (
              <span className="skr-recall-tile-fallback" aria-hidden="true">
                ✦
              </span>
            )}
            {it.prompt ? <span className="skr-recall-tile-prompt">{it.prompt}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
