/**
 * AgentCostSection — Sanctum admin view of per-user Bedrock token spend on
 * Agent mode. Backed by GET /api/admin/agent/cost which scans the
 * `AGENT#COST` records across users and returns the top N by total tokens.
 *
 * Cost columns are calculated client-side using a rough Claude Haiku 4.5
 * price (input $0.80 / Mtok, output $4.00 / Mtok) — admin can adjust the
 * constants here if the model changes. This is a budget-monitoring view,
 * not billing — accuracy is "good enough to spot outliers."
 */

import React, { useState, useEffect, useCallback } from "react";
import { fetchAgentCost } from "../../services/operations";
import { useNotify } from "../../components/sakura/NotificationStack";

// Rough Claude Haiku 4.5 pricing (per million tokens) — adjust if model changes
const INPUT_USD_PER_MTOK = 0.8;
const OUTPUT_USD_PER_MTOK = 4.0;

const formatCost = (inputTokens, outputTokens) => {
  const usd = (inputTokens * INPUT_USD_PER_MTOK + outputTokens * OUTPUT_USD_PER_MTOK) / 1_000_000;
  if (usd < 0.001) return "<$0.001";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
};

const formatTokens = (n) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

const truncateId = (id) =>
  id && id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id || "(anon)";

export default function AgentCostSection({ apiBaseUrl }) {
  const notify = useNotify();
  const [data, setData] = useState({ items: [], scannedCount: 0, truncated: false });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    if (!apiBaseUrl) return;
    setIsLoading(true);
    setError(null);
    fetchAgentCost(apiBaseUrl, { limit: 50 })
      .then((d) => setData(d || { items: [] }))
      .catch((e) => {
        setError(e?.message || "Failed to load cost telemetry.");
        notify(e?.message || "Failed to load cost telemetry.", "error");
      })
      .finally(() => setIsLoading(false));
  }, [apiBaseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  const total = data.items.reduce(
    (acc, it) => {
      acc.inputTokens += it.inputTokens || 0;
      acc.outputTokens += it.outputTokens || 0;
      acc.turnCount += it.turnCount || 0;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, turnCount: 0 }
  );

  return (
    <div className="skr-card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p className="skr-module-title" style={{ margin: 0 }}>
          Agent Cost (top {data.items.length})
        </p>
        <button type="button" className="skr-btn-ghost" onClick={load} disabled={isLoading}>
          {isLoading ? "…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <p style={{ color: "var(--skr-accent-warning)", fontSize: 12, marginTop: 8 }}>⚠ {error}</p>
      ) : null}

      {isLoading && data.items.length === 0 ? (
        <p style={{ color: "var(--skr-text-tertiary)", fontSize: 12, marginTop: 8 }}>Loading…</p>
      ) : data.items.length === 0 ? (
        <p style={{ color: "var(--skr-text-tertiary)", fontSize: 12, marginTop: 8 }}>
          No agent usage recorded yet.
        </p>
      ) : (
        <>
          <div className="skr-agent-cost-summary">
            <span>
              <strong>{formatTokens(total.inputTokens)}</strong> in ·{" "}
              <strong>{formatTokens(total.outputTokens)}</strong> out
            </span>
            <span>
              <strong>{total.turnCount}</strong> turns
            </span>
            <span>
              ≈ <strong>{formatCost(total.inputTokens, total.outputTokens)}</strong>
            </span>
          </div>

          <table className="skr-agent-cost-table">
            <thead>
              <tr>
                <th>User</th>
                <th>In</th>
                <th>Out</th>
                <th>Turns</th>
                <th>Est.</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.userId}>
                  <td title={it.userId}>{truncateId(it.userId)}</td>
                  <td>{formatTokens(it.inputTokens)}</td>
                  <td>{formatTokens(it.outputTokens)}</td>
                  <td>{it.turnCount}</td>
                  <td>{formatCost(it.inputTokens, it.outputTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.truncated ? (
            <p style={{ color: "var(--skr-text-tertiary)", fontSize: 11, marginTop: 6 }}>
              Truncated — scanned {data.scannedCount} records. Increase `limit` for more.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
