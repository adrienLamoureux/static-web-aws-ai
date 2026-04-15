import React from "react";

/**
 * Collapsible panel with dropdowns for building image prompts from structured fields.
 *
 * Props:
 *   promptHelperProps  — state and handlers from useImageStudio -> usePromptBuilder
 *   collapsed          — boolean, whether the panel body is hidden
 *   onToggle           — () => void, toggles collapsed state
 */
export default function PromptHelperPanel({ promptHelperProps, collapsed, onToggle }) {
  const {
    selections,
    onSelectionChange,
    onCharacterChange,
    onCreate,
    onAiGenerate,
    isLoading,
    status,
    promptBackgrounds,
    promptCharacters,
    promptPoses,
    promptTraits,
    promptFaceDetails,
    promptEyeDetails,
    promptBreastSizes,
    promptEars,
    promptTails,
    promptHorns,
    promptWings,
    promptHairStyles,
    promptViewDistance,
    promptAccessories,
    promptMarkings,
    promptOutfits,
    promptStyles,
  } = promptHelperProps;

  const fields = [
    { key: "background", label: "Background", options: promptBackgrounds },
    { key: "pose", label: "Pose", options: promptPoses },
    { key: "signatureTraits", label: "Traits", options: promptTraits },
    { key: "faceDetails", label: "Face", options: promptFaceDetails },
    { key: "eyeDetails", label: "Eyes", options: promptEyeDetails },
    { key: "breastSize", label: "Breast Size", options: promptBreastSizes },
    { key: "ears", label: "Ears", options: promptEars },
    { key: "tails", label: "Tails", options: promptTails },
    { key: "horns", label: "Horns", options: promptHorns },
    { key: "wings", label: "Wings", options: promptWings },
    { key: "hairStyles", label: "Hair", options: promptHairStyles },
    { key: "viewDistance", label: "View", options: promptViewDistance },
    { key: "accessories", label: "Accessories", options: promptAccessories },
    { key: "markings", label: "Markings", options: promptMarkings },
    { key: "outfitMaterials", label: "Outfit", options: promptOutfits },
    { key: "styleReference", label: "Style", options: promptStyles },
  ];

  return (
    <div style={{ border: "1px solid var(--skr-border)", borderRadius: 8, overflow: "hidden" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "10px 14px",
          background: "var(--skr-surface)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--skr-text-primary)",
        }}
      >
        <span>✨ Prompt Helper</span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>{collapsed ? "▼ expand" : "▲ collapse"}</span>
      </button>
      {!collapsed && (
        <div
          style={{
            padding: "14px",
            background: "var(--skr-base)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* Character preset */}
          <div>
            <label className="skr-field-label">Character preset</label>
            <select
              className="skr-field-select"
              value={selections.character || ""}
              onChange={(e) => onCharacterChange(e.target.value)}
            >
              <option value="">— None —</option>
              {(promptCharacters || []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {/* All other fields in a 2-column grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {fields.map(({ key, label, options }) => (
              <div key={key}>
                <label className="skr-field-label" style={{ fontSize: 11 }}>
                  {label}
                </label>
                <select
                  className="skr-field-select"
                  value={selections[key] || ""}
                  onChange={(e) => onSelectionChange(key, e.target.value)}
                  style={{ fontSize: 12 }}
                >
                  <option value="">—</option>
                  {(options || []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              className="skr-btn-secondary"
              style={{ flex: 1, fontSize: 12 }}
              onClick={onCreate}
              disabled={isLoading}
            >
              Build prompt
            </button>
            <button
              className="skr-btn-primary"
              style={{ flex: 1, fontSize: 12 }}
              onClick={onAiGenerate}
              disabled={isLoading}
            >
              {isLoading ? "AI building…" : "✦ AI build"}
            </button>
          </div>
          {status === "error" && (
            <p style={{ fontSize: 11, color: "#ef4444", margin: 0 }}>Helper failed. Try again.</p>
          )}
        </div>
      )}
    </div>
  );
}
