/**
 * AgentModelSection — Sanctum admin picker for the Bedrock model the agent
 * uses on `/api/agent/turn` and `/api/agent/suggest`.
 *
 * Backed by GET/PUT /api/admin/agent/model. Empty Save resets to the env
 * default (the route returns `reset: true` on that path).
 */

import React, { useState, useEffect, useCallback } from "react";
import { fetchAgentModel, saveAgentModel } from "../../services/operations";
import { useNotify } from "../../components/sakura/NotificationStack";

// Curated dropdown of common Bedrock anthropic profiles. Admins can paste a
// custom modelId/ARN if their setup uses something else.
const COMMON_MODELS = [
  { id: "us.anthropic.claude-haiku-4-5-20251001-v1:0", label: "Claude Haiku 4.5 (fast, cheap)" },
  { id: "us.anthropic.claude-sonnet-4-6-20251201-v1:0", label: "Claude Sonnet 4.6 (balanced)" },
  { id: "us.anthropic.claude-opus-4-7-20260301-v1:0", label: "Claude Opus 4.7 (slow, premium)" },
];

export default function AgentModelSection({ apiBaseUrl }) {
  const notify = useNotify();
  const [current, setCurrent] = useState("");
  const [defaultId, setDefaultId] = useState("");
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(() => {
    if (!apiBaseUrl) return;
    setIsLoading(true);
    fetchAgentModel(apiBaseUrl)
      .then((d) => {
        setCurrent(d?.modelId || "");
        setDefaultId(d?.default || "");
        setDraft(d?.modelId || "");
      })
      .catch((e) => notify(e?.message || "Failed to load agent model.", "error"))
      .finally(() => setIsLoading(false));
  }, [apiBaseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const data = await saveAgentModel(apiBaseUrl, draft);
      setCurrent(data?.modelId || "");
      setDraft(data?.modelId || "");
      notify(
        data?.reset
          ? `Reset to env default (${data.modelId}).`
          : `Agent model set to ${data.modelId}.`,
        "success"
      );
    } catch (e) {
      notify(e?.message || "Failed to save agent model.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const data = await saveAgentModel(apiBaseUrl, "");
      setCurrent(data?.modelId || "");
      setDraft(data?.modelId || "");
      notify(`Reset to env default (${data?.modelId}).`, "success");
    } catch (e) {
      notify(e?.message || "Failed to reset agent model.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const dirty = draft.trim() !== current.trim();
  const isDefault = current === defaultId;

  if (isLoading) return null;

  return (
    <div className="skr-card" style={{ padding: 20, marginBottom: 16 }}>
      <p className="skr-module-title">Agent Bedrock Model</p>
      <p style={{ fontSize: 11, color: "var(--skr-text-tertiary)", margin: "2px 0 12px" }}>
        Active model: <code>{current}</code> {isDefault ? "(env default)" : "(override)"}
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <select
          className="skr-flag-cohort"
          value={COMMON_MODELS.some((m) => m.id === draft) ? draft : ""}
          onChange={(e) => e.target.value && setDraft(e.target.value)}
          aria-label="Choose a preset agent model"
          style={{ flex: 1 }}
        >
          <option value="">— pick a preset —</option>
          {COMMON_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <input
        type="text"
        className="skr-flag-cohort"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Or paste a custom modelId / inference profile ARN"
        style={{ width: "100%", marginBottom: 10 }}
        aria-label="Custom Bedrock model id"
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="skr-btn-primary"
          onClick={handleSave}
          disabled={isSaving || !dirty || !draft.trim()}
          style={{ padding: "6px 14px", fontSize: 12 }}
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="skr-btn-ghost"
          onClick={handleReset}
          disabled={isSaving || isDefault}
          style={{ padding: "6px 14px", fontSize: 12 }}
        >
          Reset to env default
        </button>
      </div>
    </div>
  );
}
