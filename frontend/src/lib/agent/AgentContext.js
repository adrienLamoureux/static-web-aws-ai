/**
 * AgentContext — turn state for Agent mode.
 *
 * Holds the manga-panel scroll: a list of `turns`, where each turn is
 *   { id, kind: "user"|"agent"|"thinking"|"tool-result", payload, createdAt }
 *
 * Exposes:
 *   - turns:           Turn[]
 *   - submitting:      boolean
 *   - queueLength:     number — pending typed-ahead messages
 *   - submit(text):    enqueue a user intent; runs immediately if idle
 *   - reroll(payload): re-run the last image with a fresh seed
 *   - tweak(payload, suffix): submit a transformation of the prior prompt
 *   - reset():         clears the panel stream
 *   - greet():         drops the canned no-LLM greeting onto an empty stage
 *
 * The thinking panel cycles through `THINKING_STAGES` (purely client-side) so
 * the user sees progress signals while the backend round-trip + Replicate
 * polling resolves. Stage labels are pinned to the latest "thinking" turn via
 * its id and kept in sync with `submitting`.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useConfig } from "../../contexts/ConfigContext";
import { useTheme } from "../../contexts/ThemeContext";
import { buildApiUrl, postJson } from "../../services/apiClient";
import { executeIntent } from "./intentExecutor";
import { AGENT_TURN } from "../../constants/api-routes";
import { useCompanion, CompanionActions } from "../companion/CompanionContext";
import { useMode } from "../mode/ModeContext";
import { friendlyAgentError, isAgentDisabledError } from "./errorMessages";
import { parseSlashCommand, dispatchSlashCommand } from "./slashCommands";

const HISTORY_CAP = 12;
export const THINKING_STAGES = [
  { at: 0, label: "Picking style…" },
  { at: 1500, label: "Sketching composition…" },
  { at: 4500, label: "Sending to the press…" },
  { at: 9000, label: "Inking the lines…" },
  { at: 18000, label: "Almost there — patience, neh~" },
];

const CANNED_GREETING = {
  text: "What are we making today?",
  emotion: "happy",
  canned: true,
};

const AgentContext = createContext({
  turns: [],
  submitting: false,
  queueLength: 0,
  pendingText: "",
  activeSessionId: "default",
  setActiveSession: () => {},
  submit: async () => {},
  reroll: async () => {},
  tweak: async () => {},
  reset: () => {},
  greet: () => {},
  setPendingText: () => {},
  clearPendingText: () => {},
  confirmIntent: () => {},
});

let _turnIdCounter = 0;
const nextTurnId = () => `t${Date.now().toString(36)}-${(++_turnIdCounter).toString(36)}`;

const ACTIVE_SESSION_KEY = "skr-agent-session";
const DEFAULT_SESSION_ID = "default";

const readStoredSessionId = () => {
  try {
    const raw = window.localStorage.getItem(ACTIVE_SESSION_KEY);
    return typeof raw === "string" && raw.trim() ? raw.trim() : DEFAULT_SESSION_ID;
  } catch {
    return DEFAULT_SESSION_ID;
  }
};

export function AgentProvider({ children }) {
  const { apiBaseUrl } = useConfig();
  const { dispatch } = useCompanion();
  const { setMode } = useMode();
  const { setTheme, setBrightness } = useTheme();
  const [turns, setTurns] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [queue, setQueue] = useState([]);
  const [pendingText, setPendingTextState] = useState("");
  // v1.7 — multiple sessions. activeSessionId is hydrated from localStorage
  // after mount (avoids SSR mismatch). Defaults to "default" — the implicit
  // session that exists without a metadata record.
  const [activeSessionId, setActiveSessionIdState] = useState(DEFAULT_SESSION_ID);
  const historyRef = useRef([]);
  const submittingRef = useRef(false);
  const greetedRef = useRef(false);

  useEffect(() => {
    setActiveSessionIdState(readStoredSessionId());
  }, []);

  const setPendingText = useCallback((text) => setPendingTextState(String(text || "")), []);
  const clearPendingText = useCallback(() => setPendingTextState(""), []);

  // Cross-mode handoff: read & consume the `skr-agent-summon` stash once,
  // pre-filling the composer with the user's draft from Dashboard Forge.
  // One-shot — ignored if older than 60s (stale on idle tabs).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("skr-agent-summon");
      if (!raw) return;
      window.localStorage.removeItem("skr-agent-summon");
      const stash = JSON.parse(raw);
      if (!stash?.prompt || (stash.at && Date.now() - stash.at > 60_000)) return;
      setPendingTextState(stash.prompt);
    } catch {
      // ignore
    }
  }, []);

  /**
   * Apply a clientAction tool result. set_theme is fire-and-forget. Intents
   * are appended as panels with `requiresConfirm: true`; the user confirms
   * via UI buttons that route via `confirmIntent`.
   */
  const applyClientAction = useCallback(
    (action) => {
      if (!action || !action.clientAction) return;
      if (action.clientAction === "set_theme") {
        if (action.theme) setTheme(action.theme);
        if (action.brightness) setBrightness(action.brightness);
      }
      // continue_story / illustrate_scene: handled by the user clicking the
      // confirm button on the rendered intent panel — no auto-action here.
    },
    [setTheme, setBrightness]
  );

  const append = useCallback((turn) => {
    setTurns((prev) => [...prev, { id: nextTurnId(), createdAt: Date.now(), ...turn }]);
  }, []);

  const replaceTurn = useCallback((id, updater) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...updater(t) } : t)));
  }, []);

  const reset = useCallback(() => {
    setTurns([]);
    historyRef.current = [];
    greetedRef.current = false;
    setQueue([]);
  }, []);

  const greet = useCallback(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    append({ kind: "agent", payload: CANNED_GREETING });
  }, [append]);

  /**
   * Switch to a different (or new) named session. Persists the choice to
   * localStorage and wipes the local turn stream so the previous session's
   * panels don't leak. The next agent turn re-loads memory from the backend
   * automatically via the new sessionId namespace.
   */
  const setActiveSession = useCallback(
    (nextId) => {
      const id = String(nextId || "").trim() || DEFAULT_SESSION_ID;
      if (id === activeSessionId) return;
      try {
        window.localStorage.setItem(ACTIVE_SESSION_KEY, id);
      } catch {
        // ignore
      }
      setActiveSessionIdState(id);
      // Wipe local stream — backend memory will hydrate on the next turn.
      setTurns([]);
      historyRef.current = [];
      greetedRef.current = false;
      setQueue([]);
    },
    [activeSessionId]
  );

  /**
   * Run a single user intent end-to-end. Returns when the round-trip + any
   * subsequent queue items have all resolved. Pulls thinking-stage progression
   * via setTimeout while the request is in flight.
   */
  const runOne = useCallback(
    async (text) => {
      append({ kind: "user", payload: { text } });
      historyRef.current = [...historyRef.current, { role: "user", content: text }].slice(
        -HISTORY_CAP
      );

      // Inject thinking panel + cycle stage labels
      const thinkingId = nextTurnId();
      setTurns((prev) => [
        ...prev,
        {
          id: thinkingId,
          kind: "thinking",
          payload: { label: THINKING_STAGES[0].label },
          createdAt: Date.now(),
        },
      ]);
      const stageTimers = THINKING_STAGES.slice(1).map((stage) =>
        window.setTimeout(() => {
          replaceTurn(thinkingId, () => ({ payload: { label: stage.label } }));
        }, stage.at)
      );

      dispatch(CompanionActions.GENERATION_START, { type: "image" });

      try {
        const url = buildApiUrl(apiBaseUrl, AGENT_TURN);
        const data = await postJson(url, {
          messages: historyRef.current,
          sessionId: activeSessionId,
          context: { page: "atelier" },
        });

        // Drop thinking placeholder + cancel stage timers
        stageTimers.forEach(window.clearTimeout);
        setTurns((prev) => prev.filter((t) => t.id !== thinkingId));

        const agentText = String(data?.text || "").trim();
        const emotion = data?.emotion || "neutral";
        const toolCalls = Array.isArray(data?.toolCalls) ? data.toolCalls : [];

        if (agentText && agentText !== "(thinking…)") {
          append({ kind: "agent", payload: { text: agentText, emotion } });
          historyRef.current = [
            ...historyRef.current,
            { role: "assistant", content: agentText },
          ].slice(-HISTORY_CAP);
        }

        // Track payloads that need user confirmation — when 2+ arrive
        // together (multi-step plan), we'll append a "Confirm all" turn so
        // the user can apply them in one click.
        const intentPayloads = [];

        for (const tc of toolCalls) {
          if (tc.error || !tc.result) {
            append({
              kind: "tool-result",
              payload: {
                name: tc.name,
                args: tc.args,
                error: friendlyAgentError(tc.error, "tool_failed"),
                rawError: tc.error,
                status: "failed",
              },
            });
            dispatch(CompanionActions.GENERATION_ERROR, { type: "image", error: tc.error });
            continue;
          }
          // Client-action tools — set_theme applies immediately; intents
          // render as panels with a confirm button.
          if (tc.result.clientAction) {
            applyClientAction(tc.result);
            const payload = { name: tc.name, args: tc.args, ...tc.result, status: "succeeded" };
            append({ kind: "tool-result", payload });
            if (tc.result.requiresConfirm) intentPayloads.push(payload);
            continue;
          }
          // generate_image — pre-mark status="succeeded" on fast-path so
          // ToolResultPanel skips polling.
          append({
            kind: "tool-result",
            payload: {
              name: tc.name,
              args: tc.args,
              ...tc.result,
              status: tc.result.imageUrl ? "succeeded" : tc.result.status || "starting",
            },
          });
          if (tc.result.imageUrl) {
            dispatch(CompanionActions.GENERATION_DONE, { type: "image", success: true });
          }
        }

        // Multi-step plan: when the agent fires 2+ intent tools in the same
        // turn, drop a single "Confirm all" turn so the user can apply them
        // sequentially with one click instead of N clicks.
        if (intentPayloads.length >= 2) {
          append({ kind: "confirm-all", payload: { intents: intentPayloads } });
        }
      } catch (err) {
        stageTimers.forEach(window.clearTimeout);
        setTurns((prev) => prev.filter((t) => t.id !== thinkingId));

        if (isAgentDisabledError(err)) {
          // Auto-flip back to dashboard so the user isn't stranded
          append({
            kind: "agent",
            payload: {
              text: friendlyAgentError("agent_mode_disabled"),
              emotion: "sad",
              error: true,
            },
          });
          window.setTimeout(() => setMode("dashboard"), 1200);
        } else {
          append({
            kind: "agent",
            payload: {
              text: friendlyAgentError(err?.message, "tool_dispatch_failed"),
              emotion: "sad",
              error: true,
            },
          });
        }
        dispatch(CompanionActions.GENERATION_ERROR, { type: "image", error: err?.message });
      }
    },
    [apiBaseUrl, activeSessionId, append, applyClientAction, dispatch, replaceTurn, setMode]
  );

  // Drain the queue serially. submittingRef avoids a state-stale race when
  // multiple submits land within the same render commit.
  useEffect(() => {
    if (submittingRef.current || queue.length === 0) return;
    submittingRef.current = true;
    setSubmitting(true);
    const [next, ...rest] = queue;
    setQueue(rest);
    runOne(next).finally(() => {
      submittingRef.current = false;
      setSubmitting((prev) => (prev && rest.length > 0 ? true : false));
    });
  }, [queue, runOne]);

  // Most recent user prompt — needed by /reroll.
  const lastUserPrompt =
    turns.findLast?.((t) => t.kind === "user")?.payload?.text ||
    [...turns].reverse().find((t) => t.kind === "user")?.payload?.text ||
    "";

  const submit = useCallback(
    async (rawText) => {
      const text = String(rawText || "").trim();
      if (!text) return;
      // Intercept slash commands before they hit the agent.
      const parsed = parseSlashCommand(text);
      if (parsed) {
        const r = dispatchSlashCommand(parsed, { append, reset, applyClientAction, lastUserPrompt });
        if (r.handled) {
          if (r.forward) setQueue((prev) => [...prev, r.forward]);
          return;
        }
      }
      setQueue((prev) => [...prev, text]);
    },
    [append, reset, applyClientAction, lastUserPrompt]
  );

  const reroll = useCallback(
    async (payload) => {
      if (!payload?.prompt) return;
      const styleHint = payload.style ? ` (${payload.style}, ${payload.aspect || "3:4"})` : "";
      submit(`Re-roll: ${payload.prompt}${styleHint}`);
    },
    [submit]
  );

  const tweak = useCallback(
    async (payload, suffix) => {
      if (!payload?.prompt || !suffix) return;
      submit(`${payload.prompt}, ${suffix}`);
    },
    [submit]
  );

  /**
   * Confirm an intent panel by executing it server-side (see ./intentExecutor).
   * Mirrors the panel through its executing → executed/error lifecycle so the
   * UI can show progress without forcing the user out of agent mode.
   *
   * Returns the navigation URL on success, or `null` on failure. Callers that
   * need to detect failure structurally should use `confirmIntentVerbose`
   * (returns `{url, error}`).
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
    [apiBaseUrl]
  );

  const confirmIntent = useCallback(
    async (payload) => {
      const { url } = await confirmIntentVerbose(payload);
      return url;
    },
    [confirmIntentVerbose]
  );

  /**
   * Run every intent in a multi-step plan sequentially. Returns the URL of
   * the LAST intent (typically the visual one — illustration) so the caller
   * can navigate there once everything has executed. Failure of any single
   * intent aborts the chain. The error is read from the executor's return
   * value (NOT from `intent.executeError`, which is on a stale closure-captured
   * reference — `updatePanel` clones the payload, so mutating the original
   * never propagates).
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

  const value = useMemo(
    () => ({
      turns,
      submitting,
      queueLength: queue.length,
      pendingText,
      activeSessionId,
      setActiveSession,
      submit,
      reroll,
      tweak,
      reset,
      greet,
      setPendingText,
      clearPendingText,
      confirmIntent,
      confirmAllIntents,
    }),
    [
      turns,
      submitting,
      queue.length,
      pendingText,
      activeSessionId,
      setActiveSession,
      submit,
      reroll,
      tweak,
      reset,
      greet,
      setPendingText,
      clearPendingText,
      confirmIntent,
      confirmAllIntents,
    ]
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export const useAgent = () => useContext(AgentContext);
