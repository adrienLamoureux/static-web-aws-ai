/**
 * HiyoriSuggestButton — "Let Hiyori choose" ghost button for a single Whisk
 * form field. POSTs to /api/agent/suggest, applies the returned value via
 * onValue(value).
 *
 * Renders compact (icon + label). Disabled while pending. Renders nothing
 * when the user isn't authenticated (the endpoint requires auth).
 */

import React, { useState } from "react";
import { useConfig } from "../../../contexts/ConfigContext";
import { useAuth } from "../../../contexts/AuthContext";
import { buildApiUrl, postJson } from "../../../services/apiClient";
import { AGENT_SUGGEST } from "../../../constants/api-routes";

export default function HiyoriSuggestButton({
  field,
  currentPrompt = "",
  onValue,
  label = "Hiyori",
  className = "",
}) {
  const { apiBaseUrl } = useConfig();
  const { isAuthenticated } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  if (!isAuthenticated) return null;

  const handleClick = async () => {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      const data = await postJson(buildApiUrl(apiBaseUrl, AGENT_SUGGEST), {
        field,
        context: { currentPrompt },
      });
      if (data?.value && typeof onValue === "function") onValue(data.value);
    } catch {
      setError(true);
      // Auto-clear error state so the user can retry
      window.setTimeout(() => setError(false), 2000);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      className={`skr-btn-hiyori-suggest ${className}`.trim()}
      onClick={handleClick}
      disabled={pending}
      title={`Let Hiyori pick a ${field}`}
      aria-busy={pending}
    >
      {error ? "✕" : pending ? "…" : "✦"} {label}
    </button>
  );
}
