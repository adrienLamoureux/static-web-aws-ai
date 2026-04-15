import React, { useState, useEffect } from "react";
import {
  listCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter,
} from "../../../services/characters";
import { emptyCharForm, charToForm } from "./character-form-utils";
import CharacterForm from "./CharacterForm";
import CharacterDetail from "./CharacterDetail";

/**
 * CharactersSection — Character identity CRUD.
 * Props: { apiBaseUrl, imageModels, videoModels }
 */
export default function CharactersSection({ apiBaseUrl, imageModels = [], videoModels = [] }) {
  const [characters, setCharacters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [expandedCharId, setExpandedCharId] = useState(null);
  const [charForm, setCharForm] = useState(null);
  const [savingChar, setSavingChar] = useState(false);
  const [deletingCharId, setDeletingCharId] = useState("");

  const setMsg = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 4000);
  };

  useEffect(() => {
    if (!apiBaseUrl) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    listCharacters(apiBaseUrl)
      .then((data) => setCharacters(data?.characters || []))
      .catch((e) => setError(e?.message || "Failed to load characters."))
      .finally(() => setIsLoading(false));
  }, [apiBaseUrl]);

  const handleToggleExpand = (charId) =>
    setExpandedCharId((prev) => (prev === charId ? null : charId));
  const handleStartAddChar = () => {
    setCharForm(emptyCharForm());
    setExpandedCharId(null);
  };
  const handleStartEditChar = (char) => {
    setCharForm(charToForm(char));
    setExpandedCharId(char.id);
  };
  const handleCancelCharForm = () => setCharForm(null);
  const handleCharFormChange = (field, value) =>
    setCharForm((prev) => ({ ...prev, [field]: value }));

  const handleSaveChar = async () => {
    if (!charForm?.name?.trim()) {
      setError("Character name is required.");
      return;
    }
    setSavingChar(true);
    setError("");
    const { _id, ...payload } = charForm;
    try {
      if (!_id) {
        const data = await createCharacter(apiBaseUrl, payload);
        const newChar = data?.character || data;
        setCharacters((prev) => [...prev, newChar]);
        setExpandedCharId(newChar.id);
        setMsg(`Character "${newChar.name}" created.`);
      } else {
        const data = await updateCharacter(apiBaseUrl, _id, payload);
        const updated = data?.character || data;
        setCharacters((prev) => prev.map((c) => (c.id === _id ? updated : c)));
        setMsg(`Character "${updated.name}" updated.`);
      }
      setCharForm(null);
    } catch (e) {
      setError(e?.message || "Failed to save character.");
    } finally {
      setSavingChar(false);
    }
  };

  const handleDeleteChar = async (char) => {
    if (!window.confirm(`Delete character "${char.name}"? This cannot be undone.`)) return;
    setDeletingCharId(char.id);
    setError("");
    try {
      await deleteCharacter(apiBaseUrl, char.id);
      setCharacters((prev) => prev.filter((c) => c.id !== char.id));
      if (expandedCharId === char.id) setExpandedCharId(null);
      setMsg(`Character "${char.name}" deleted.`);
    } catch (e) {
      setError(e?.message || "Failed to delete character.");
    } finally {
      setDeletingCharId("");
    }
  };

  const systemChars = characters.filter((c) => c.source === "system");
  const userChars = characters.filter((c) => c.source !== "system");

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <h3
            style={{ fontSize: 15, fontWeight: 700, color: "var(--skr-text-primary)", margin: 0 }}
          >
            Characters
          </h3>
          <p style={{ fontSize: 12, color: "var(--skr-text-tertiary)", margin: "3px 0 0" }}>
            Character identities — name, visual traits, and default generation models.
          </p>
        </div>
        {!charForm && (
          <button
            className="skr-btn-secondary"
            style={{ fontSize: 12, whiteSpace: "nowrap" }}
            onClick={handleStartAddChar}
          >
            + New Character
          </button>
        )}
      </div>
      {message && (
        <p
          style={{
            fontSize: 12,
            color: "var(--skr-accent)",
            background: "var(--skr-accent-subtle, rgba(217,119,6,0.1))",
            padding: "6px 10px",
            borderRadius: 6,
            marginBottom: 10,
          }}
        >
          {message}
        </p>
      )}
      {error && (
        <p
          style={{
            fontSize: 12,
            color: "#ef4444",
            background: "#fef2f2",
            padding: "6px 10px",
            borderRadius: 6,
            marginBottom: 10,
          }}
        >
          {error}
        </p>
      )}
      {charForm && charForm._id === null && (
        <CharacterForm
          charForm={charForm}
          onFieldChange={handleCharFormChange}
          onSave={handleSaveChar}
          onCancel={handleCancelCharForm}
          saving={savingChar}
          imageModels={imageModels}
          videoModels={videoModels}
        />
      )}
      {isLoading ? (
        <p style={{ fontSize: 12, color: "var(--skr-text-tertiary)" }}>Loading characters…</p>
      ) : (
        <>
          {systemChars.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--skr-text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 8,
                }}
              >
                System Characters
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {systemChars.map((char) => {
                  const isExpanded = expandedCharId === char.id;
                  return (
                    <div key={char.id} className="skr-card" style={{ padding: 16 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          cursor: "pointer",
                        }}
                        onClick={() => handleToggleExpand(char.id)}
                      >
                        <div style={{ flex: 1 }}>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "var(--skr-text-primary)",
                            }}
                          >
                            {char.name}
                          </span>
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 10,
                              color: "var(--skr-text-tertiary)",
                              background: "var(--skr-elevated)",
                              border: "1px solid var(--skr-border)",
                              borderRadius: 4,
                              padding: "1px 5px",
                            }}
                          >
                            system
                          </span>
                          {char.signatureTraits && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 11,
                                color: "var(--skr-text-tertiary)",
                              }}
                            >
                              {char.signatureTraits}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 12, color: "var(--skr-text-tertiary)" }}>
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>
                      {isExpanded && <CharacterDetail char={char} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {userChars.length > 0 && (
            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--skr-text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 8,
                }}
              >
                My Characters
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {userChars.map((char) => {
                  const isExpanded = expandedCharId === char.id;
                  const isEditingThis = charForm?._id === char.id;
                  const isDeleting = deletingCharId === char.id;
                  return (
                    <div key={char.id} className="skr-card" style={{ padding: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{ flex: 1, cursor: "pointer" }}
                          onClick={() => handleToggleExpand(char.id)}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "var(--skr-text-primary)",
                            }}
                          >
                            {char.name}
                          </span>
                          {char.signatureTraits && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 11,
                                color: "var(--skr-text-tertiary)",
                              }}
                            >
                              {char.signatureTraits}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            className="skr-btn-secondary"
                            style={{ fontSize: 11 }}
                            onClick={() => handleStartEditChar(char)}
                            disabled={isDeleting}
                          >
                            Edit
                          </button>
                          <button
                            className="skr-btn-secondary"
                            style={{ fontSize: 11, color: "#ef4444" }}
                            onClick={() => handleDeleteChar(char)}
                            disabled={isDeleting || deletingCharId !== ""}
                          >
                            {isDeleting ? "…" : "Delete"}
                          </button>
                          <span
                            style={{
                              fontSize: 12,
                              color: "var(--skr-text-tertiary)",
                              cursor: "pointer",
                              padding: "0 4px",
                            }}
                            onClick={() => handleToggleExpand(char.id)}
                          >
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        </div>
                      </div>
                      {isEditingThis && (
                        <CharacterForm
                          charForm={charForm}
                          onFieldChange={handleCharFormChange}
                          onSave={handleSaveChar}
                          onCancel={handleCancelCharForm}
                          saving={savingChar}
                          imageModels={imageModels}
                          videoModels={videoModels}
                        />
                      )}
                      {isExpanded && !isEditingThis && <CharacterDetail char={char} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {characters.length === 0 && !charForm && (
            <div
              className="skr-card"
              style={{
                padding: "24px 20px",
                textAlign: "center",
                color: "var(--skr-text-tertiary)",
                fontSize: 13,
              }}
            >
              No characters yet. Create your first character to get started.
            </div>
          )}
        </>
      )}
    </div>
  );
}
