import React from "react";

function ImageSourceSelector({ options, value, onChange }) {
  return (
    <div>
      <p className="field-label">Choose a source</p>
      <div className="choice-row mt-3 md:grid-cols-4">
        {options.map((option) => {
          const isSelected = value === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onChange(option.key)}
              className={`choice-tile ${
                isSelected ? "choice-tile--active" : ""
              }`}
            >
              <p className="text-sm font-semibold text-ink">{option.name}</p>
              <p className="mt-1 text-xs text-[#7a6a51]">
                {option.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ImageSourceSelector;
