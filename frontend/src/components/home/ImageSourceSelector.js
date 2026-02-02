import React from "react";

function ImageSourceSelector({ options, value, onChange }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-600">Choose a source</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {options.map((option) => {
          const isSelected = value === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onChange(option.key)}
              className={`rounded-2xl border p-4 text-left transition ${
                isSelected
                  ? "border-accent bg-glow shadow-soft"
                  : "border-slate-200 bg-white/70 hover:border-slate-300"
              }`}
            >
              <p className="text-sm font-semibold text-ink">{option.name}</p>
              <p className="mt-1 text-xs text-slate-500">
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
