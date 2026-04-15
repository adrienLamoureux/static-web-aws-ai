import React from "react";
import { useSearchParams } from "react-router-dom";
import Whisk from "./Whisk";
import WhiskVideos from "./WhiskVideos";

export default function Forge() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "videos" ? "videos" : "images";
  const prefilledPrompt = params.get("prompt") || "";

  return (
    <div>
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
      {tab === "videos" ? <WhiskVideos /> : <Whisk prefilledPrompt={prefilledPrompt} />}
    </div>
  );
}
