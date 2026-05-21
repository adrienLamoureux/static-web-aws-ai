/**
 * AgentIntentBanner — surfaces "came from Hiyori" hint on Chronicle landing.
 *
 * Reads the `skr-agent-intent` localStorage stash written by
 * AgentContext.confirmIntent. Displays a small dismissable banner for ~6s,
 * then auto-clears. Stash is one-shot — read once and removed.
 *
 * Safe to mount anywhere; renders null when no stash is present.
 */

import React, { useEffect, useState } from "react";

const STASH_KEY = "skr-agent-intent";
const AUTO_DISMISS_MS = 6000;

const ACTION_COPY = {
  continue_story: (p) => `Hiyori added: "${p?.payload?.content || ""}"`,
  illustrate_scene: (p) =>
    `Hiyori queued an illustration for scene ${p?.payload?.sceneId || ""}`,
  generate_music: (p) =>
    `Hiyori queued ${p?.payload?.mood || ""} music${p?.payload?.description ? `: ${p.payload.description}` : ""}`,
};

const readAndClearStash = () => {
  try {
    const raw = window.localStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const stash = JSON.parse(raw);
    window.localStorage.removeItem(STASH_KEY);
    // Treat stashes older than 60s as stale (user may have navigated away)
    if (!stash?.at || Date.now() - stash.at > 60_000) return null;
    return stash;
  } catch {
    return null;
  }
};

export default function AgentIntentBanner() {
  const [stash, setStash] = useState(null);

  useEffect(() => {
    const s = readAndClearStash();
    if (!s) return undefined;
    setStash(s);
    const t = window.setTimeout(() => setStash(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (!stash) return null;
  const copy = ACTION_COPY[stash.action];
  const text = copy ? copy(stash) : "Hiyori acted on your behalf.";

  return (
    <div className="skr-agent-intent-banner" role="status">
      <span aria-hidden="true">✦</span>
      <span className="skr-agent-intent-banner-text">{text}</span>
      <button
        type="button"
        className="skr-agent-intent-banner-close"
        onClick={() => setStash(null)}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
