/**
 * StoryLoraSwitcher — character name chip + LoRA selector dropdown for the active session.
 * Rendered in the Story page header row when a character is bound to the session.
 */

export default function StoryLoraSwitcher({
  activeSessionId,
  sessionCharacterId,
  sessionLoraProfileId,
  sessionLoraProfiles,
  characterName,
  showLoraSwitcher,
  setShowLoraSwitcher,
  onSwitchLora,
  switchingLora,
}) {
  if (!activeSessionId || (!sessionCharacterId && !sessionLoraProfileId)) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 10,
        flexWrap: "wrap",
        position: "relative",
      }}
    >
      {sessionCharacterId && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: "var(--skr-elevated)",
            border: "1px solid var(--skr-border)",
            borderRadius: 6,
            padding: "3px 10px",
            fontSize: 12,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--skr-text-tertiary)",
              textTransform: "uppercase",
            }}
          >
            Character
          </span>
          <span style={{ color: "var(--skr-text-primary)", fontWeight: 600 }}>
            {characterName || sessionCharacterId}
          </span>
        </div>
      )}

      {/* LoRA switcher chip */}
      <div style={{ position: "relative" }}>
        <button
          className="skr-btn-secondary"
          style={{
            fontSize: 12,
            padding: "3px 10px",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
          onClick={() => setShowLoraSwitcher((prev) => !prev)}
          disabled={switchingLora || !sessionCharacterId}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--skr-text-tertiary)",
              textTransform: "uppercase",
            }}
          >
            LoRA
          </span>
          <span>
            {switchingLora
              ? "Switching…"
              : sessionLoraProfileId
                ? sessionLoraProfiles.find((p) => (p.id || p.characterId) === sessionLoraProfileId)
                    ?.name || "Custom"
                : "None"}
          </span>
          <span style={{ fontSize: 9 }}>▼</span>
        </button>

        {showLoraSwitcher && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              zIndex: 100,
              marginTop: 4,
              background: "var(--skr-elevated)",
              border: "1px solid var(--skr-border)",
              borderRadius: 8,
              padding: 8,
              minWidth: 200,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            <button
              className="skr-btn-secondary"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                fontSize: 12,
                padding: "6px 10px",
                marginBottom: 4,
                fontStyle: "italic",
              }}
              onClick={() => onSwitchLora(null)}
            >
              — No LoRA
            </button>
            {sessionLoraProfiles.map((p) => {
              const pid = p.id || p.characterId;
              const pname = p.name || p.displayName || pid;
              const isActive = sessionLoraProfileId === pid;
              return (
                <button
                  key={pid}
                  className="skr-btn-secondary"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    fontSize: 12,
                    padding: "6px 10px",
                    marginBottom: 2,
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? "var(--skr-accent, #d97706)" : "inherit",
                  }}
                  onClick={() => onSwitchLora(pid)}
                >
                  {pname}
                  {isActive ? " ✓" : ""}
                </button>
              );
            })}
            {sessionLoraProfiles.length === 0 && (
              <p
                style={{
                  fontSize: 11,
                  color: "var(--skr-text-tertiary)",
                  padding: "4px 10px",
                  margin: 0,
                }}
              >
                No LoRA profiles for this character.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
