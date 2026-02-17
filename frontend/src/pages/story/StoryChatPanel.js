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

  return (
    <div className="story-book-column story-book-text">
      <div className="story-chat-header">
        <div>
          <h2 className="story-section-title">{activeSession?.title || "Story"}</h2>
          {activeSession?.synopsis && (
            <p className="story-chat-subtitle">{activeSession.synopsis}</p>
          )}
          <p className="story-chat-mode">
            {isDirectorMode ? "Director mode" : "Reader mode"}
          </p>
        </div>
        <span className="story-chat-meta">
          {activeSession ? `${activeTurnCount} turns` : "No session"}
        </span>
      </div>

      <div
        className={`story-chat-thread ${isDirectorMode ? "" : "story-chat-thread--reader"}`}
        ref={chatThreadRef}
      >
        {isLoadingSession && <p className="story-empty">Loading session...</p>}

        {!isLoadingSession && messages.length === 0 && (
          <p className="story-empty">Start by choosing a preset and begin chatting.</p>
        )}

        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`story-message story-message--${message.role} ${
              isDirectorMode ? "" : "story-message--reader"
            }`}
          >
            <div className="story-message-bubble">{message.content}</div>
          </div>
        ))}

        {status === "sending" && activeSessionId && (
          <div
            className={`story-message story-message--assistant ${
              isDirectorMode ? "" : "story-message--reader"
            }`}
          >
            <div className="story-message-bubble story-message-bubble--pending">
              Narrator is writing the next beat...
            </div>
          </div>
        )}
      </div>

      <div className="story-chat-input">
        <label className="story-scenes-label" htmlFor="story-next-action">
          Next action
        </label>
        <textarea
          id="story-next-action"
          className="field-textarea"
          placeholder={
            activeSession ? "Describe what you do next..." : "Select a session to begin..."
          }
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={!activeSessionId || status === "sending"}
          rows={isDirectorMode ? 3 : 4}
        />
        <div className="story-chat-actions">
          <div className="story-chat-action-buttons">
            {isDirectorMode && (
              <button
                type="button"
                className="story-chat-force-illustration"
                onClick={handleForceIllustration}
                disabled={!activeSessionId || status === "sending" || isForcingIllustration}
                title="Generate an illustration from current context"
                aria-label="Generate an illustration from current context"
              >
                {isForcingIllustration ? "Rendering..." : "Illustrate now"}
              </button>
            )}
            <button
              type="button"
              className="btn-accent px-6 py-2 text-sm"
              onClick={handleSendMessage}
              disabled={!input.trim() || status === "sending"}
            >
              {status === "sending"
                ? "Sending..."
                : isDirectorMode
                  ? "Send"
                  : "Continue story"}
            </button>
          </div>
          <span className="story-chat-hint">
            {isDirectorMode
              ? "Auto scenes every ~2 turns. Use Illustrate now to force from current context."
              : "Switch to Director mode for manual scene controls, context tuning, and debug tools."}
          </span>
        </div>
      </div>

      {isDirectorMode && (
        <StorySessionDebugPanel
          activeSessionDetail={activeSessionDetail}
          storyDebugEnabled={storyDebugEnabled}
          setStoryDebugEnabled={setStoryDebugEnabled}
          storyDebugView={storyDebugView}
          setStoryDebugView={setStoryDebugView}
        />
      )}
    </div>
  );
}

export default StoryChatPanel;
