import React, { useCallback, useEffect, useState } from "react";
import { useConfig } from "../contexts/ConfigContext";
import { fetchDirectorOverview } from "../services/operations";

import SanctumSubNav from "../components/sakura/sanctum/SanctumSubNav";
import StatCard from "../components/sakura/StatCard";
import usePollingRefresh from "../components/sakura/usePollingRefresh";

import StorySessions from "./director/StorySessions";
import JobQueue from "./director/JobQueue";
import MasonrySection from "./director/MasonrySection";
import CharactersSection from "./director/characters/CharactersSection";
import UsageDashboard from "./director/UsageDashboard";
import ConfigEditor from "./director/ConfigEditor";
import CompanionSection from "./director/CompanionSection";
import ThemeSection from "./director/ThemeSection";
import SoundModuleCard from "./director/SoundModuleCard";
import ModerationSection from "./director/ModerationSection";
import FeatureFlagsSection from "./director/FeatureFlagsSection";

export default function Director() {
  const { apiBaseUrl } = useConfig();
  const [overview, setOverview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadOverview = useCallback(async () => {
    if (!apiBaseUrl) {
      setLoadError("API base URL is not configured.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError("");
    try {
      const payload = await fetchDirectorOverview(apiBaseUrl);
      setOverview(payload);
    } catch (error) {
      setLoadError(error?.message || "Failed to load director data.");
    } finally {
      setIsLoading(false);
      setLastUpdated(Date.now());
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    setOverview(null);
    if (!apiBaseUrl) {
      setLoadError("API base URL is not configured.");
      setIsLoading(false);
      return;
    }
    loadOverview();
  }, [apiBaseUrl, loadOverview]);

  usePollingRefresh(loadOverview, { intervalMs: 15000 });

  const summary = {
    queued: Number(overview?.summary?.queued || 0),
    running: Number(overview?.summary?.running || 0),
    completed: Number(overview?.summary?.completed || 0),
    failed: Number(overview?.summary?.failed || 0),
    queueDepth: Number(overview?.summary?.queueDepth || 0),
  };

  return (
    <div>
      <SanctumSubNav />

      <div
        className="skr-page-header"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <div>
          <h2 className="skr-page-title">Global Command Center</h2>
          <p className="skr-page-subtitle">Director overview and orchestration controls</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: "var(--skr-text-tertiary)" }}>
              Updated {Math.round((Date.now() - lastUpdated) / 1000)}s ago
            </span>
          )}
          <button
            className="skr-btn-secondary"
            onClick={loadOverview}
            disabled={isLoading}
            style={{ fontSize: 12 }}
          >
            {isLoading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {loadError && (
        <div
          style={{
            padding: "10px 14px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            color: "#ef4444",
          }}
        >
          {loadError}
        </div>
      )}

      {/* Usage dashboard */}
      <UsageDashboard apiBaseUrl={apiBaseUrl} />

      {/* Summary stat cards */}
      <div className="skr-stat-grid">
        {[
          { label: "Queued", value: summary.queued },
          { label: "Running", value: summary.running },
          { label: "Completed", value: summary.completed },
          { label: "Failed", value: summary.failed },
          { label: "Queue Depth", value: summary.queueDepth },
        ].map(({ label, value }) => (
          <StatCard key={label} label={label} value={value} isLoading={isLoading} />
        ))}
      </div>

      {/* Config editor */}
      <ConfigEditor
        apiBaseUrl={apiBaseUrl}
        config={overview?.config}
        options={overview?.options}
        isLoading={isLoading}
        onRefresh={loadOverview}
      />

      {/* Module panels */}
      <div className="skr-module-grid">
        <CompanionSection apiBaseUrl={apiBaseUrl} />
        <ThemeSection apiBaseUrl={apiBaseUrl} />
        <SoundModuleCard
          soundModule={overview?.modules?.sound}
          isLoading={isLoading}
          apiBaseUrl={apiBaseUrl}
          onRefresh={loadOverview}
        />
        <FeatureFlagsSection apiBaseUrl={apiBaseUrl} />
      </div>

      {/* Story Sessions browser */}
      <StorySessions
        apiBaseUrl={apiBaseUrl}
        sessions={overview?.sessions || []}
        isLoading={isLoading}
        onRefresh={loadOverview}
      />

      {/* Job Queue */}
      <JobQueue
        apiBaseUrl={apiBaseUrl}
        jobs={overview?.jobs || []}
        isLoading={isLoading}
        onRefresh={loadOverview}
      />

      {/* Masonry portraits */}
      <MasonrySection apiBaseUrl={apiBaseUrl} />

      {/* Moderation */}
      <ModerationSection apiBaseUrl={apiBaseUrl} />

      {/* Characters & LoRA management */}
      <CharactersSection
        apiBaseUrl={apiBaseUrl}
        imageModels={overview?.options?.generation?.imageModels || []}
        videoModels={overview?.options?.generation?.videoModels || []}
      />
    </div>
  );
}
