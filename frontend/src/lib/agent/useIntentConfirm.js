/**
 * useIntentConfirm — the intent-panel confirm/execute lifecycle for Agent mode.
 *
 * Extracted from AgentContext (which was over the 500-line cap) so the confirm
 * logic lives on its own. Encapsulates executing a single intent end-to-end
 * (mirroring the panel through executing → executed/error) and running a whole
 * multi-step plan sequentially.
 *
 * @param {object}   args
 * @param {string}   args.apiBaseUrl
 * @param {Function} args.setTurns   React setState for the turn stream
 */
import { useCallback } from "react";
import { executeIntent } from "./intentExecutor";

export default function useIntentConfirm({ apiBaseUrl, setTurns }) {
  /**
   * Confirm an intent panel by executing it server-side (see ./intentExecutor).
   * Mirrors the panel through its executing → executed/error lifecycle so the
   * UI can show progress without forcing the user out of agent mode.
   * Returns `{ url, error }` so callers can detect failure structurally.
   */
  const confirmIntentVerbose = useCallback(
    async (payload) => {
      const updatePanel = (patch) =>
        setTurns((prev) =>
          prev.map((t) =>
            t.kind === "tool-result" && t.payload === payload
              ? { ...t, payload: { ...t.payload, ...patch } }
              : t
          )
        );
      return executeIntent({ payload, apiBaseUrl, updatePanel });
    },
    [apiBaseUrl, setTurns]
  );

  const confirmIntent = useCallback(
    async (payload) => {
      const { url } = await confirmIntentVerbose(payload);
      return url;
    },
    [confirmIntentVerbose]
  );

  /**
   * Run every intent in a multi-step plan sequentially. Returns the URL of the
   * LAST intent (typically the visual one — illustration) so the caller can
   * navigate there once everything has executed. Failure of any single intent
   * aborts the chain. The error is read from the executor's return value (NOT
   * from `intent.executeError`, which is on a stale closure-captured reference —
   * `updatePanel` clones the payload, so mutating the original never propagates).
   */
  const confirmAllIntents = useCallback(
    async (intents) => {
      if (!Array.isArray(intents) || intents.length === 0) return null;
      let lastPath = null;
      for (const intent of intents) {
        if (intent.executed) continue;
        const { url, error } = await confirmIntentVerbose(intent);
        if (url) lastPath = url;
        if (error) break;
      }
      return lastPath;
    },
    [confirmIntentVerbose]
  );

  return { confirmIntent, confirmAllIntents };
}
