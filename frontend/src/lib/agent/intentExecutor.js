/**
 * intentExecutor — runs a `requiresConfirm` agent intent server-side via the
 * existing story endpoints.
 *
 * Split out of AgentContext to keep that file under the 500-line cap. Pure
 * async function; the caller supplies an `updatePanel(patch)` callback that
 * mirrors the panel through its lifecycle (executing → executed / error).
 *
 * Returns `{ url, error }`:
 *   - `url`: navigation target on success, `null` otherwise.
 *   - `error`: error code/message on failure, `null` on success.
 *
 * The structured shape lets callers (notably `confirmAllIntents`) detect
 * failure without reading from the stale `intent` array reference — the
 * `updatePanel` patch clones the payload, so mutating the original ref to
 * communicate failure would never propagate.
 */

import {
  sendStoryMessage,
  generateStoryIllustration,
  startStorySceneMusic,
} from "../../services/story";

const stashIntent = (action, payload) => {
  try {
    window.localStorage.setItem(
      "skr-agent-intent",
      JSON.stringify({ action, payload, at: Date.now() })
    );
  } catch {
    // ignore (quota / private mode)
  }
};

const chronicleUrl = (sessionId) =>
  `/chronicle?session=${encodeURIComponent(sessionId)}`;

const fail = (updatePanel, error) => {
  updatePanel({ executing: false, executeError: error });
  return { url: null, error };
};

const succeed = (updatePanel, url) => {
  updatePanel({ executing: false, executed: true });
  return { url, error: null };
};

export async function executeIntent({ payload, apiBaseUrl, updatePanel }) {
  if (!payload || !payload.clientAction) {
    return { url: null, error: "invalid_payload" };
  }
  updatePanel({ executing: true });

  try {
    if (payload.clientAction === "continue_story") {
      if (!payload.sessionId) return fail(updatePanel, "no_session");
      await sendStoryMessage(apiBaseUrl, payload.sessionId, { content: payload.content });
      stashIntent("continue_story", payload);
      return succeed(updatePanel, chronicleUrl(payload.sessionId));
    }

    if (payload.clientAction === "illustrate_scene") {
      await generateStoryIllustration(apiBaseUrl, payload.sessionId, {
        sceneId: payload.sceneId,
      });
      stashIntent("illustrate_scene", payload);
      return succeed(updatePanel, chronicleUrl(payload.sessionId));
    }

    if (payload.clientAction === "generate_music") {
      const prompt =
        [payload.mood && `${payload.mood} mood`, payload.description]
          .filter(Boolean)
          .join(": ") || payload.mood;
      await startStorySceneMusic(apiBaseUrl, payload.sessionId, payload.sceneId, { prompt });
      stashIntent("generate_music", payload);
      return succeed(updatePanel, chronicleUrl(payload.sessionId));
    }
  } catch (err) {
    return fail(updatePanel, err?.message || "intent_failed");
  }
  return { url: null, error: "unknown_action" };
}
