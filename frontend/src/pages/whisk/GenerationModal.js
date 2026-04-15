import React from "react";
import CharacterLoraSelector from "../../components/shared/CharacterLoraSelector";
import CivitaiLoraPanel from "./CivitaiLoraPanel";
import PromptHelperPanel from "./PromptHelperPanel";

/**
 * Full-options generation drawer — slides in from the right side.
 * Extracted from Whisk.js to keep that file under 500 lines.
 */
export default function GenerationModal({
  apiBaseUrl,
  onClose,
  imageSource,
  imageSourceOptions,
  setImageSource,
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
  promptHelperCollapsed,
  setPromptHelperCollapsed,
  imageUploadProps,
  isUploading,
  error,
  isGenerating,
  onGenerate,
}) {
  const { promptHelperProps } = imageGenerationProps || {};
  const isUpload = imageSource === "upload";

  return (
    <>
      {/* Backdrop — click to close */}
      <div className="skr-gen-drawer-backdrop" onClick={onClose} />

      {/* Drawer panel */}
      <div
        className="skr-gen-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Image Generation — Full Options"
      >
        <div className="skr-gen-drawer-header">
          <span className="skr-gen-drawer-title">Full Options</span>
          <button className="skr-gen-drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="skr-gen-drawer-body">
          {/* Source selector */}
          <div>
            <label className="skr-field-label">Source</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(imageSourceOptions || []).map((opt) => (
                <button
                  key={opt.key}
                  className={imageSource === opt.key ? "skr-btn-primary" : "skr-btn-secondary"}
                  style={{ fontSize: 12, padding: "5px 12px" }}
                  onClick={() => setImageSource(opt.key)}
                >
                  {opt.name}
                </button>
              ))}
            </div>
          </div>

          {!isUpload ? (
            <>
              <div>
                <label className="skr-field-label">
                  Generation name{" "}
                  <span style={{ color: "var(--skr-text-tertiary)", fontWeight: 400 }}>
                    (optional)
                  </span>
                </label>
                <input
                  className="skr-input"
                  placeholder="e.g. frieren-forest-scene"
                  value={imageGenerationName}
                  onChange={(e) => onImageNameChange(e.target.value)}
                />
              </div>

              <div>
                <label className="skr-field-label">Model</label>
                <select
                  className="skr-field-select"
                  value={imageModel}
                  onChange={(e) => onSelectModel(e.target.value)}
                >
                  {(imageModelOptions || []).map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.name || m.label || m.key}
                      {m.description ? ` — ${m.description}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="skr-field-label">Prompt</label>
                <textarea
                  className="skr-input"
                  rows={5}
                  placeholder="Describe what to generate…"
                  value={imagePrompt}
                  onChange={(e) => onImagePromptChange(e.target.value)}
                  style={{ resize: "vertical", width: "100%" }}
                />
              </div>

              <div>
                <label className="skr-field-label">Negative prompt</label>
                <textarea
                  className="skr-input"
                  rows={3}
                  placeholder="What to avoid…"
                  value={imageNegativePrompt}
                  onChange={(e) => onImageNegativePromptChange(e.target.value)}
                  style={{ resize: "vertical", width: "100%" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label className="skr-field-label">Size</label>
                  <select
                    className="skr-field-select"
                    value={imageSize}
                    onChange={(e) => onImageSizeChange(e.target.value)}
                  >
                    {(imageSizeOptions || []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="skr-field-label">Count</label>
                  <select
                    className="skr-field-select"
                    value={imageCount}
                    onChange={(e) => onImageCountChange(e.target.value)}
                  >
                    {(imageCountOptions || []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label || o.value}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="skr-field-label">Scheduler</label>
                  <select
                    className="skr-field-select"
                    value={imageScheduler}
                    onChange={(e) => onImageSchedulerChange(e.target.value)}
                  >
                    {(imageSchedulerOptions || []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label || o.value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {imageSource !== "civitai" && (
                <CharacterLoraSelector
                  apiBaseUrl={apiBaseUrl}
                  characterId={selectedCharacterId}
                  loraProfileId={selectedLoraProfileId}
                  onCharacterChange={setSelectedCharacterId}
                  onLoraChange={setSelectedLoraProfileId}
                />
              )}

              {imageSource === "civitai" && (
                <div>
                  <label className="skr-field-label" style={{ marginBottom: 8 }}>
                    LoRA configuration
                  </label>
                  <CivitaiLoraPanel
                    imageGenerationProps={imageGenerationProps}
                    loraProfiles={loraProfiles}
                    selectedLoraProfileId={selectedLoraProfileId}
                    onLoraProfileChange={setSelectedLoraProfileId}
                  />
                </div>
              )}

              <PromptHelperPanel
                promptHelperProps={promptHelperProps}
                collapsed={promptHelperCollapsed}
                onToggle={() => setPromptHelperCollapsed((v) => !v)}
              />

              {imageGenerationNotice && (
                <p style={{ fontSize: 12, color: "var(--skr-text-secondary)", margin: 0 }}>
                  {imageGenerationNotice}
                </p>
              )}
              {error && <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{error}</p>}
            </>
          ) : (
            <>
              <div>
                <label className="skr-field-label">Image name</label>
                <input
                  className="skr-input"
                  placeholder="my-image"
                  value={imageUploadProps?.imageName}
                  onChange={(e) => imageUploadProps?.onImageNameChange(e.target.value)}
                />
              </div>
              <div>
                <label className="skr-field-label">File</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={imageUploadProps?.onFileChange}
                  style={{ fontSize: 13, color: "var(--skr-text-primary)" }}
                />
              </div>
              {imageUploadProps?.previewUrl && (
                <img
                  src={imageUploadProps.previewUrl}
                  alt="preview"
                  style={{
                    maxWidth: "100%",
                    borderRadius: 8,
                    maxHeight: 200,
                    objectFit: "contain",
                  }}
                />
              )}
              {error && <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{error}</p>}
            </>
          )}
        </div>

        {/* Sticky footer with action buttons */}
        <div className="skr-gen-drawer-footer">
          {!isUpload ? (
            <>
              <button
                className="skr-btn-primary"
                style={{ flex: 1 }}
                onClick={onGenerate}
                disabled={isGenerating || !imagePrompt.trim()}
              >
                {isGenerating ? "Generating…" : "Generate"}
              </button>
              <button className="skr-btn-secondary" onClick={onClose} disabled={isGenerating}>
                Close
              </button>
            </>
          ) : (
            <>
              <button
                className="skr-btn-primary"
                style={{ flex: 1 }}
                onClick={imageUploadProps?.onUpload}
                disabled={isUploading || !imageUploadProps?.selectedFile}
              >
                {isUploading ? "Uploading…" : "Upload"}
              </button>
              <button className="skr-btn-secondary" onClick={onClose} disabled={isUploading}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
