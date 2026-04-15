import React, { useState, useEffect } from "react";
import { fetchDirectorUsage } from "../../services/operations";
import StatCard from "../../components/sakura/StatCard";

const WINDOWS = ["24h", "7d", "30d"];

function UsageBar({ label, value, maxValue }) {
  const pct = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
  return (
    <div className="skr-usage-bar-row">
      <span className="skr-usage-bar-label" title={label}>
        {label}
      </span>
      <div className="skr-usage-bar-track">
        <div className="skr-usage-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="skr-usage-bar-value">{value}</span>
    </div>
  );
}

/**
 * UsageDashboard — usage stats with window selector.
 * Props: { apiBaseUrl }
 */
export default function UsageDashboard({ apiBaseUrl }) {
  const [window, setWindow] = useState("24h");
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!apiBaseUrl) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetchDirectorUsage(apiBaseUrl, { window })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setIsLoading(false));
  }, [apiBaseUrl, window]);

  const byProvider = data?.byProvider || {};
  const byModel = data?.byModel || {};
  const providerEntries = Object.entries(byProvider);
  const modelEntries = Object.entries(byModel);
  const maxProvider = Math.max(1, ...providerEntries.map(([, v]) => v));
  const maxModel = Math.max(1, ...modelEntries.map(([, v]) => v));

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="skr-section-header">
        <p className="skr-section-title">Usage</p>
        <div style={{ display: "flex", gap: 4 }}>
          {WINDOWS.map((w) => (
            <button
              key={w}
              className={`skr-chip${window === w ? " accent" : ""}`}
              style={{
                cursor: "pointer",
                background: window === w ? "rgba(255,107,157,0.2)" : "rgba(255,107,157,0.06)",
                border: "none",
                fontSize: 11,
              }}
              onClick={() => setWindow(w)}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className="skr-stat-grid">
        <StatCard
          label="Total USD"
          value={data?.totalUsd != null ? `$${Number(data.totalUsd).toFixed(2)}` : "—"}
          isLoading={isLoading}
        />
        <StatCard label="Job Count" value={data?.jobCount ?? "—"} isLoading={isLoading} />
        <StatCard
          label="Failure Rate"
          value={data?.failureRate != null ? `${Math.round(data.failureRate * 100)}%` : "—"}
          isLoading={isLoading}
        />
      </div>
      {providerEntries.length > 0 && (
        <div className="skr-card" style={{ padding: 16, marginBottom: 12 }}>
          <p className="skr-module-title">By Provider</p>
          {providerEntries.map(([k, v]) => (
            <UsageBar key={k} label={k} value={v} maxValue={maxProvider} />
          ))}
        </div>
      )}
      {modelEntries.length > 0 && (
        <div className="skr-card" style={{ padding: 16 }}>
          <p className="skr-module-title">By Model</p>
          {modelEntries.map(([k, v]) => (
            <UsageBar key={k} label={k} value={v} maxValue={maxModel} />
          ))}
        </div>
      )}
    </div>
  );
}
