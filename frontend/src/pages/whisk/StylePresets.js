import React from "react";

const PRESETS = [
  {
    id: "none",
    label: "No Style",
    promptPrefix: "",
    emoji: "✧",
    color: "#9880B8",
  },
  {
    id: "classic_anime",
    label: "Classic Anime",
    promptPrefix: "anime key visual, classic anime style, soft gradients, clean line art, ",
    emoji: "🌸",
    color: "#FF6B9D",
  },
  {
    id: "luminous",
    label: "Luminous",
    promptPrefix: "luminous lighting, cel shading, vibrant colors, cinematic glow, anime style, ",
    emoji: "✨",
    color: "#FBBF24",
  },
  {
    id: "modern_gal",
    label: "Modern",
    promptPrefix: "modern art style, detailed illustration, dynamic composition, high contrast, ",
    emoji: "🎨",
    color: "#7C3AED",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    promptPrefix: "watercolor painting, soft brush strokes, pastel colors, dreamy atmosphere, ",
    emoji: "🎭",
    color: "#38BDF8",
  },
  {
    id: "pixel",
    label: "Pixel Art",
    promptPrefix: "pixel art, 16-bit style, retro game aesthetic, crisp pixels, ",
    emoji: "👾",
    color: "#4ADE80",
  },
];

/**
 * Applies or removes a style prefix from a prompt string.
 */
export function applyStyleToPrompt(currentPrompt, preset) {
  if (!preset || preset.id === "none") return currentPrompt;
  // Remove any existing style prefix first, then prepend new one
  const cleaned = PRESETS.filter((p) => p.id !== "none" && p.promptPrefix).reduce(
    (p, s) => p.replace(s.promptPrefix, ""),
    currentPrompt
  );
  return preset.promptPrefix + cleaned;
}

export function removeStyleFromPrompt(currentPrompt) {
  return PRESETS.filter((p) => p.id !== "none" && p.promptPrefix).reduce(
    (p, s) => p.replace(s.promptPrefix, ""),
    currentPrompt
  );
}

export function detectActivePreset(prompt) {
  for (const preset of PRESETS) {
    if (preset.id !== "none" && preset.promptPrefix && prompt.startsWith(preset.promptPrefix)) {
      return preset.id;
    }
  }
  return "none";
}

export default function StylePresets({ prompt, onPromptChange }) {
  const activePresetId = detectActivePreset(prompt || "");

  const handleSelect = (preset) => {
    if (!onPromptChange) return;
    const cleaned = removeStyleFromPrompt(prompt || "");
    if (preset.id === "none" || preset.id === activePresetId) {
      onPromptChange(cleaned);
    } else {
      onPromptChange(preset.promptPrefix + cleaned);
    }
  };

  return (
    <div className="skr-style-presets">
      {PRESETS.map((preset) => {
        const isActive = activePresetId === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            className={`skr-style-preset-btn${isActive ? " is-active" : ""}`}
            onClick={() => handleSelect(preset)}
            title={preset.label}
            style={{ "--preset-color": preset.color }}
          >
            <span className="skr-style-preset-swatch">{preset.emoji}</span>
            <span className="skr-style-preset-label">{preset.label}</span>
          </button>
        );
      })}
    </div>
  );
}
