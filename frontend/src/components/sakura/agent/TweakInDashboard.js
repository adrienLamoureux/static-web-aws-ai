/**
 * TweakInDashboard — flips the user back to Dashboard mode and drops them
 * into Forge with the agent's prompt + style + aspect pre-filled via URL
 * params. Lossless — they get the exact prompt to refine in the Atelier form.
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { useMode } from "../../../lib/mode/ModeContext";

export default function TweakInDashboard({ payload }) {
  const navigate = useNavigate();
  const { setMode } = useMode();

  if (!payload?.prompt) return null;

  const handleClick = () => {
    setMode("dashboard");
    const params = new URLSearchParams({ tab: "images", prompt: payload.prompt });
    if (payload.aspect) params.set("aspect", payload.aspect);
    if (payload.style) params.set("style", payload.style);
    if (payload.seed != null) params.set("seed", String(payload.seed));
    if (payload.width && payload.height) {
      params.set("width", String(payload.width));
      params.set("height", String(payload.height));
    }
    navigate(`/atelier?${params.toString()}`);
  };

  return (
    <button type="button" className="skr-btn-tweak" onClick={handleClick}>
      ◈ Tweak in Atelier
    </button>
  );
}
