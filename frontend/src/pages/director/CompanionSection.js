import React, { useState, useEffect } from "react";
import { fetchCompanionModel, saveCompanionModel } from "../../services/operations";
import { getAllModels } from "../../lib/live2d/model-registry";
import { useCompanion, CompanionActions } from "../../lib/companion/CompanionContext";
import { useNotify } from "../../components/sakura/NotificationStack";
import CompanionMemoryViewer from "./CompanionMemoryViewer";

/**
 * CompanionSection — manage the active companion model + test reactions.
 * Props: { apiBaseUrl }
 */
export default function CompanionSection({ apiBaseUrl }) {
  const notify = useNotify();
  const { dispatch } = useCompanion();
  const models = getAllModels();

  const [currentModelId, setCurrentModelId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!apiBaseUrl) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetchCompanionModel(apiBaseUrl)
      .then((data) => {
        const id = data?.modelId || "";
        setCurrentModelId(id);
        setSelectedModelId(id);
      })
      .catch(() => {
        // Model endpoint may not be implemented yet — silently ignore
        setIsLoading(false);
      })
      .finally(() => setIsLoading(false));
  }, [apiBaseUrl]);

  const handleSave = async () => {
    if (!apiBaseUrl) return;
    setIsSaving(true);
    try {
      await saveCompanionModel(apiBaseUrl, { modelId: selectedModelId });
      setCurrentModelId(selectedModelId);
      notify("Companion model saved.", "success");
    } catch (e) {
      notify(e?.message || "Failed to save companion model.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const testDone = () =>
    dispatch(CompanionActions.GENERATION_DONE, { type: "image", success: true });
  const testError = () =>
    dispatch(CompanionActions.GENERATION_ERROR, { type: "image", error: "test error" });
  const testStory = () => dispatch(CompanionActions.STORY_TURN, { sessionTitle: "Test story" });

  if (isLoading) return null;

  return (
    <div className="skr-card" style={{ padding: 20, marginBottom: 16 }}>
      <p className="skr-module-title">Companion Model</p>
      {currentModelId && (
        <p style={{ fontSize: 12, color: "var(--skr-text-tertiary)", marginBottom: 8 }}>
          Active: <strong style={{ color: "var(--skr-text-secondary)" }}>{currentModelId}</strong>
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <select
          className="skr-input skr-field-select"
          style={{ fontSize: 12, flex: 1 }}
          value={selectedModelId}
          onChange={(e) => setSelectedModelId(e.target.value)}
        >
          <option value="">— Select model —</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          className="skr-btn-primary"
          style={{ fontSize: 12 }}
          onClick={handleSave}
          disabled={isSaving || !selectedModelId}
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
      <p
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--skr-text-secondary)",
          marginBottom: 6,
        }}
      >
        Test Reactions
      </p>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="skr-btn-secondary" style={{ fontSize: 11 }} onClick={testDone}>
          Test: Done
        </button>
        <button className="skr-btn-secondary" style={{ fontSize: 11 }} onClick={testError}>
          Test: Error
        </button>
        <button className="skr-btn-secondary" style={{ fontSize: 11 }} onClick={testStory}>
          Test: Story
        </button>
      </div>
      <CompanionMemoryViewer apiBaseUrl={apiBaseUrl} />
    </div>
  );
}
