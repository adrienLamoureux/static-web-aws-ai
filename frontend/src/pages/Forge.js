import React from "react";
import { useSearchParams } from "react-router-dom";
import Whisk from "./Whisk";
import WhiskVideos from "./WhiskVideos";
import { useMode } from "../lib/mode/ModeContext";
import AgentStage from "../components/sakura/agent/AgentStage";
import ModeToggle from "../components/sakura/agent/ModeToggle";

export default function Forge() {
  const [params, setParams] = useSearchParams();
  const { mode } = useMode();
  const tab = params.get("tab") === "videos" ? "videos" : "images";
  const prefilledPrompt = params.get("prompt") || "";
  const prefilledStyle = params.get("style") || "";
  const prefilledAspect = params.get("aspect") || "";
  const prefilledSeed = params.get("seed") || "";
  const prefilledWidth = params.get("width") || "";
  const prefilledHeight = params.get("height") || "";

  // ModeToggle is mounted in the same fixed top-right slot in both modes for
  // visual consistency. Agent mode renders the manga stage; Dashboard mode
  // renders the original form-based UI.
  if (mode === "agent") {
    return (
      <div className="skr-forge-agent-shell">
        <div className="skr-forge-mode-slot">
          <ModeToggle />
        </div>
        <AgentStage />
      </div>
    );
  }

  return (
    <div className="skr-forge-dashboard-shell">
      <div className="skr-forge-mode-slot">
        <ModeToggle />
      </div>
      <div className="skr-page-header" style={{ marginBottom: 12 }}>
        <h2 className="skr-page-title">Atelier</h2>
        <p className="skr-page-subtitle">Generate images and animate videos</p>
      </div>
      <div className="skr-tab-bar" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`skr-tab${tab === "images" ? " is-active" : ""}`}
          onClick={() => setParams({ tab: "images" })}
        >
          ◈ Images
        </button>
        <button
          type="button"
          className={`skr-tab${tab === "videos" ? " is-active" : ""}`}
          onClick={() => setParams({ tab: "videos" })}
        >
          ▶ Videos
        </button>
      </div>
      {tab === "videos" ? (
        <WhiskVideos />
      ) : (
        <Whisk
          prefilledPrompt={prefilledPrompt}
          prefilledStyle={prefilledStyle}
          prefilledAspect={prefilledAspect}
          prefilledSeed={prefilledSeed}
          prefilledWidth={prefilledWidth}
          prefilledHeight={prefilledHeight}
        />
      )}
    </div>
  );
}
