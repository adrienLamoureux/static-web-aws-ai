import React from "react";

function PromptHelperForm({
  selections,
  onSelectionChange,
  onCharacterChange,
  onCreate,
  onAiGenerate,
  isLoading,
  status,
  hasSelection,
  promptBackgrounds,
  promptCharacters,
  promptPoses,
  promptArchetypes,
  promptTraits,
  promptFaceDetails,
  promptEyeDetails,
  promptHairDetails,
  promptExpressions,
  promptOutfits,
  promptPalettes,
  promptStyles,
}) {
  return (
    <div className="gallery-section">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="field-label">AI prompt helper</p>
          <p className="mt-1 text-xs text-[#7a6a51]">
            Pick a scenario, then create a prompt draft.
          </p>
        </div>
        <button
          type="button"
          onClick={onAiGenerate}
          disabled={isLoading || !hasSelection}
          className="btn-icon disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Refine prompt with AI"
          title="Refine prompt with AI"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v4" />
            <path d="M12 17v4" />
            <path d="M4.93 4.93l2.83 2.83" />
            <path d="M16.24 16.24l2.83 2.83" />
            <path d="M3 12h4" />
            <path d="M17 12h4" />
            <path d="M4.93 19.07l2.83-2.83" />
            <path d="M16.24 7.76l2.83-2.83" />
          </svg>
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div>
          <label className="field-label">
            Background
          </label>
          <input
            className="field-input mt-3"
            list="prompt-helper-backgrounds"
            value={selections.background}
            onChange={(event) =>
              onSelectionChange("background", event.target.value)
            }
            placeholder="neon-lit city alley"
          />
          <datalist id="prompt-helper-backgrounds">
            {promptBackgrounds.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="field-label">
            Character
          </label>
          <input
            className="field-input mt-3"
            list="prompt-helper-characters"
            value={selections.character}
            onChange={(event) => onCharacterChange(event.target.value)}
            placeholder="mysterious swordswoman"
          />
          <datalist id="prompt-helper-characters">
            {promptCharacters.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="field-label">
            Pose
          </label>
          <input
            className="field-input mt-3"
            list="prompt-helper-poses"
            value={selections.pose}
            onChange={(event) =>
              onSelectionChange("pose", event.target.value)
            }
            placeholder="looking over shoulder"
          />
          <datalist id="prompt-helper-poses">
            {promptPoses.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="gallery-divider" />
      <div>
        <p className="field-label">
          Character aesthetics
        </p>
        <p className="mt-1 text-xs text-[#7a6a51]">
          Face, styling, and gacha-style cues.
        </p>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div>
          <label className="field-label">
            Archetype
          </label>
          <input
            className="field-input mt-3"
            list="prompt-helper-archetypes"
            value={selections.archetype}
            onChange={(event) =>
              onSelectionChange("archetype", event.target.value)
            }
            placeholder="stoic elf mage"
          />
          <datalist id="prompt-helper-archetypes">
            {promptArchetypes.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="field-label">
            Signature traits
          </label>
          <input
            className="field-input mt-3"
            list="prompt-helper-traits"
            value={selections.signatureTraits}
            onChange={(event) =>
              onSelectionChange("signatureTraits", event.target.value)
            }
            placeholder="silver hair, emerald eyes"
          />
          <datalist id="prompt-helper-traits">
            {promptTraits.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="field-label">
            Face details
          </label>
          <input
            className="field-input mt-3"
            list="prompt-helper-face-details"
            value={selections.faceDetails}
            onChange={(event) =>
              onSelectionChange("faceDetails", event.target.value)
            }
            placeholder="soft youthful face"
          />
          <datalist id="prompt-helper-face-details">
            {promptFaceDetails.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="field-label">
            Eye details
          </label>
          <input
            className="field-input mt-3"
            list="prompt-helper-eye-details"
            value={selections.eyeDetails}
            onChange={(event) =>
              onSelectionChange("eyeDetails", event.target.value)
            }
            placeholder="almond-shaped eyes with soft highlights"
          />
          <datalist id="prompt-helper-eye-details">
            {promptEyeDetails.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="field-label">
            Hair details
          </label>
          <input
            className="field-input mt-3"
            list="prompt-helper-hair-details"
            value={selections.hairDetails}
            onChange={(event) =>
              onSelectionChange("hairDetails", event.target.value)
            }
            placeholder="long flowing hair"
          />
          <datalist id="prompt-helper-hair-details">
            {promptHairDetails.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="field-label">
            Expression
          </label>
          <input
            className="field-input mt-3"
            list="prompt-helper-expressions"
            value={selections.expression}
            onChange={(event) =>
              onSelectionChange("expression", event.target.value)
            }
            placeholder="quiet, thoughtful expression"
          />
          <datalist id="prompt-helper-expressions">
            {promptExpressions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="gallery-divider" />
      <div>
        <p className="field-label">
          Styling & palette
        </p>
        <p className="mt-1 text-xs text-[#7a6a51]">
          Keep these independent of character presets.
        </p>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div>
          <label className="field-label">
            Outfit/materials
          </label>
          <input
            className="field-input mt-3"
            list="prompt-helper-outfits"
            value={selections.outfitMaterials}
            onChange={(event) =>
              onSelectionChange("outfitMaterials", event.target.value)
            }
            placeholder="ornate mage cloak with layered fabric"
          />
          <datalist id="prompt-helper-outfits">
            {promptOutfits.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="field-label">
            Color palette
          </label>
          <input
            className="field-input mt-3"
            list="prompt-helper-palettes"
            value={selections.colorPalette}
            onChange={(event) =>
              onSelectionChange("colorPalette", event.target.value)
            }
            placeholder="muted teal and warm gold"
          />
          <datalist id="prompt-helper-palettes">
            {promptPalettes.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="field-label">
            Style reference
          </label>
          <input
            className="field-input mt-3"
            list="prompt-helper-styles"
            value={selections.styleReference}
            onChange={(event) =>
              onSelectionChange("styleReference", event.target.value)
            }
            placeholder="anime key visual, clean line art"
          />
          <datalist id="prompt-helper-styles">
            {promptStyles.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
      </div>

      {isLoading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-[#7a6a51]">
          <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Drafting a prompt with Haiku...
        </div>
      )}
      {status === "success" && (
        <p className="mt-3 text-xs text-[#7a6a51]">
          Prompt applied to the positive field.
        </p>
      )}

      <button
        type="button"
        onClick={onCreate}
        disabled={isLoading || !hasSelection}
        className="btn-ghost mt-5 w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        Create prompt
      </button>
    </div>
  );
}

export default PromptHelperForm;
