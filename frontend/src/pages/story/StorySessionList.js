import React from 'react';

/**
 * StorySessionList — sidebar session selector.
 *
 * Props:
 *   sessions        – array of session objects from the API
 *   activeSessionId – currently selected session id
 *   onSelect        – (sessionId: string) => void
 */
export default function StorySessionList({ sessions, activeSessionId, onSelect }) {
  const sessionLabel = (s) => s.title || s.name || s.sessionId?.slice(0, 8) || 'Session';

  if (sessions.length === 0) return null;

  return (
    <select
      className="skr-input"
      style={{ width: 200 }}
      value={activeSessionId}
      onChange={e => onSelect(e.target.value)}
    >
      {sessions.map(s => (
        <option key={s.sessionId} value={s.sessionId}>{sessionLabel(s)}</option>
      ))}
    </select>
  );
}
