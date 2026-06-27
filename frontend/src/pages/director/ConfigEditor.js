import React, { useState, useEffect } from "react";
import { saveDirectorConfig } from "../../services/operations";
import { useNotify } from "../../components/sakura/NotificationStack";

/**
 * ConfigEditor — three disclosure panels for generation / video / sound config.
 * Props: { apiBaseUrl, config, options, isLoading, onRefresh }
 */
export default function ConfigEditor({ apiBaseUrl, config, options, isLoading, onRefresh }) {
  const notify = useNotify();

  const [genConfig, setGenConfig] = useState({});
  const [videoConfig, setVideoConfig] = useState({});
  const [soundConfig, setSoundConfig] = useState({});
  const [saving, setSaving] = useState("");

  useEffect(() => {
    setGenConfig(config?.generation || {});
    setVideoConfig(config?.video || {});
    setSoundConfig(config?.sound || {});
  }, [config]);

  const imageModels = options?.generation?.imageModels || [];
  const videoModels = options?.generation?.videoModels || [];
  const imageSizes = options?.generation?.imageSize || [];
  const schedulers = options?.generation?.schedulers || [];

  const handleSaveGen = async () => {
    if (!apiBaseUrl) return;
    setSaving("gen");
    try {
      await saveDirectorConfig(apiBaseUrl, { generation: genConfig });
      notify("Generation config saved.", "success");
      if (onRefresh) onRefresh();
    } catch (e) {
      notify(e?.message || "Failed to save generation config.", "error");
    } finally {
      setSaving("");
    }
  };

  const handleSaveVideo = async () => {
    if (!apiBaseUrl) return;
    setSaving("video");
    try {
      await saveDirectorConfig(apiBaseUrl, { video: videoConfig });
      notify("Video config saved.", "success");
      if (onRefresh) onRefresh();
    } catch (e) {
      notify(e?.message || "Failed to save video config.", "error");
    } finally {
      setSaving("");
    }
  };

  const handleSaveSound = async () => {
    if (!apiBaseUrl) return;
    setSaving("sound");
    try {
      await saveDirectorConfig(apiBaseUrl, { sound: soundConfig });
      notify("Sound config saved.", "success");
      if (onRefresh) onRefresh();
    } catch (e) {
      notify(e?.message || "Failed to save sound config.", "error");
    } finally {
      setSaving("");
    }
  };

  if (isLoading) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <p className="skr-section-title" style={{ marginBottom: 12 }}>
        Config Editor
      </p>

      {/* Generation */}
      <details className="skr-disclosure">
        <summary className="skr-disclosure-header">
          <span>Generation</span>
          <span className="skr-disclosure-chevron" aria-hidden="true">
            ▾
          </span>
        </summary>
        <div className="skr-disclosure-body">
          <div>
            <label className="skr-field-label">Image Model</label>
            <select
              className="skr-input skr-field-select"
              style={{ fontSize: 12 }}
              value={genConfig.imageModel || ""}
              onChange={(e) => setGenConfig((p) => ({ ...p, imageModel: e.target.value }))}
            >
              <option value="">— Default —</option>
              {imageModels.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name || m.key}
                </option>
              ))}
            </select>
          </div>
          {imageSizes.length > 0 && (
            <div>
              <label className="skr-field-label">Image Size</label>
              <select
                className="skr-input skr-field-select"
                style={{ fontSize: 12 }}
                value={genConfig.imageSize || ""}
                onChange={(e) => setGenConfig((p) => ({ ...p, imageSize: e.target.value }))}
              >
                <option value="">— Default —</option>
                {imageSizes.map((s) => (
                  <option key={s.key || s} value={s.key || s}>
                    {s.label || s.key || s}
                  </option>
                ))}
              </select>
            </div>
          )}
          {schedulers.length > 0 && (
            <div>
              <label className="skr-field-label">Scheduler</label>
              <select
                className="skr-input skr-field-select"
                style={{ fontSize: 12 }}
                value={genConfig.scheduler || ""}
                onChange={(e) => setGenConfig((p) => ({ ...p, scheduler: e.target.value }))}
              >
                <option value="">— Default —</option>
                {schedulers.map((s) => (
                  <option key={s.key || s} value={s.key || s}>
                    {s.label || s.key || s}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="skr-field-label">Negative Prompt</label>
            <textarea
              className="skr-input skr-field-textarea"
              style={{ fontSize: 12 }}
              value={genConfig.negativePrompt || ""}
              onChange={(e) => setGenConfig((p) => ({ ...p, negativePrompt: e.target.value }))}
            />
          </div>
          <button
            className="skr-btn-primary"
            style={{ fontSize: 12, alignSelf: "flex-start" }}
            onClick={handleSaveGen}
            disabled={saving === "gen"}
          >
            {saving === "gen" ? "Saving…" : "Save"}
          </button>
        </div>
      </details>

      {/* Video */}
      <details className="skr-disclosure">
        <summary className="skr-disclosure-header">
          <span>Video</span>
          <span className="skr-disclosure-chevron" aria-hidden="true">
            ▾
          </span>
        </summary>
        <div className="skr-disclosure-body">
          <div>
            <label className="skr-field-label">Video Model</label>
            <select
              className="skr-input skr-field-select"
              style={{ fontSize: 12 }}
              value={videoConfig.videoModel || ""}
              onChange={(e) => setVideoConfig((p) => ({ ...p, videoModel: e.target.value }))}
            >
              <option value="">— Default —</option>
              {videoModels.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name || m.key}
                </option>
              ))}
            </select>
          </div>
          <button
            className="skr-btn-primary"
            style={{ fontSize: 12, alignSelf: "flex-start" }}
            onClick={handleSaveVideo}
            disabled={saving === "video"}
          >
            {saving === "video" ? "Saving…" : "Save"}
          </button>
        </div>
      </details>

      {/* Sound */}
      <details className="skr-disclosure">
        <summary className="skr-disclosure-header">
          <span>Sound</span>
          <span className="skr-disclosure-chevron" aria-hidden="true">
            ▾
          </span>
        </summary>
        <div className="skr-disclosure-body">
          <div>
            <label className="skr-field-label">Default Mood</label>
            <input
              className="skr-input"
              style={{ fontSize: 12 }}
              value={soundConfig.defaultMood || ""}
              onChange={(e) => setSoundConfig((p) => ({ ...p, defaultMood: e.target.value }))}
            />
          </div>
          <button
            className="skr-btn-primary"
            style={{ fontSize: 12, alignSelf: "flex-start" }}
            onClick={handleSaveSound}
            disabled={saving === "sound"}
          >
            {saving === "sound" ? "Saving…" : "Save"}
          </button>
        </div>
      </details>
    </div>
  );
}
