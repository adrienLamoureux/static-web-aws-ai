/**
 * MusicCard — companion action card for music generation.
 * Navigates to /chronicle with mood and description as query params
 * so the user can apply them to a scene's music generation.
 */

import { useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";

export default function MusicCard({ musicAction, onNavigate }) {
  const { isAuthenticated } = useAuth();
  const [mood, setMood] = useState(musicAction?.mood || "");
  const [description, setDescription] = useState(musicAction?.description || "");
  const [navigated, setNavigated] = useState(false);

  const handleOpen = () => {
    if (navigated || !onNavigate) return;
    const params = new URLSearchParams();
    if (mood.trim()) params.set("companionMusicMood", mood.trim());
    if (description.trim()) params.set("companionMusicDesc", description.trim());
    const query = params.toString();
    onNavigate(`/chronicle${query ? `?${query}` : ""}`);
    setNavigated(true);
  };

  return (
    <div style={styles.card}>
      <div style={styles.label}>Music Generation</div>

      <input
        type="text"
        value={mood}
        onChange={(e) => setMood(e.target.value)}
        placeholder="Mood (e.g. peaceful, epic)..."
        style={styles.field}
        disabled={navigated}
        maxLength={40}
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description..."
        style={styles.field}
        disabled={navigated}
        maxLength={120}
      />

      {!isAuthenticated ? (
        <p style={styles.authHint}>Log in to generate music</p>
      ) : navigated ? (
        <span style={styles.done}>Opening Chronicle ✓</span>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          style={styles.generateBtn}
          disabled={!mood.trim()}
        >
          Open in Chronicle →
        </button>
      )}
    </div>
  );
}

const styles = {
  card: {
    background: "rgba(251, 191, 36, 0.07)",
    border: "1px solid rgba(251, 191, 36, 0.25)",
    borderRadius: 8,
    padding: "8px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "rgba(251, 191, 36, 0.9)",
    opacity: 0.8,
  },
  field: {
    background: "var(--skr-comp-input-bg)",
    border: "1px solid rgba(251, 191, 36, 0.2)",
    borderRadius: 6,
    padding: "5px 8px",
    color: "var(--skr-text)",
    fontSize: 11,
    outline: "none",
    fontFamily: "inherit",
  },
  generateBtn: {
    alignSelf: "flex-start",
    background: "rgba(251, 191, 36, 0.12)",
    border: "1px solid rgba(251, 191, 36, 0.35)",
    borderRadius: 6,
    color: "rgba(251, 191, 36, 1)",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
    padding: "4px 14px",
    transition: "background 0.15s",
  },
  authHint: {
    fontSize: 11,
    color: "var(--skr-text-muted)",
    fontStyle: "italic",
    margin: 0,
  },
  done: {
    fontSize: 11,
    color: "rgba(251, 191, 36, 0.5)",
    fontStyle: "italic",
  },
};
