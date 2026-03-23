import React, { useCallback, useEffect, useState } from "react";
import { listCharacters } from "../../services/characters";
import { listLoraProfilesForCharacter } from "../../services/lora";

/**
 * CharacterLoraSelector
 *
 * Cascading two-row selector:
 *   Row 1 — Character (fetched from /characters)
 *   Row 2 — LoRA Profile (fetched from /lora/profiles?characterId=xxx, hidden when no character)
 *
 * Props:
 *   apiBaseUrl        string
 *   characterId       string|null        (controlled)
 *   loraProfileId     string|null        (controlled)
 *   onCharacterChange (id: string) => void
 *   onLoraChange      (id: string|null) => void
 *   disabled          bool
 *   compact           bool — use smaller font / tighter spacing
 */
export default function CharacterLoraSelector({
  apiBaseUrl,
  characterId,
  loraProfileId,
  onCharacterChange,
  onLoraChange,
  disabled = false,
  compact = false,
}) {
  const [characters, setCharacters] = useState([]);
  const [loraProfiles, setLoraProfiles] = useState([]);
  const [loadingChars, setLoadingChars] = useState(false);
  const [loadingLoras, setLoadingLoras] = useState(false);

  // Load character catalog on mount
  useEffect(() => {
    if (!apiBaseUrl) return;
    setLoadingChars(true);
    listCharacters(apiBaseUrl)
      .then((data) => setCharacters(data?.characters || []))
      .catch(() => setCharacters([]))
      .finally(() => setLoadingChars(false));
  }, [apiBaseUrl]);

  // Reload LoRA profiles whenever selected character changes
  useEffect(() => {
    if (!apiBaseUrl || !characterId) {
      setLoraProfiles([]);
      return;
    }
    setLoadingLoras(true);
    listLoraProfilesForCharacter(apiBaseUrl, characterId)
      .then((data) => setLoraProfiles(data?.items || []))
      .catch(() => setLoraProfiles([]))
      .finally(() => setLoadingLoras(false));
  }, [apiBaseUrl, characterId]);

  const handleCharacterChange = useCallback(
    (e) => {
      const newCharId = e.target.value || null;
      onCharacterChange(newCharId);
      // Auto-select the character's default LoRA profile
      const char = characters.find((c) => c.id === newCharId);
      onLoraChange(char?.defaultLoraProfileId || null);
    },
    [characters, onCharacterChange, onLoraChange]
  );

  const handleLoraChange = useCallback(
    (e) => {
      onLoraChange(e.target.value || null);
    },
    [onLoraChange]
  );

  const fs = compact ? 11 : 12;
  const labelStyle = {
    fontSize: fs,
    fontWeight: 600,
    color: "var(--skr-text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: compact ? 3 : 4,
  };
  const selectStyle = { fontSize: fs, width: "100%" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 12 }}>
      {/* Character row */}
      <div>
        <div style={labelStyle}>Character</div>
        <select
          className="skr-input skr-field-select"
          style={selectStyle}
          value={characterId || ""}
          onChange={handleCharacterChange}
          disabled={disabled || loadingChars}
        >
          <option value="">— None —</option>
          {characters.map((char) => (
            <option key={char.id} value={char.id}>
              {char.name}
              {char.source === "system" ? " (system)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* LoRA Profile row — only shown when a character is selected */}
      {characterId && (
        <div>
          <div style={labelStyle}>
            LoRA Profile{" "}
            <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
              (optional)
            </span>
          </div>
          <select
            className="skr-input skr-field-select"
            style={selectStyle}
            value={loraProfileId || ""}
            onChange={handleLoraChange}
            disabled={disabled || loadingLoras}
          >
            <option value="">— No LoRA —</option>
            {loraProfiles.map((p) => {
              const char = characters.find((c) => c.id === characterId);
              const isDefault = char?.defaultLoraProfileId === p.id;
              return (
                <option key={p.id} value={p.id}>
                  {p.name || p.displayName || p.id}
                  {isDefault ? " (default)" : ""}
                </option>
              );
            })}
          </select>
        </div>
      )}
    </div>
  );
}
