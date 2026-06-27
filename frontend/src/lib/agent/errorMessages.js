/**
 * Map opaque backend error codes to user-facing copy. The error codes come
 * from agent-tools.js + agent-route.js (`replicate_token_missing`, etc.).
 */
const FRIENDLY_AGENT_ERRORS = {
  agent_mode_disabled: "Agent mode is paused — back to Dashboard.",
  agent_unavailable: "I lost the thread — give me a moment and try again?",
  prompt_required: "Tell me a little about what you'd like to make.",
  replicate_token_missing:
    "I can't reach the image press right now. Ping the Director to check the keys, neh~",
  replicate_create_failed: "The press jammed — try once more?",
  replicate_no_prediction: "The press didn't pick up the order. One more try?",
  unauthorized: "I need you signed in for that.",
  tool_dispatch_failed: "Something tripped me up — try again?",
  unknown_tool: "I don't know that move yet.",
  timeout: "It's taking longer than usual — let me try again.",
  tool_failed: "That didn't work — try again?",
  rate_limited: "Slow down a moment — Hiyori is catching her breath.",
  daily_cap_reached: "You've used up your daily token budget. Resets at midnight UTC.",
  image_daily_cap_reached: "You've hit today's image budget. Resets at midnight UTC.",
};

export const friendlyAgentError = (code, fallback) => {
  if (!code) return fallback || "Something tripped me up — try again?";
  if (FRIENDLY_AGENT_ERRORS[code]) return FRIENDLY_AGENT_ERRORS[code];
  // Match prefix codes like "unknown_tool:foo"
  const prefix = String(code).split(":")[0];
  return FRIENDLY_AGENT_ERRORS[prefix] || fallback || "Something tripped me up — try again?";
};

/**
 * Was this error specifically the backend signalling that Agent mode is
 * disabled (feature flag off)? Used by AgentContext to auto-flip the user
 * back to Dashboard.
 *
 * Narrow on purpose: the previous regex matched any "Request failed" string,
 * which folded transient connectivity failures into the disabled path and
 * silently booted the user out of agent mode whenever the network blipped.
 * Now requires the explicit backend signal: HTTP 404 from `/api/agent/turn`
 * carrying `{ error: "agent_mode_disabled" }` (see backend agent-route.js).
 * fetchJson stamps `.status` and `.errorCode` on the thrown Error for this.
 */
export const isAgentDisabledError = (err) => {
  if (!err) return false;
  if (err.errorCode === "agent_mode_disabled") return true;
  // Fallback: legacy error shape (message only) — keep narrow to the literal
  // backend code so transient `Request failed.` strings don't trigger.
  const msg = String(err.message || err);
  return msg.includes("agent_mode_disabled");
};
