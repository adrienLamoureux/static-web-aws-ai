import React from "react";

/**
 * StoryComposer — message input area at the bottom of the Story page.
 *
 * Props:
 *   input           – controlled string value of the textarea
 *   onInputChange   – (value: string) => void  — called on every keystroke
 *   onSend          – () => void  — called when the user submits
 *   isLoading       – bool  — true while a session is being loaded
 *   isSending       – bool  — true while a message round-trip is in flight
 *   activeSessionId – string | '' — empty when no session is active
 */
export default function StoryComposer({
  input,
  onInputChange,
  onSend,
  isLoading,
  isSending,
  activeSessionId,
}) {
  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <textarea
        className="skr-input"
        style={{ flex: 1, resize: "none", minHeight: 42 }}
        rows={2}
        placeholder={activeSessionId ? "What do you do or say?" : "Loading session…"}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={handleKey}
        disabled={isSending || isLoading || !activeSessionId}
      />
      <button
        className="skr-btn-primary"
        onClick={onSend}
        disabled={isSending || !input.trim() || isLoading || !activeSessionId}
        style={{ alignSelf: "flex-end" }}
      >
        Send
      </button>
    </div>
  );
}
