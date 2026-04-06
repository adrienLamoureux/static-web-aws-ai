/**
 * CompanionChat — multi-turn chat panel that slides up from the companion footer.
 *
 * Sends messages to POST /api/companion/chat with conversation history and page context.
 * Reveals AI responses character-by-character and drives lip sync on the Live2D engine.
 *
 * Features:
 * - Authenticated requests when logged in (enables per-user memory + generation)
 * - Memory status indicator + clear memory button
 * - Action cards via ActionCard dispatcher (image, navigate, story, music)
 * - Expandable mode: docked (240px) ↔ expanded (420px wide, taller)
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { useConfig } from "../../../contexts/ConfigContext";
import { postJson, buildApiUrl, deleteJson } from "../../../services/apiClient";
import { COMPANION_CHAT, COMPANION_MEMORY } from "../../../constants/api-routes";
import ActionCard from "./ActionCard";

const MAX_HISTORY = 20;
const REVEAL_DELAY_MS = 28; // ms per character
const HUD_H = 64; // matches --skr-hud-height

const PAGE_LABELS = {
  "/":          "Realm (Home)",
  "/atelier":   "Atelier (Image & Video Forge)",
  "/chronicle": "Chronicle (Story)",
  "/gallery":   "Gallery",
  "/sanctum":   "Sanctum (Director)",
};

export default function CompanionChat({ engineRef, isOpen, onClose, onNavigate, onExpandChange, onThinking, onSpeaking, onSpeakingEnd }) {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { apiBaseUrl } = useConfig();
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [revealText, setRevealText] = useState("");
  const [revealFull, setRevealFull] = useState("");
  const [hasMemory, setHasMemory]   = useState(false);
  const [expanded, setExpanded]     = useState(false);
  const listRef    = useRef(null);
  const inputRef   = useRef(null);
  const revealRef  = useRef(null);
  const abortRef   = useRef(null);
  // Pending actions to attach to the message being revealed
  const pendingActionsRef = useRef(null);
  // Stable refs so reveal effect can call parent callbacks without re-triggering
  const onThinkingRef    = useRef(onThinking);
  const onSpeakingRef    = useRef(onSpeaking);
  const onSpeakingEndRef = useRef(onSpeakingEnd);
  useEffect(() => { onThinkingRef.current    = onThinking;    }, [onThinking]);
  useEffect(() => { onSpeakingRef.current    = onSpeaking;    }, [onSpeaking]);
  useEffect(() => { onSpeakingEndRef.current = onSpeakingEnd; }, [onSpeakingEnd]);

  const currentPage = PAGE_LABELS[location.pathname] || location.pathname;

  // Notify parent when expanded state changes (so it can hide the canvas)
  useEffect(() => {
    onExpandChange?.(expanded);
  }, [expanded, onExpandChange]);

  // Auto-scroll when messages update
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, revealText]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => () => {
    abortRef.current?.abort();
    clearTimeout(revealRef.current);
  }, []);

  // Character-by-character reveal
  useEffect(() => {
    if (!revealFull) return;
    clearTimeout(revealRef.current);
    let i = 0;
    setRevealText("");

    // Feed the full text to the side bubble on the companion panel
    onSpeakingRef.current?.(revealFull);

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
        setMessages((prev) => [...prev, finalMsg]);
        setRevealText("");
        setRevealFull("");
        engineRef.current?.stopLipSync();
        onSpeakingEndRef.current?.();
      }
    };

    const lipSyncDuration = revealFull.length * REVEAL_DELAY_MS + 400;
    engineRef.current?.startLipSync(lipSyncDuration);
    revealRef.current = setTimeout(charByChar, REVEAL_DELAY_MS);
  }, [revealFull, engineRef]);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const userMsg = { role: "user", text: text.trim() };
    const nextMessages = [...messages, userMsg].slice(-MAX_HISTORY);
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    onThinkingRef.current?.(true);

    const history = nextMessages.slice(-10).map((m) => ({
      role: m.role,
      content: m.text,
    }));

    try {
      const data = await postJson(
        buildApiUrl(apiBaseUrl, COMPANION_CHAT),
        {
          messages: history,
          context: {
            page: currentPage,
            isAuthenticated,
          },
        }
      );

      engineRef.current?.setEmotion(data.emotion || "neutral", 4000);

      if (data.hasMemory !== undefined) setHasMemory(data.hasMemory);

      // Collect all action types into a single array
      const actions = [];
      if (data.generation)  actions.push({ ...data.generation });
      if (data.navigation)  actions.push({ type: "navigate",       ...data.navigation });
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
      onThinkingRef.current?.(false);
      setLoading(false);
    }
  }, [loading, messages, currentPage, engineRef, apiBaseUrl, isAuthenticated]);

  const handleClearMemory = useCallback(async () => {
    if (!apiBaseUrl) return;
    try {
      await deleteJson(buildApiUrl(apiBaseUrl, COMPANION_MEMORY));
      setHasMemory(false);
    } catch {
      // silent
    }
  }, [apiBaseUrl]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleToggleExpand = () => setExpanded((v) => !v);

  if (!isOpen) return null;

  const panelStyle = expanded ? styles.panelExpanded : styles.panelDocked;

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerLabel}>Chat with Hiyori</span>
          {hasMemory && (
            <span style={styles.memoryBadge} title="Hiyori remembers you">
              remembers you
            </span>
          )}
        </div>
        <div style={styles.headerRight}>
          {hasMemory && (
            <button
              type="button"
              onClick={handleClearMemory}
              style={styles.clearMemBtn}
              title="Clear Hiyori's memory of you"
            >
              forget
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleExpand}
            style={styles.expandBtn}
            title={expanded ? "Collapse chat" : "Expand chat"}
            aria-label={expanded ? "Collapse chat" : "Expand chat"}
          >
            {expanded ? "⊡" : "⊞"}
          </button>
          <button type="button" onClick={onClose} style={styles.closeBtn} aria-label="Close chat">
            ✕
          </button>
        </div>
      </div>

      {/* Message list */}
      <div ref={listRef} style={styles.list}>
        {messages.length === 0 && !loading && (
          <p style={styles.empty}>Say something to Hiyori</p>
        )}
        {messages.map((m, i) => (
          <div key={i}>
            <div
              style={{
                ...styles.bubble,
                ...(m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant),
                ...(m.isError ? styles.bubbleError : {}),
              }}
            >
              {m.role === "assistant" && (
                <span style={styles.name}>Hiyori</span>
              )}
              <span>{m.text}</span>
            </div>
            {/* Render action cards after the assistant message */}
            {m.actions?.map((action, j) => (
              <div key={j} style={styles.actionWrapper}>
                <ActionCard action={action} onNavigate={onNavigate} />
              </div>
            ))}
          </div>
        ))}

        {/* Currently revealing assistant message */}
        {revealText && (
          <div style={{ ...styles.bubble, ...styles.bubbleAssistant }}>
            <span style={styles.name}>Hiyori</span>
            <span>{revealText}<span style={styles.cursor}>|</span></span>
          </div>
        )}

        {/* Loading indicator */}
        {loading && !revealText && (
          <div style={{ ...styles.bubble, ...styles.bubbleAssistant }}>
            <span style={styles.name}>Hiyori</span>
            <span style={styles.thinking}>thinking...</span>
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
          placeholder="Type a message..."
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
          Send
        </button>
      </div>
    </div>
  );
}

