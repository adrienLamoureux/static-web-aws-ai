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
    <section
      className="story-v3-rail-shell story-v3-rail-shell--director"
      aria-label="Director story setup"
    >
      <section className="story-v3-rail-section story-v3-rail-section--sessions">
        <div className="story-v3-rail-head">
          <h2 className="story-v3-section-title">Sessions</h2>
          <button
            type="button"
            className="story-v3-btn story-v3-btn--ghost story-v3-btn--small"
            onClick={refreshSessions}
          >
            Refresh
          </button>
        </div>
        <div className="story-v3-session-list">
          {sessions.length === 0 && <p className="story-v3-empty">No sessions yet.</p>}
          {sessions.map((session) => (
            <div key={session.id} className="story-v3-session-row">
              <button
                type="button"
                className={`story-v3-session-item ${
                  session.id === activeSessionId ? "is-active" : ""
                }`}
                onClick={() => handleSelectSession(session.id)}
              >
                <span className="story-v3-session-title">{session.title}</span>
                <span className="story-v3-session-meta">
                  {session.turnCount} turns · {session.sceneCount} scenes
                </span>
              </button>
              <button
                type="button"
                className="story-v3-btn story-v3-btn--text"
                onClick={() => handleDeleteSession(session)}
                aria-label={`Delete ${session.title}`}
                title="Delete session"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="story-v3-rail-section story-v3-rail-section--presets">
        <div className="story-v3-rail-head">
          <h2 className="story-v3-section-title">Scenario presets</h2>
        </div>
        <div className="story-v3-preset-grid">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`story-v3-preset-card ${
                preset.id === selectedPresetId ? "is-selected" : ""
              }`}
              onClick={() => setSelectedPresetId(preset.id)}
            >
              <p className="story-v3-preset-title">{preset.name}</p>
              <p className="story-v3-preset-copy">{preset.synopsis}</p>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="story-v3-btn story-v3-btn--primary"
          onClick={handleCreateSession}
          disabled={status === "creating"}
        >
          {status === "creating" ? "Creating..." : "Start new story"}
        </button>
      </section>
    </section>
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
    <section
      className="story-v3-rail-shell story-v3-rail-shell--reader"
      aria-label="Reader story setup"
    >
      <div className="story-v3-rail-section story-v3-rail-section--reader">
        <div className="story-v3-field">
          <label className="story-v3-label" htmlFor="story-reader-session">
            Session
          </label>
          <select
            id="story-reader-session"
            className="story-v3-select"
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

        <div className="story-v3-field">
          <label className="story-v3-label" htmlFor="story-reader-preset">
            Start from preset
          </label>
          <select
            id="story-reader-preset"
            className="story-v3-select"
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
      </div>

      <div className="story-v3-rail-actions">
        <button
          type="button"
          className="story-v3-btn story-v3-btn--ghost"
          onClick={refreshSessions}
        >
          Refresh sessions
        </button>
        <button
          type="button"
          className="story-v3-btn story-v3-btn--primary"
          onClick={handleCreateSession}
          disabled={status === "creating"}
        >
          {status === "creating" ? "Creating..." : "Start new story"}
        </button>
      </div>
    </section>
  );
}

function StoryControls({ isDirectorMode, ...props }) {
  if (isDirectorMode) {
    return <DirectorControls {...props} />;
  }

  return <ReaderControls {...props} />;
}

export default StoryControls;
