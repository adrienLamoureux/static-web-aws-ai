/**
 * StoryPresetPicker — modal-like panel for choosing a story preset before
 * creating a new session. Rendered inline in the Story page when showPresetPicker is true.
 */

export default function StoryPresetPicker({
  presets,
  selectedPresetId,
  setSelectedPresetId,
  companionHint,
  sessions,
  creatingSession,
  onCreateSession,
  onCancel,
}) {
  return (
    <div
      style={{
        background: "var(--skr-elevated)",
        border: "1px solid var(--skr-border)",
        borderRadius: 12,
        padding: 24,
        marginBottom: 16,
      }}
    >
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Choose a Story Preset</h3>

      {companionHint && (
        <div
          style={{
            background: "rgba(96, 165, 250, 0.08)",
            border: "1px solid rgba(96, 165, 250, 0.25)",
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 12,
            fontSize: 12,
            color: "rgba(96, 165, 250, 0.9)",
          }}
        >
          <strong>Hiyori suggests:</strong>
          {companionHint.title && ` "${companionHint.title}"`}
          {companionHint.genre && ` — ${companionHint.genre}`}
        </div>
      )}

      <p style={{ fontSize: 12, color: "var(--skr-text-tertiary)", marginBottom: 16 }}>
        Select the narrative universe for your new session.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {presets.map((p) => (
          <label
            key={p.id}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              cursor: "pointer",
              background:
                selectedPresetId === p.id
                  ? "var(--skr-accent-muted, rgba(217,119,6,0.1))"
                  : "transparent",
              border: `1px solid ${selectedPresetId === p.id ? "var(--skr-accent, #d97706)" : "var(--skr-border)"}`,
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            <input
              type="radio"
              name="preset"
              value={p.id}
              checked={selectedPresetId === p.id}
              onChange={() => setSelectedPresetId(p.id)}
              style={{ marginTop: 2 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
              {p.synopsis && (
                <div style={{ fontSize: 11, color: "var(--skr-text-tertiary)", marginTop: 2 }}>
                  {p.synopsis}
                </div>
              )}
              {p.protagonistName && (
                <div style={{ fontSize: 11, color: "var(--skr-text-secondary)", marginTop: 2 }}>
                  Protagonist: {p.protagonistName}
                </div>
              )}
            </div>
          </label>
        ))}
        {presets.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--skr-text-tertiary)" }}>No presets available.</p>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="skr-btn-primary"
          onClick={onCreateSession}
          disabled={!selectedPresetId || creatingSession}
        >
          {creatingSession ? "Starting…" : "Start Session"}
        </button>
        {sessions.length > 0 && (
          <button className="skr-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
