/**
 * MangaPanel — single panel in the AgentStage scroll.
 *
 * Variants (by `turn.kind`):
 *   - "user"        right-aligned glass bubble with the user's prompt
 *                   (click → composer pre-fills via setPendingText)
 *   - "agent"       Hiyori speech bubble (click → setPendingText for quoting)
 *   - "thinking"    speed-lines + thinking dots; label cycles through stages
 *   - "tool-result" wraps either:
 *                     * a `clientAction` intent (continue_story, illustrate_scene)
 *                       → IntentPanel with confirm button
 *                     * a set_theme result → small theme-applied chip
 *                     * a generate_image result → ToolResultPanel + tweak chips
 */

import React from "react";
import ToolResultPanel from "./ToolResultPanel";
import TweakInDashboard from "./TweakInDashboard";
import TweakChips from "./TweakChips";
import RerollButton from "./RerollButton";
import IntentPanel from "./IntentPanel";
import ConfirmAllPanel from "./ConfirmAllPanel";
import RecallFavoritesPanel from "./RecallFavoritesPanel";
import BrowseGalleryPanel from "./BrowseGalleryPanel";
import { useAgent } from "../../../lib/agent/AgentContext";

const ThinkingDots = () => (
  <span className="skr-thinking" aria-label="Hiyori is thinking">
    <span className="skr-thinking-dot" style={{ animationDelay: "0s" }}>
      ●
    </span>
    <span className="skr-thinking-dot" style={{ animationDelay: "0.15s" }}>
      ●
    </span>
    <span className="skr-thinking-dot" style={{ animationDelay: "0.3s" }}>
      ●
    </span>
  </span>
);

const UserPanel = ({ payload, onSelect }) => (
  <button
    type="button"
    className="skr-manga-panel skr-manga-panel--user"
    onClick={() => onSelect(payload.text)}
    title="Click to quote in composer"
  >
    <p className="skr-manga-panel-text">{payload.text}</p>
  </button>
);

// Render text with **bold** spans honoured — used by canned messages like
// /help where we want a bit of structure without pulling in a full markdown
// renderer. Plain text passes through unchanged.
const renderInlineBold = (text = "") => {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
};

const AgentPanel = ({ payload, onSelect }) => (
  <button
    type="button"
    className={`skr-manga-panel skr-manga-panel--agent${payload.error ? " is-error" : ""}${payload.canned ? " is-canned" : ""}`}
    data-emotion={payload.emotion || "neutral"}
    onClick={() => !payload.error && onSelect(payload.text)}
    title={payload.error ? "" : "Click to quote in composer"}
  >
    <div className="skr-manga-panel-tail" aria-hidden="true" />
    <p className="skr-manga-panel-text">{renderInlineBold(payload.text)}</p>
  </button>
);

const ThinkingPanel = ({ payload }) => (
  <div className="skr-manga-panel skr-manga-panel--thinking" aria-live="polite">
    <div className="skr-speed-lines" aria-hidden="true" />
    <ThinkingDots />
    <span className="skr-manga-panel-thinking-label">{payload?.label || "crafting…"}</span>
  </div>
);

const ThemeAppliedChip = ({ payload }) => (
  <div className="skr-manga-panel skr-manga-panel--theme-applied">
    <span aria-hidden="true">✦</span> Theme switched to <strong>{payload.theme}</strong>
    {payload.brightness ? ` (${payload.brightness})` : ""}
  </div>
);

export default function MangaPanel({ turn }) {
  const { kind, payload } = turn;
  const { setPendingText } = useAgent();

  if (kind === "user") return <UserPanel payload={payload} onSelect={setPendingText} />;
  if (kind === "agent") return <AgentPanel payload={payload} onSelect={setPendingText} />;
  if (kind === "thinking") return <ThinkingPanel payload={payload} />;

  if (kind === "confirm-all") {
    return (
      <div className="skr-manga-panel skr-manga-panel--tool">
        <ConfirmAllPanel payload={payload} />
      </div>
    );
  }

  if (kind === "tool-result") {
    // Intent tools — surface a confirm button instead of the result panel.
    if (payload?.requiresConfirm) {
      return (
        <div className="skr-manga-panel skr-manga-panel--tool">
          <IntentPanel payload={payload} />
        </div>
      );
    }
    // set_theme — small applied chip, no further controls.
    if (payload?.clientAction === "set_theme") {
      return <ThemeAppliedChip payload={payload} />;
    }
    // recall_favorites — horizontal thumbnail strip (user's own history).
    if (payload?.clientAction === "recall_favorites") {
      return (
        <div className="skr-manga-panel skr-manga-panel--tool">
          <RecallFavoritesPanel payload={payload} />
        </div>
      );
    }
    // browse_gallery — public shared images for inspiration.
    if (payload?.clientAction === "browse_gallery") {
      return (
        <div className="skr-manga-panel skr-manga-panel--tool">
          <BrowseGalleryPanel payload={payload} />
        </div>
      );
    }
    // generate_image — full result panel with tweak chips + reroll/tweak.
    const isDone = payload?.status === "succeeded" && (payload.imageUrl || payload.predictionId);
    return (
      <div className="skr-manga-panel skr-manga-panel--tool">
        <ToolResultPanel turn={turn} />
        {isDone && payload?.prompt ? (
          <>
            <TweakChips payload={payload} />
            <div className="skr-manga-panel-actions">
              <RerollButton payload={payload} />
              <TweakInDashboard payload={payload} />
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return null;
}
