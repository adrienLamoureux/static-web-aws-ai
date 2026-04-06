import React from "react";
import { PROFILE_STRENGTH_MIN, PROFILE_STRENGTH_MAX, emptyModalityDraft } from "./loraUtils";

const PROFILE_STRENGTH_STEP = 0.05;

/**
 * LoraProfileEditor
 *
 * Props:
 *   characterOptions      - [{ id, name, source }]
 *   selectedCharacterId   - string
 *   isBootstrapping       - boolean
 *   profileOptions        - [{ id, name }]
 *   selectedProfileId     - string
 *   isProfileListLoading  - boolean
 *   isProfileLoading      - boolean
 *   isSaving              - boolean
 *   profileDraft          - { characterId, name, image, video }
 *   imageModelOptions     - [{ key, label }]
 *   videoModelOptions     - [{ key, label }]
 *   onCharacterChange     - (characterId: string) => void
 *   onSelectProfile       - (profileId: string) => void
 *   onProfileNameChange   - (name: string) => void
 *   onSetModalityValue    - (modality, patch) => void
 *   onRemoveProfileLora   - (modality, catalogId) => void
 *   onUpdateLoraStrength  - (modality, catalogId, value) => void
 *   onSaveProfile         - () => void
 *   onDeleteProfile       - () => void
 *   onResetProfile        - () => void
 */
export default function LoraProfileEditor({
  characterOptions = [],
  selectedCharacterId = "",
  isBootstrapping = false,
  profileOptions = [],
  selectedProfileId = "",
  isProfileListLoading = false,
  isProfileLoading = false,
  isSaving = false,
  profileDraft = {},
  imageModelOptions = [],
  videoModelOptions = [],
  onCharacterChange,
  onSelectProfile,
  onProfileNameChange,
  onSetModalityValue,
  onRemoveProfileLora,
  onUpdateLoraStrength,
  onSaveProfile,
  onDeleteProfile,
  onResetProfile,
}) {
  const renderModalityEditor = ({ modality, label, modelOptions }) => {
    const modalityDraft = profileDraft?.[modality] || emptyModalityDraft();
    return (
      <div key={modality} className="skr-lora-section">
        <p className="skr-lora-section-title">{label}</p>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <span className="skr-field-label">Preferred model key</span>
          <select
            className="skr-field-select"
            value={modalityDraft.modelKey}
            onChange={(e) => onSetModalityValue(modality, { modelKey: e.target.value })}
          >
            <option value="">No model lock</option>
            {modelOptions.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <span className="skr-field-label">Prompt prefix</span>
          <textarea
            className="skr-field-textarea"
            rows={3}
            value={modalityDraft.promptPrefix}
            onChange={(e) => onSetModalityValue(modality, { promptPrefix: e.target.value })}
            placeholder="cinematic anime key visual, consistent character identity"
          />
        </label>
        <div style={{ marginBottom: 8 }}>
          {(modalityDraft.loras || []).length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--skr-text-tertiary)' }}>No LoRAs selected for this modality yet.</p>
          ) : (
            modalityDraft.loras.map((entry) => {
              const loraKey = String(entry.catalogId || "").trim() || String(entry.downloadUrl || "").trim();
              return (
                <div key={`${modality}-${loraKey}`} style={{ padding: '10px 0', borderBottom: '1px solid var(--skr-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p className="skr-lora-item-name">{entry.name || entry.catalogId}</p>
                      <p className="skr-lora-item-meta">{entry.catalogId}</p>
                    </div>
                    <button
                      type="button"
                      className="skr-btn-secondary"
                      style={{ fontSize: 11, padding: '3px 10px' }}
                      onClick={() => onRemoveProfileLora(modality, entry.catalogId)}
                    >
                      Remove
                    </button>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12 }}>
                    <span className="skr-field-label" style={{ marginBottom: 0 }}>Strength</span>
                    <input
                      type="number"
                      step={PROFILE_STRENGTH_STEP}
                      min={PROFILE_STRENGTH_MIN}
                      max={PROFILE_STRENGTH_MAX}
                      className="skr-input"
                      style={{ width: 80 }}
                      value={entry.strength}
                      onChange={(e) => onUpdateLoraStrength(modality, entry.catalogId, e.target.value)}
                    />
                  </label>
                  {entry.triggerWords.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {entry.triggerWords.map((word) => (
                        <span key={`${loraKey}-${word}`} className="skr-lora-chip">{word}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="skr-lora-panel">
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--skr-text-primary)', marginBottom: 4 }}>Character LoRA Profile</p>
        <p style={{ fontSize: 12, color: 'var(--skr-text-secondary)' }}>
          Attach catalog LoRAs per character and modality. Each character can have multiple named profiles.
        </p>
      </div>

      {/* Character selector */}
      <label style={{ display: 'block', marginBottom: 10 }}>
        <span className="skr-field-label">Character</span>
        <select
          className="skr-field-select"
          value={selectedCharacterId}
          onChange={(e) => onCharacterChange(e.target.value)}
          disabled={isBootstrapping}
        >
          <option value="">{isBootstrapping ? "Loading characters..." : "Select a character"}</option>
          {characterOptions.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name}{character.source === 'system' ? ' (system)' : ''}
            </option>
          ))}
        </select>
      </label>

      {/* Profile selector */}
      {selectedCharacterId && (
        <div style={{ marginBottom: 10 }}>
          <span className="skr-field-label">Profile</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              className="skr-field-select"
              style={{ flex: 1 }}
              value={selectedProfileId}
              onChange={(e) => onSelectProfile(e.target.value)}
              disabled={isProfileListLoading}
            >
              <option value="">— New profile —</option>
              {profileOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {selectedProfileId && (
              <button
                type="button"
                className="skr-btn-secondary"
                style={{ fontSize: 11, padding: '3px 8px', color: '#ef4444', flexShrink: 0 }}
                onClick={onDeleteProfile}
                disabled={isSaving}
                title="Delete this profile"
              >
                Delete
              </button>
            )}
          </div>
          {isProfileListLoading && (
            <p style={{ fontSize: 11, color: 'var(--skr-text-tertiary)', marginTop: 4 }}>Loading profiles…</p>
          )}
        </div>
      )}

      {/* Profile name */}
      <label style={{ display: 'block', marginBottom: 16 }}>
        <span className="skr-field-label">Profile name</span>
        <input
          className="skr-input"
          style={{ width: '100%' }}
          value={profileDraft.name || ''}
          onChange={(e) => onProfileNameChange(e.target.value)}
          placeholder={selectedProfileId ? "e.g. Summer outfit, Battle armor…" : "Name for new profile"}
          maxLength={120}
          disabled={!selectedCharacterId}
        />
      </label>

      {isProfileLoading ? (
        <p style={{ fontSize: 12, color: 'var(--skr-text-tertiary)' }}>Loading profile...</p>
      ) : (
        <>
          {renderModalityEditor({ modality: "image", label: "Image Modality", modelOptions: imageModelOptions })}
          {renderModalityEditor({ modality: "video", label: "Video Modality", modelOptions: videoModelOptions })}
        </>
      )}

      <div className="skr-lora-actions" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="skr-btn-primary"
          onClick={onSaveProfile}
          disabled={!selectedCharacterId || isSaving}
        >
          {isSaving ? "Saving..." : (selectedProfileId ? "Save Profile" : "Create Profile")}
        </button>
        <button
          type="button"
          className="skr-btn-secondary"
          onClick={onResetProfile}
          disabled={!selectedCharacterId || isProfileLoading}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
