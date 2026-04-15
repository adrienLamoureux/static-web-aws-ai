/**
 * SideChatPanel — always-visible chat bubble panel left of the Live2D character.
 * Replaces the old slide-up CompanionChat with an inline message list + input.
 * Positioned absolute inside the canvas container so it floats beside the character.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { useConfig } from "../../../contexts/ConfigContext";
import { postJson, buildApiUrl, deleteJson } from "../../../services/apiClient";
import {
  COMPANION_CHAT,
  COMPANION_INITIATIVE,
  COMPANION_MEMORY,
} from "../../../constants/api-routes";
import ActionCard from "./ActionCard";
import { styles } from "./side-chat-panel-styles";

const MAX_HISTORY = 20;
const REVEAL_DELAY_MS = 28;
const INACTIVITY_THRESHOLD_MS = 4 * 60 * 1000; // 4 min silence → initiative
const INITIATIVE_COOLDOWN_MS = 5 * 60 * 1000; // min gap between initiatives
const MAX_INITIATIVES = 3; // per session cap

const PAGE_LABELS = {
  "/": "Realm (Home)",
  "/atelier": "Atelier (Image & Video Forge)",
  "/chronicle": "Chronicle (Story)",
  "/gallery": "Gallery",
  "/sanctum": "Sanctum (Director)",
};

function ThinkingDots() {
  return (
    <span style={dotStyles.row}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ ...dotStyles.dot, animationDelay: `${i * 0.2}s` }} />
      ))}
    </span>
  );
}

const dotStyles = {
  row: { display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 0" },
  dot: {
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--skr-accent)",
    animation: "skr-thinking-dot 1.4s ease-in-out infinite",
    opacity: 0.2,
  },
};

export default function SideChatPanel({
  engineRef,
  onNavigate,
  proactiveText,
  onProactiveDismiss,
  characterName,
  mode = "side", // "side" (absolute, floats beside canvas) | "fullscreen" (fills flex parent)
}) {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { apiBaseUrl } = useConfig();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [revealText, setRevealText] = useState("");
  const [revealFull, setRevealFull] = useState("");
  const [hasMemory, setHasMemory] = useState(false);

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const revealRef = useRef(null);
  const abortRef = useRef(null);
  const pendingActionsRef = useRef(null);
  const prevProactiveRef = useRef(null);
  const pendingInitiativeRef = useRef(false);

  // Initiative timing refs (stable across renders, no stale closure issues)
  const lastActivityRef = useRef(Date.now());
  const lastInitiativeRef = useRef(0);
  const initiativeCountRef = useRef(0);
  const loadingRef = useRef(false);
  const messagesRef = useRef([]);
  const revealingRef = useRef(false);

  const currentPage = PAGE_LABELS[location.pathname] || location.pathname;

  // Mirror state into refs so interval callbacks don't go stale
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Navigation counts as user activity — reset inactivity timer
  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, [location.pathname]);

  // Inject proactive message into history when it first appears
  useEffect(() => {
    if (proactiveText && proactiveText !== prevProactiveRef.current) {
      prevProactiveRef.current = proactiveText;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: proactiveText, isProactive: true },
      ]);
    }
  }, [proactiveText]);

  // Auto-scroll
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, revealText]);

  // Cleanup
  useEffect(
    () => () => {
      abortRef.current?.abort();
      clearTimeout(revealRef.current);
    },
    []
  );

  // Character-by-character reveal with lip sync
  useEffect(() => {
    revealingRef.current = !!revealFull;
    if (!revealFull) return;
    clearTimeout(revealRef.current);
    let i = 0;
    setRevealText("");

    const charByChar = () => {
      i += 1;
      setRevealText(revealFull.slice(0, i));
      if (i < revealFull.length) {
        revealRef.current = setTimeout(charByChar, REVEAL_DELAY_MS);
      } else {
        const finalMsg = { role: "assistant", text: revealFull };
        if (pendingActionsRef.current) {
          finalMsg.actions = pendingActionsRef.current;
          pendingActionsRef.current = null;
        }
        if (pendingInitiativeRef.current) {
          finalMsg.isInitiative = true;
          pendingInitiativeRef.current = false;
        }
        setMessages((prev) => [...prev, finalMsg]);
        setRevealText("");
        setRevealFull("");
        revealingRef.current = false;
        engineRef.current?.stopLipSync();
      }
    };

    const lipSyncDuration = revealFull.length * REVEAL_DELAY_MS + 400;
    engineRef.current?.startLipSync(lipSyncDuration);
    revealRef.current = setTimeout(charByChar, REVEAL_DELAY_MS);
  }, [revealFull, engineRef]);

  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim() || loading) return;
      onProactiveDismiss?.();
      lastActivityRef.current = Date.now(); // user is active

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const userMsg = { role: "user", text: text.trim() };
      const nextMessages = [...messages, userMsg].slice(-MAX_HISTORY);
      setMessages(nextMessages);
      setInput("");
      setLoading(true);

      const history = nextMessages
        .filter((m) => !m.isProactive)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.text }));

      try {
        const data = await postJson(buildApiUrl(apiBaseUrl, COMPANION_CHAT), {
          messages: history,
          context: { page: currentPage, isAuthenticated },
        });

        engineRef.current?.setEmotion(data.emotion || "neutral", 4000);
        if (data.hasMemory !== undefined) setHasMemory(data.hasMemory);

        const actions = [];
        if (data.generation) actions.push({ ...data.generation });
        if (data.navigation) actions.push({ type: "navigate", ...data.navigation });
        if (data.storyAction) actions.push({ ...data.storyAction });
        if (data.musicAction) actions.push({ ...data.musicAction });
        if (actions.length > 0) pendingActionsRef.current = actions;

        setRevealFull(data.text || "...");
      } catch (err) {
        if (err.name !== "AbortError") {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text: "(whispers something inaudible)", isError: true },
          ]);
        }
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, currentPage, engineRef, apiBaseUrl, isAuthenticated, onProactiveDismiss]
  );

  // ─── Character-initiated conversation ─────────────────────────────────────
  const triggerInitiative = useCallback(async () => {
    // Guards: busy, already revealing, or session cap reached
    if (loadingRef.current || revealingRef.current) return;
    if (initiativeCountRef.current >= MAX_INITIATIVES) return;

    // Need at least one real exchange (not counting proactive messages)
    const realMsgs = messagesRef.current.filter((m) => !m.isProactive);
    if (realMsgs.length < 1) return;

    // Advance counters before the async call to prevent double-fire
    lastInitiativeRef.current = Date.now();
    lastActivityRef.current = Date.now(); // treat initiative as "activity"
    initiativeCountRef.current += 1;

    // Build session history to send (last 8 real messages)
    const sessionMsgs = realMsgs.slice(-8).map((m) => ({ role: m.role, content: m.text }));

    try {
      const data = await postJson(buildApiUrl(apiBaseUrl, COMPANION_INITIATIVE), {
        messages: sessionMsgs,
        context: { page: currentPage, isAuthenticated },
      });
      if (!data?.text) return;
      engineRef.current?.setEmotion(data.emotion || "neutral", 4000);
      pendingInitiativeRef.current = true;
      setRevealFull(data.text);
    } catch {
      // Silent fail — the initiative is background, don't surface errors to user
      initiativeCountRef.current -= 1; // give back the slot on error
    }
  }, [apiBaseUrl, currentPage, isAuthenticated, engineRef]);

  // Inactivity timer — checks every 30 s, fires initiative when conditions met
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (
        now - lastActivityRef.current > INACTIVITY_THRESHOLD_MS &&
        now - lastInitiativeRef.current > INITIATIVE_COOLDOWN_MS &&
        initiativeCountRef.current < MAX_INITIATIVES
      ) {
        triggerInitiative();
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [triggerInitiative]);

  const handleClearMemory = useCallback(async () => {
    if (!apiBaseUrl) return;
    try {
      await deleteJson(buildApiUrl(apiBaseUrl, COMPANION_MEMORY));
      setHasMemory(false);
    } catch {}
  }, [apiBaseUrl]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isFull = mode === "fullscreen";

  return (
    <div style={isFull ? styles.panelFull : styles.panel}>
      {/* Memory strip */}
      {hasMemory && (
        <div style={styles.memoryRow}>
          <span style={styles.memoryBadge}>remembers you</span>
          <button type="button" onClick={handleClearMemory} style={styles.forgetBtn}>
            forget
          </button>
        </div>
      )}

      {/* Message list */}
      <div ref={listRef} style={styles.list}>
        {messages.length === 0 && !loading && (
          <p style={styles.empty}>Say something to {characterName}…</p>
        )}
        {messages.map((m, i) => (
          <div key={i}>
            <div
              style={{
                ...styles.bubble,
                ...(m.role === "user" ? styles.bubbleUser : styles.bubbleHiyori),
                ...(m.isError ? styles.bubbleError : {}),
              }}
            >
              {m.role === "assistant" && (
                <span style={styles.name}>
                  {m.isInitiative ? "✦ " : ""}
                  {characterName}
                </span>
              )}
              <span>{m.text}</span>
            </div>
            {m.actions?.map((action, j) => (
              <div key={j} style={styles.actionWrapper}>
                <ActionCard action={action} onNavigate={onNavigate} />
              </div>
            ))}
          </div>
        ))}

        {/* Currently revealing */}
        {revealText && (
          <div style={{ ...styles.bubble, ...styles.bubbleHiyori }}>
            <span style={styles.name}>{characterName}</span>
            <span>
              {revealText}
              <span style={styles.cursor}>|</span>
            </span>
          </div>
        )}

        {/* Thinking */}
        {loading && !revealText && (
          <div style={{ ...styles.bubble, ...styles.bubbleHiyori }}>
            <ThinkingDots />
          </div>
        )}
      </div>

      {/* Input */}
      <div style={styles.inputRow}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          disabled={loading}
          style={styles.input}
          maxLength={300}
        />
        <button
          type="button"
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          style={styles.sendBtn}
          aria-label="Send"
        >
          ↑
        </button>
      </div>

      {/* Tail pointing right toward the character — side mode only */}
      {!isFull && <div style={styles.tailOuter} />}
      {!isFull && <div style={styles.tailInner} />}
    </div>
  );
}
