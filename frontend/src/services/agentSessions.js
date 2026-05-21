/**
 * Service helpers for the agent sessions API.
 *
 * The session id IS the memory namespace — the frontend mints it client-side
 * (uuid v4) so the same id can be passed straight into POST /api/agent/turn
 * without a creation round-trip.
 */

import { buildApiUrl, fetchJson, postJson, putJson, deleteJson } from "./apiClient";
import { AGENT_SESSIONS } from "../constants/api-routes";

const fetchPatchJson = (url, payload, errorMessage) =>
  fetchJson(
    url,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    errorMessage
  );

export const listAgentSessions = (apiBaseUrl) =>
  fetchJson(buildApiUrl(apiBaseUrl, AGENT_SESSIONS), {}, "Failed to load sessions.");

export const createAgentSession = (apiBaseUrl, { sessionId, name }) =>
  postJson(
    buildApiUrl(apiBaseUrl, AGENT_SESSIONS),
    { sessionId, name },
    "Failed to create session."
  );

export const renameAgentSession = (apiBaseUrl, sessionId, name) =>
  fetchPatchJson(
    buildApiUrl(apiBaseUrl, `${AGENT_SESSIONS}/${encodeURIComponent(sessionId)}`),
    { name },
    "Failed to rename session."
  );

export const deleteAgentSession = (apiBaseUrl, sessionId) =>
  deleteJson(
    buildApiUrl(apiBaseUrl, `${AGENT_SESSIONS}/${encodeURIComponent(sessionId)}`),
    "Failed to delete session."
  );

/**
 * Mint a new session id. Uses crypto.randomUUID when available (modern
 * browsers / Node 14.17+), falls back to a timestamped random suffix that
 * matches the backend's `[a-zA-Z0-9_-]+` validator.
 */
export const mintSessionId = () => {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
};
