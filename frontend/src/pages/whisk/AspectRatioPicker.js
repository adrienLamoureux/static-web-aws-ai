import React from "react";

const RATIOS = [
  { label: "3:5", width: 14, height: 23, value: "portrait_3_5" },
  { label: "1:1", width: 20, height: 20, value: "square" },
  { label: "9:16", width: 13, height: 23, value: "portrait_9_16" },
  { label: "3:4", width: 16, height: 21, value: "portrait_3_4" },
  { label: "16:9", width: 26, height: 15, value: "landscape_16_9" },
];

/**
 * Maps our visual ratio ids to actual model size strings.
 */
export const RATIO_TO_SIZE_MAP = {
  portrait_3_5: "768x1280",
  square: "1024x1024",
  portrait_9_16: "720x1280",
  portrait_3_4: "768x1024",
  landscape_16_9: "1280x720",
};

export function sizeToRatioId(sizeStr) {
  const entry = Object.entries(RATIO_TO_SIZE_MAP).find(([, v]) => v === sizeStr);
  return entry ? entry[0] : "portrait_3_5";
}

export default function AspectRatioPicker({ value, onChange }) {
  const currentRatioId = sizeToRatioId(value);

  const handleSelect = (ratio) => {
    onChange(RATIO_TO_SIZE_MAP[ratio.value] || value);
  };

  return (
    <div className="skr-ratio-picker">
      {RATIOS.map((ratio) => {
        const isActive = currentRatioId === ratio.value;
        return (
          <button
            key={ratio.value}
            type="button"
            className={`skr-ratio-btn${isActive ? " is-active" : ""}`}
            onClick={() => handleSelect(ratio)}
            title={ratio.label}
          >
            <span className="skr-ratio-icon" style={{ width: ratio.width, height: ratio.height }} />
            <span className="skr-ratio-label">{ratio.label}</span>
          </button>
        );
      })}
    </div>
  );
}
