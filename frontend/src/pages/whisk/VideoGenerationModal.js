import React from "react";

/**
 * VideoGenerationModal — the image-to-video generation dialog.
 *
 * Extracted from Whisk.js (which was over the 500-line cap) into its own
 * component, alongside the sibling GenerationModal / GeneratorSidebar. Pure
 * presentational: all state + the generate handler are owned by the
 * useVideoGeneration hook in the Whisk page and passed down as props.
 */
export default function VideoGenerationModal({
  onClose,
  selectedImageUrl,
  videoProvider,
  videoProviderOptions,
  setVideoProvider,
  videoModel,
  videoModelOptions,
  setVideoModel,
  videoPrompt,
  setVideoPrompt,
  isReplicateAudioOption,
  videoGenerateAudio,
  setVideoGenerateAudio,
  error,
  handleGenerateVideo,
  isGeneratingVideo,
  isVideoInProgress,
}) {
  const busy = isGeneratingVideo || isVideoInProgress;

  return (
    <div className="skr-modal-backdrop" onClick={onClose}>
      <div
        className="skr-modal"
        style={{ width: 480, maxWidth: "95vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="skr-modal-header">
          <span className="skr-modal-title">Generate Video</span>
          <button className="skr-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {selectedImageUrl && (
            <img
              src={selectedImageUrl}
              alt="Source"
              style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 8 }}
            />
          )}
          <div>
            <label className="skr-field-label">Provider</label>
            <div style={{ display: "flex", gap: 6 }}>
              {(videoProviderOptions || []).map((opt) => (
                <button
                  key={opt.key}
                  className={videoProvider === opt.key ? "skr-btn-primary" : "skr-btn-secondary"}
                  style={{ fontSize: 12, padding: "4px 12px" }}
                  onClick={() => setVideoProvider(opt.key)}
                >
                  {opt.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="skr-field-label">Video model</label>
            <select
              className="skr-field-select"
              value={videoModel}
              onChange={(e) => setVideoModel(e.target.value)}
            >
              {(videoModelOptions || []).map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name || m.key}
                  {m.description ? ` — ${m.description}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="skr-field-label">Motion prompt</label>
            <textarea
              className="skr-input"
              rows={3}
              placeholder="Describe the motion or scene…"
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
              style={{ resize: "vertical", width: "100%" }}
            />
          </div>
          {isReplicateAudioOption && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                id="vid-audio"
                checked={videoGenerateAudio}
                onChange={(e) => setVideoGenerateAudio(e.target.checked)}
              />
              <label
                htmlFor="vid-audio"
                className="skr-field-label"
                style={{ margin: 0, cursor: "pointer" }}
              >
                Generate audio
              </label>
            </div>
          )}
          {error && <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="skr-btn-primary"
              style={{ flex: 1 }}
              onClick={handleGenerateVideo}
              disabled={busy}
            >
              {busy ? "Generating…" : "Generate Video"}
            </button>
            <button className="skr-btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          </div>
          {busy && (
            <p style={{ fontSize: 12, color: "var(--skr-text-secondary)", textAlign: "center" }}>
              Video generation is running in the background. Check the Videos page when done.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