const sharedPanel = {
  background: "rgba(26, 23, 38, 0.97)",
  border: "1px solid rgba(192, 132, 252, 0.3)",
  borderRadius: 12,
  boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  zIndex: 950,
};

const styles = {
  panelDocked: {
    ...sharedPanel,
    position: "absolute",
    bottom: "calc(100% + 8px)",
    left: 0,
    right: 0,
    maxHeight: 420,
  },
  panelExpanded: {
    ...sharedPanel,
    position: "fixed",
    bottom: HUD_H + 12,
    right: 16,
    width: 420,
    height: 540,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    borderBottom: "1px solid rgba(192, 132, 252, 0.15)",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--skr-accent)",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  memoryBadge: {
    fontSize: 9,
    color: "var(--skr-text-secondary)",
    background: "rgba(192, 132, 252, 0.12)",
    border: "1px solid rgba(192, 132, 252, 0.2)",
    borderRadius: 4,
    padding: "1px 5px",
    fontStyle: "italic",
  },
  clearMemBtn: {
    background: "none",
    border: "1px solid rgba(255, 100, 100, 0.2)",
    borderRadius: 4,
    color: "rgba(255, 100, 100, 0.7)",
    cursor: "pointer",
    fontSize: 9,
    padding: "1px 5px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  expandBtn: {
    background: "none",
    border: "none",
    color: "var(--skr-text-muted)",
    cursor: "pointer",
    fontSize: 14,
    padding: "0 2px",
    lineHeight: 1,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--skr-text-muted)",
    cursor: "pointer",
    fontSize: 13,
    padding: "0 2px",
    lineHeight: 1,
  },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(192,132,252,0.2) transparent",
  },
  empty: {
    color: "var(--skr-text-muted)",
    fontSize: 12,
    textAlign: "center",
    marginTop: 12,
    fontStyle: "italic",
  },
  bubble: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "6px 10px",
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 1.5,
    maxWidth: "90%",
  },
  bubbleUser: {
    alignSelf: "flex-end",
    background: "rgba(255, 107, 157, 0.15)",
    border: "1px solid rgba(255, 107, 157, 0.25)",
    color: "var(--skr-text)",
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    background: "rgba(30, 24, 48, 0.8)",
    border: "1px solid rgba(192, 132, 252, 0.2)",
    color: "var(--skr-text)",
  },
  bubbleError: {
    opacity: 0.6,
    fontStyle: "italic",
  },
  name: {
    fontSize: 10,
    color: "var(--skr-accent)",
    fontWeight: 600,
    letterSpacing: "0.05em",
  },
  thinking: {
    color: "var(--skr-text-secondary)",
    fontStyle: "italic",
  },
  cursor: {
    animation: "skr-blink 1s step-end infinite",
    color: "var(--skr-accent)",
  },
  actionWrapper: {
    marginTop: 4,
    marginBottom: 4,
  },
  inputRow: {
    display: "flex",
    gap: 6,
    padding: "8px 10px",
    borderTop: "1px solid rgba(192, 132, 252, 0.15)",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: "rgba(13, 11, 20, 0.6)",
    border: "1px solid rgba(192, 132, 252, 0.25)",
    borderRadius: 6,
    padding: "5px 10px",
    color: "var(--skr-text)",
    fontSize: 12,
    outline: "none",
  },
  sendBtn: {
    background: "rgba(255, 107, 157, 0.2)",
    border: "1px solid rgba(255, 107, 157, 0.35)",
    borderRadius: 6,
    color: "var(--skr-accent)",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 12px",
    transition: "background 0.15s",
  },
};
