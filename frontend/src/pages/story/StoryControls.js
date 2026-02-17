import React from "react";

function DirectorControls({
  sessions,
  activeSessionId,
  selectedPresetId,
  presets,
  status,
  refreshSessions,
  handleSelectSession,
  handleDeleteSession,
  setSelectedPresetId,
  handleCreateSession,
}) {
  return (
    <div className="story-config glass-panel">
      <div className="story-config-section">
        <div className="story-config-header">
          <h2 className="story-section-title">Sessions</h2>
          <button
            type="button"
            className="btn-ghost px-4 py-1 text-xs"
            onClick={refreshSessions}
          >
            Refresh
          </button>
        </div>
        <div className="story-session-list">
          {sessions.length === 0 && <p className="story-empty">No sessions yet.</p>}
          {sessions.map((session) => (
            <div key={session.id} className="story-session-row">
              <button
                type="button"
                className={`story-session-item ${
                  session.id === activeSessionId ? "is-active" : ""
                }`}
                onClick={() => handleSelectSession(session.id)}
              >
                <span className="story-session-title">{session.title}</span>
                <span className="story-session-meta">
                  {session.turnCount} turns · {session.sceneCount} scenes
                </span>
              </button>
              <button
                type="button"
                className="story-session-delete"
                onClick={() => handleDeleteSession(session)}
                aria-label={`Delete ${session.title}`}
                title="Delete session"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="story-config-divider" />

      <div className="story-config-section">
        <div className="story-config-header">
          <h2 className="story-section-title">Scenario presets</h2>
        </div>
        <div className="story-preset-grid">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`story-preset-card ${
                preset.id === selectedPresetId ? "is-selected" : ""
              }`}
              onClick={() => setSelectedPresetId(preset.id)}
            >
              <p className="story-preset-title">{preset.name}</p>
              <p className="story-preset-copy">{preset.synopsis}</p>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn-primary mt-4 w-full py-2 text-sm"
          onClick={handleCreateSession}
          disabled={status === "creating"}
        >
          {status === "creating" ? "Creating..." : "Start new story"}
        </button>
      </div>
    </div>
  );
}

function ReaderControls({
  sessions,
  activeSessionId,
  selectedPresetId,
  presets,
  status,
  refreshSessions,
  handleSelectSession,
  setSelectedPresetId,
  handleCreateSession,
}) {
  return (
    <div className="story-reader-controls glass-panel">
      <div className="story-reader-control">
        <label className="story-scenes-label" htmlFor="story-reader-session">
          Session
        </label>
        <select
          id="story-reader-session"
          className="field-select"
          value={activeSessionId}
          onChange={(event) => handleSelectSession(event.target.value)}
        >
          <option value="">Select a session</option>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.title} ({session.turnCount} turns)
            </option>
          ))}
        </select>
      </div>

      <div className="story-reader-control">
        <label className="story-scenes-label" htmlFor="story-reader-preset">
          Start from preset
        </label>
        <select
          id="story-reader-preset"
          className="field-select"
          value={selectedPresetId}
          onChange={(event) => setSelectedPresetId(event.target.value)}
        >
          {presets.length === 0 && <option value="">No presets available</option>}
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </div>

      <div className="story-reader-actions">
        <button
          type="button"
          className="btn-ghost px-4 py-2 text-xs"
          onClick={refreshSessions}
        >
          Refresh sessions
        </button>
        <button
          type="button"
          className="btn-primary px-5 py-2 text-sm"
          onClick={handleCreateSession}
          disabled={status === "creating"}
        >
          {status === "creating" ? "Creating..." : "Start new story"}
        </button>
      </div>
    </div>
  );
}

function StoryControls({ isDirectorMode, ...props }) {
  if (isDirectorMode) {
    return <DirectorControls {...props} />;
  }

  return <ReaderControls {...props} />;
}

export default StoryControls;
