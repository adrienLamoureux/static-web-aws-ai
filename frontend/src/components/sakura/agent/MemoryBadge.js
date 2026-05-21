/**
 * MemoryBadge — tiny pill that shows whether the agent has persistent memory
 * for the current user. Calls /api/agent/memory/status once on mount.
 */

import React, { useEffect, useState } from "react";
import { useConfig } from "../../../contexts/ConfigContext";
import { useAuth } from "../../../contexts/AuthContext";
import { buildApiUrl, fetchJson } from "../../../services/apiClient";
import { AGENT_MEMORY_STATUS } from "../../../constants/api-routes";

export default function MemoryBadge() {
  const { apiBaseUrl } = useConfig();
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState({ loading: true, hasMemory: false, turnCount: 0 });

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) {
      setStatus({ loading: false, hasMemory: false, turnCount: 0 });
      return undefined;
    }
    fetchJson(buildApiUrl(apiBaseUrl, AGENT_MEMORY_STATUS), {})
      .then((data) => {
        if (cancelled) return;
        setStatus({
          loading: false,
          hasMemory: Boolean(data?.hasMemory),
          turnCount: Number(data?.turnCount) || 0,
        });
      })
      .catch(() => {
        if (!cancelled) setStatus({ loading: false, hasMemory: false, turnCount: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, isAuthenticated]);

  if (!isAuthenticated || status.loading) return null;

  return (
    <span
      className={`skr-memory-badge${status.hasMemory ? " is-active" : " is-empty"}`}
      title={
        status.hasMemory
          ? `Hiyori remembers ${status.turnCount} prior turn${status.turnCount === 1 ? "" : "s"}`
          : "No saved agent memory yet"
      }
      aria-label={status.hasMemory ? "Memory active" : "No memory"}
    >
      <span aria-hidden="true">◆</span>
      <span className="skr-memory-badge-text">
        {status.hasMemory ? `${status.turnCount}` : "fresh"}
      </span>
    </span>
  );
}
