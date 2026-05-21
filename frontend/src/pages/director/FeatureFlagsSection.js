import React, { useState, useEffect } from "react";
import { fetchFeatureFlags, saveFeatureFlags } from "../../services/operations";
import { useNotify } from "../../components/sakura/NotificationStack";

const FLAG_LABELS = {
  enableStoryAnimations: {
    label: "Story Animations",
    description: "Allow scene animation generation in Chronicle",
  },
  enableCivitaiSync: {
    label: "CivitAI Sync",
    description: "Allow syncing LoRA models from CivitAI",
  },
  enableNovaReelVideos: {
    label: "Nova Reel Videos",
    description: "Allow Bedrock Nova Reel video generation",
  },
  enableCompanionInitiative: {
    label: "Companion Initiative",
    description: "Companion proactively starts conversations",
  },
  agentMode: {
    label: "Agent Mode",
    description: "Route-scoped agent UI on /atelier. Cohort-scopable.",
    cohort: true,
  },
};

// Cohort options for cohort-scoped flags. Values match backend
// VALID_COHORTS + the boolean alternatives.
const COHORT_OPTIONS = [
  { value: "false", label: "Off" },
  { value: "admin", label: "Admins only" },
  { value: "beta", label: "Beta cohort" },
  { value: "all", label: "Everyone" },
];

// Map a stored flag value (boolean | cohort string) to the dropdown's value.
const valueToOption = (raw) => {
  if (raw === false) return "false";
  if (raw === true || raw === "all") return "all";
  if (typeof raw === "string" && ["admin", "beta"].includes(raw)) return raw;
  return "all";
};

// Map a dropdown value back to what we send to the backend.
const optionToValue = (opt) => {
  if (opt === "false") return false;
  if (opt === "all") return true; // legacy boolean — saveFlags supports both
  return opt; // "admin" | "beta"
};

/**
 * FeatureFlagsSection — toggle feature flags. Boolean flags render as a
 * pill toggle; flags marked `cohort: true` render as a 4-option dropdown
 * for gradual rollout (off / admin / beta / everyone).
 */
export default function FeatureFlagsSection({ apiBaseUrl }) {
  const notify = useNotify();
  const [flags, setFlags] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!apiBaseUrl) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetchFeatureFlags(apiBaseUrl)
      .then((data) => setFlags(data?.flags || data || {}))
      .catch((e) => notify(e?.message || "Failed to load feature flags.", "error"))
      .finally(() => setIsLoading(false));
  }, [apiBaseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = async (next) => {
    const prev = flags;
    setFlags(next);
    try {
      await saveFeatureFlags(apiBaseUrl, { flags: next });
    } catch (e) {
      setFlags(prev);
      notify(e?.message || "Failed to save feature flags.", "error");
      throw e;
    }
  };

  const handleToggle = async (key) => {
    const updated = { ...flags, [key]: !flags[key] };
    try {
      await persist(updated);
      notify(
        `${FLAG_LABELS[key]?.label || key} ${updated[key] ? "enabled" : "disabled"}.`,
        "success"
      );
    } catch {
      // already reverted in persist
    }
  };

  const handleCohortChange = async (key, opt) => {
    const updated = { ...flags, [key]: optionToValue(opt) };
    try {
      await persist(updated);
      notify(`${FLAG_LABELS[key]?.label || key} scope → ${opt}.`, "success");
    } catch {
      // already reverted
    }
  };

  if (isLoading) return null;

  return (
    <div className="skr-card" style={{ padding: 20, marginBottom: 16 }}>
      <p className="skr-module-title">Feature Flags</p>
      {Object.entries(FLAG_LABELS).map(([key, meta]) => (
        <div key={key} className="skr-flag-row">
          <div>
            <p
              style={{ fontSize: 13, fontWeight: 600, color: "var(--skr-text-primary)", margin: 0 }}
            >
              {meta.label}
            </p>
            <p style={{ fontSize: 11, color: "var(--skr-text-tertiary)", margin: "2px 0 0" }}>
              {meta.description}
            </p>
          </div>
          {meta.cohort ? (
            <select
              className="skr-flag-cohort"
              value={valueToOption(flags[key])}
              onChange={(e) => handleCohortChange(key, e.target.value)}
              aria-label={`Scope ${meta.label}`}
            >
              {COHORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <button
              className={`skr-flag-toggle ${flags[key] ? "on" : "off"}`}
              onClick={() => handleToggle(key)}
              aria-label={`Toggle ${meta.label}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
