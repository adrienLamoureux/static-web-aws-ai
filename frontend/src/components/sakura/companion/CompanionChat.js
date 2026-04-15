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
import { styles } from "./companion-chat-styles";

const MAX_HISTORY = 20;
const REVEAL_DELAY_MS = 28; // ms per character

const PAGE_LABELS = {
  "/": "Realm (Home)",
  "/atelier": "Atelier (Image & Video Forge)",
  "/chronicle": "Chronicle (Story)",
  "/gallery": "Gallery",
  "/sanctum": "Sanctum (Director)",
};

export default function CompanionChat({
  engineRef,
  isOpen,
  onClose,
  onNavigate,
  onExpandChange,
  onThinking,
  onSpeaking,
  onSpeakingEnd,
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
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const revealRef = useRef(null);
  const abortRef = useRef(null);
  // Pending actions to attach to the message being revealed
  const pendingActionsRef = useRef(null);
  // Stable refs so reveal effect can call parent callbacks without re-triggering
  const onThinkingRef = useRef(onThinking);
  const onSpeakingRef = useRef(onSpeaking);
  const onSpeakingEndRef = useRef(onSpeakingEnd);
  useEffect(() => {
    onThinkingRef.current = onThinking;
  }, [onThinking]);
  useEffect(() => {
    onSpeakingRef.current = onSpeaking;
  }, [onSpeaking]);
  useEffect(() => {
    onSpeakingEndRef.current = onSpeakingEnd;
  }, [onSpeakingEnd]);

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
  useEffect(
    () => () => {
      abortRef.current?.abort();
      clearTimeout(revealRef.current);
    },
    []
  );

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

  const sendMessage = useCallback(
    async (text) => {
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
        const data = await postJson(buildApiUrl(apiBaseUrl, COMPANION_CHAT), {
          messages: history,
          context: {
            page: currentPage,
            isAuthenticated,
          },
        });

        engineRef.current?.setEmotion(data.emotion || "neutral", 4000);

        if (data.hasMemory !== undefined) setHasMemory(data.hasMemory);

        // Collect all action types into a single array
        const actions = [];
        if (data.generation) actions.push({ ...data.generation });
        if (data.navigation) actions.push({ type: "navigate", ...data.navigation });
        if (data.promptSuggestion) actions.push({ ...data.promptSuggestion });
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
    },
    [loading, messages, currentPage, engineRef, apiBaseUrl, isAuthenticated]
  );

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
        {messages.length === 0 && !loading && <p style={styles.empty}>Say something to Hiyori</p>}
        {messages.map((m, i) => (
          <div key={i}>
            <div
              style={{
                ...styles.bubble,
                ...(m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant),
                ...(m.isError ? styles.bubbleError : {}),
              }}
            >
              {m.role === "assistant" && <span style={styles.name}>Hiyori</span>}
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
            <span>
              {revealText}
              <span style={styles.cursor}>|</span>
            </span>
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
