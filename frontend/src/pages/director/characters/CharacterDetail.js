import React from "react";

/**
 * CharacterDetail — read-only expanded view of a character.
 * Props: { char }
 */
export default function CharacterDetail({ char }) {
  const attrs = [
    { label: "Signature Traits", value: char.signatureTraits },
    { label: "Eye Details", value: char.eyeDetails },
    { label: "Hair Details", value: char.hairDetails },
    { label: "Outfit / Materials", value: char.outfitMaterials },
    { label: "Accessories", value: char.accessories },
    { label: "Style Reference", value: char.styleReference },
  ].filter((a) => a.value);

  const hasDefaults =
    char.defaultImageModel ||
    char.defaultImagePrompt ||
    char.defaultVideoModel ||
    char.defaultVideoPrompt;

  return (
    <div style={{ borderTop: "1px solid var(--skr-border)", marginTop: 12, paddingTop: 12 }}>
      {hasDefaults && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          {char.defaultImageModel && (
            <div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--skr-text-tertiary)",
                  textTransform: "uppercase",
                }}
              >
                Image model
              </span>
              <p style={{ fontSize: 12, margin: "2px 0 0", color: "var(--skr-text-secondary)" }}>
                {char.defaultImageModel}
              </p>
            </div>
          )}
          {char.defaultVideoModel && (
            <div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--skr-text-tertiary)",
                  textTransform: "uppercase",
                }}
              >
                Video model
              </span>
              <p style={{ fontSize: 12, margin: "2px 0 0", color: "var(--skr-text-secondary)" }}>
                {char.defaultVideoModel}
              </p>
            </div>
          )}
          {char.defaultImagePrompt && (
            <div style={{ gridColumn: "1 / -1" }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--skr-text-tertiary)",
                  textTransform: "uppercase",
                }}
              >
                Image prompt
              </span>
              <p
                style={{
                  fontSize: 11,
                  margin: "2px 0 0",
                  color: "var(--skr-text-tertiary)",
                  fontFamily: "monospace",
                  wordBreak: "break-word",
                }}
              >
                {char.defaultImagePrompt}
              </p>
            </div>
          )}
          {char.defaultVideoPrompt && (
            <div style={{ gridColumn: "1 / -1" }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--skr-text-tertiary)",
                  textTransform: "uppercase",
                }}
              >
                Video prompt
              </span>
              <p
                style={{
                  fontSize: 11,
                  margin: "2px 0 0",
                  color: "var(--skr-text-tertiary)",
                  fontFamily: "monospace",
                  wordBreak: "break-word",
                }}
              >
                {char.defaultVideoPrompt}
              </p>
            </div>
          )}
        </div>
      )}
      {attrs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {attrs.map((a) => (
            <span
              key={a.label}
              style={{
                fontSize: 11,
                background: "var(--skr-elevated)",
                border: "1px solid var(--skr-border)",
                borderRadius: 4,
                padding: "2px 8px",
                color: "var(--skr-text-secondary)",
              }}
            >
              <span
                style={{
                  color: "var(--skr-text-tertiary)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {a.label}:{" "}
              </span>
              {a.value}
            </span>
          ))}
        </div>
      )}
      <p
        style={{ fontSize: 11, color: "var(--skr-text-tertiary)", fontStyle: "italic", margin: 0 }}
      >
        LoRA profiles for this character are managed in the <strong>LoRA Management</strong> page.
      </p>
    </div>
  );
}
