import React, { useState } from "react";
import AspectRatioPicker from "./AspectRatioPicker";
import StylePresets from "./StylePresets";
import CharacterLoraSelector from "../../components/shared/CharacterLoraSelector";
import CivitaiLoraPanel from "./CivitaiLoraPanel";

/**
 * PixAI-inspired right sidebar for the image generator.
 * Organises all generation settings into collapsible sections.
 */
export default function GeneratorSidebar({
  apiBaseUrl,
  imageSource,
  imageSourceOptions,
  onSourceChange,
  imageModel,
  imageModelOptions,
  onSelectModel,
  imagePrompt,
  onImagePromptChange,
  imageNegativePrompt,
  onImageNegativePromptChange,
  imageSize,
  imageSizeOptions,
  onImageSizeChange,
  imageCount,
  imageCountOptions,
  onImageCountChange,
  imageScheduler,
  imageSchedulerOptions,
  onImageSchedulerChange,
  imageGenerationName,
  onImageNameChange,
  imageGenerationNotice,
  selectedCharacterId,
  setSelectedCharacterId,
  selectedLoraProfileId,
  setSelectedLoraProfileId,
  loraProfiles,
  imageGenerationProps,
  isGenerating: _isGenerating,
  error,
  onGenerate: _onGenerate,
  onOpenFullOptions,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <aside className="skr-gen-sidebar">
      {/* Provider */}
      <div className="skr-gen-section">
        <div className="skr-gen-section-title">Provider</div>
        <div className="skr-gen-source-tabs">
          {(imageSourceOptions || []).map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`skr-gen-source-tab${imageSource === opt.key ? " is-active" : ""}`}
              onClick={() => onSourceChange(opt.key)}
            >
              {opt.name}
            </button>
          ))}
        </div>
      </div>

      {imageSource !== "upload" && (
        <>
          {/* Style presets */}
          <div className="skr-gen-section">
            <div className="skr-gen-section-title">Style</div>
            <StylePresets prompt={imagePrompt} onPromptChange={onImagePromptChange} />
          </div>

          {/* Model */}
          <div className="skr-gen-section">
            <div className="skr-gen-section-title">Model</div>
            <div className="skr-model-grid">
              {(imageModelOptions || []).slice(0, 6).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={`skr-model-thumb${imageModel === m.key ? " is-selected" : ""}`}
                  onClick={() => onSelectModel(m.key)}
                  title={m.description || m.name || m.key}
                >
                  <span className="skr-model-thumb-icon">◈</span>
                  <span className="skr-model-thumb-name">
                    {(m.name || m.key).split(" ").slice(0, 2).join(" ")}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* LoRA */}
          {imageSource !== "civitai" ? (
            <div className="skr-gen-section">
              <div className="skr-gen-section-title">Character & LoRA</div>
              <CharacterLoraSelector
                apiBaseUrl={apiBaseUrl}
                characterId={selectedCharacterId}
                loraProfileId={selectedLoraProfileId}
                onCharacterChange={setSelectedCharacterId}
                onLoraChange={setSelectedLoraProfileId}
                compact
              />
            </div>
          ) : (
            <div className="skr-gen-section">
              <div className="skr-gen-section-title">LoRA</div>
              <CivitaiLoraPanel
                imageGenerationProps={imageGenerationProps}
                loraProfiles={loraProfiles}
                selectedLoraProfileId={selectedLoraProfileId}
                onLoraProfileChange={setSelectedLoraProfileId}
              />
            </div>
          )}

          {/* Aspect Ratio */}
          <div className="skr-gen-section">
            <div className="skr-gen-section-title">Aspect Ratio</div>
            <AspectRatioPicker value={imageSize} onChange={onImageSizeChange} />
          </div>

          {/* Count */}
          <div className="skr-gen-section">
            <div className="skr-gen-section-title">Images</div>
            <div className="skr-gen-count-tabs">
              {(
                imageCountOptions || [
                  { value: "1", label: "1" },
                  { value: "2", label: "2" },
                  { value: "4", label: "4" },
                ]
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`skr-gen-count-tab${imageCount === opt.value ? " is-active" : ""}`}
                  onClick={() => onImageCountChange(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced — collapsible */}
          <div className="skr-gen-section">
            <button
              type="button"
              className="skr-gen-advanced-toggle"
              onClick={() => setAdvancedOpen((o) => !o)}
            >
              <span className="skr-gen-section-title" style={{ margin: 0 }}>
                Advanced
              </span>
              <span style={{ fontSize: 12, color: "var(--skr-text-muted)" }}>
                {advancedOpen ? "▲" : "▼"}
              </span>
            </button>

            {advancedOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                <div>
                  <label className="skr-field-label">Name (optional)</label>
                  <input
                    className="skr-input"
                    placeholder="e.g. frieren-scene"
                    value={imageGenerationName}
                    onChange={(e) => onImageNameChange(e.target.value)}
                  />
                </div>
                <div>
                  <label className="skr-field-label">Negative prompt</label>
                  <textarea
                    className="skr-input"
                    rows={2}
                    placeholder="What to avoid…"
                    value={imageNegativePrompt}
                    onChange={(e) => onImageNegativePromptChange(e.target.value)}
                    style={{ resize: "vertical", width: "100%" }}
                  />
                </div>
                {imageSizeOptions && imageSizeOptions.length > 0 && (
                  <div>
                    <label className="skr-field-label">Exact size</label>
                    <select
                      className="skr-field-select"
                      value={imageSize}
                      onChange={(e) => onImageSizeChange(e.target.value)}
                    >
                      {imageSizeOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {imageSchedulerOptions && imageSchedulerOptions.length > 0 && (
                  <div>
                    <label className="skr-field-label">Scheduler</label>
                    <select
                      className="skr-field-select"
                      value={imageScheduler}
                      onChange={(e) => onImageSchedulerChange(e.target.value)}
                    >
                      {imageSchedulerOptions.map((o) => (
                        <option key={o.value || o} value={o.value || o}>
                          {o.label || o}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {imageGenerationNotice && (
            <p style={{ fontSize: 11, color: "var(--skr-text-secondary)", margin: "0 16px" }}>
              {imageGenerationNotice}
            </p>
          )}

          {error && <p style={{ fontSize: 12, color: "#ef4444", margin: "0 16px" }}>{error}</p>}

          {/* Full options link */}
          <div style={{ padding: "0 12px 4px" }}>
            <button
              className="skr-btn-ghost"
              style={{ fontSize: 12, width: "100%" }}
              onClick={onOpenFullOptions}
            >
              ⚙ Full options…
            </button>
          </div>
        </>
      )}

      {/* Reset divider */}
      <div className="skr-gen-sidebar-reset">
        <button
          type="button"
          className="skr-gen-sidebar-reset-btn"
          onClick={() => {
            if (onSelectModel) onSelectModel(imageModelOptions?.[0]?.key);
          }}
          title="Reset to defaults"
        >
          ↺ Reset
        </button>
      </div>
    </aside>
  );
}
