import React, { useEffect, useRef } from "react";
import { StorySessionDebugPanel } from "./StoryDebugPanel";

function StoryChatPanel({
  isDirectorMode,
  activeSession,
  activeTurnCount,
  isLoadingSession,
  messages,
  status,
  activeSessionId,
  input,
  setInput,
  handleSendMessage,
  handleForceIllustration,
  isForcingIllustration,
  activeSessionDetail,
  storyDebugEnabled,
  setStoryDebugEnabled,
  storyDebugView,
  setStoryDebugView,
}) {
  const chatThreadRef = useRef(null);

  useEffect(() => {
    const threadNode = chatThreadRef.current;
    if (!threadNode) return;
    threadNode.scrollTop = threadNode.scrollHeight;
  }, [messages, status, activeSessionId, isLoadingSession]);

  const canSend =
    Boolean(activeSessionId) && Boolean(input.trim()) && status !== "sending";
  const handleComposerKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent?.isComposing) {
      return;
    }
    if (!canSend) return;
    event.preventDefault();
    handleSendMessage();
  };

  return (
    <article className="story-v3-chat-shell">
      <header className="story-v3-chat-header">
        <div>
          <h2 className="story-v3-section-title">{activeSession?.title || "Story session"}</h2>
          {activeSession?.synopsis && (
            <p className="story-v3-chat-subtitle">{activeSession.synopsis}</p>
          )}
        </div>
        <span className="story-v3-chat-meta">
          {activeSession ? `${activeTurnCount} turns` : "No session"}
        </span>
      </header>

      <section className="story-v3-chat-thread-surface">
        <div
          className="story-v3-chat-thread"
          ref={chatThreadRef}
        >
          {isLoadingSession && <p className="story-v3-empty">Loading session...</p>}

          {!isLoadingSession && messages.length === 0 && (
            <p className="story-v3-empty">Start by choosing a preset and begin chatting.</p>
          )}

          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`story-v3-chat-message story-v3-chat-message--${
                message.role === "user" ? "user" : "assistant"
              }`}
            >
              <div className="story-v3-chat-bubble">{message.content}</div>
            </div>
          ))}

          {status === "sending" && activeSessionId && (
            <div className="story-v3-chat-message story-v3-chat-message--assistant">
              <div className="story-v3-chat-bubble story-v3-chat-bubble--pending">
                Typing...
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="story-v3-composer">
        <div className="story-v3-compose-input">
          <div className="story-v3-compose-textfield">
            <textarea
              id="story-next-action"
              className="story-v3-textarea"
              placeholder={
                activeSession ? "Write your message..." : "Select a session to begin..."
              }
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              disabled={!activeSessionId || status === "sending"}
              rows={isDirectorMode ? 3 : 4}
            />
            <button
              type="button"
              className="story-v3-text-send"
              onClick={handleSendMessage}
              disabled={!canSend}
              aria-label={status === "sending" ? "Sending message" : "Send message"}
              title={status === "sending" ? "Sending..." : "Send"}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M3 11.5L20 3l-4.6 18-4.8-6-7.6-3.5zm8 2.6l3 3.8 2.3-9-8.5 4.2 3.2 1z" />
              </svg>
            </button>
          </div>
          {isDirectorMode && (
            <div className="story-v3-compose-actions">
              <div className="story-v3-compose-buttons">
                <button
                  type="button"
                  className="story-v3-btn story-v3-btn--ghost"
                  onClick={handleForceIllustration}
                  disabled={!activeSessionId || status === "sending" || isForcingIllustration}
                  title="Generate an illustration from current context"
                  aria-label="Generate an illustration from current context"
                >
                  {isForcingIllustration ? "Rendering..." : "Illustrate now"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {isDirectorMode && (
        <section className="story-v3-chat-debug">
          <StorySessionDebugPanel
            activeSessionDetail={activeSessionDetail}
            storyDebugEnabled={storyDebugEnabled}
            setStoryDebugEnabled={setStoryDebugEnabled}
            storyDebugView={storyDebugView}
            setStoryDebugView={setStoryDebugView}
          />
        </section>
      )}
    </article>
  );
}

export default StoryChatPanel;
