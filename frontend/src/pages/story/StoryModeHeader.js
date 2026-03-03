import React from "react";
import { STORY_VIEW_MODE } from "./constants";

function StoryModeHeader({ isDirectorMode, setStoryViewMode }) {
  return (
    <header className="story-v3-header">
      <p className="story-v3-kicker">Whisk Studio</p>
      <h1 className="story-v3-title">Storytelling Studio</h1>
      <p className="story-v3-subtitle">
        A living illustrated novel. Move between Reader mode and Director mode.
      </p>
      <div className="story-v3-modebar">
        <div className="story-v3-mode-switch" role="tablist" aria-label="Story mode">
          <button
            type="button"
            className={`story-v3-mode-button ${!isDirectorMode ? "is-active" : ""}`}
            onClick={() => setStoryViewMode(STORY_VIEW_MODE.READER)}
            role="tab"
            aria-selected={!isDirectorMode}
          >
            Reader
          </button>
          <button
            type="button"
            className={`story-v3-mode-button ${isDirectorMode ? "is-active" : ""}`}
            onClick={() => setStoryViewMode(STORY_VIEW_MODE.DIRECTOR)}
            role="tab"
            aria-selected={isDirectorMode}
          >
            Director
          </button>
        </div>
        <p className="story-v3-mode-copy">
          {isDirectorMode
            ? "Advanced controls: presets, scene regeneration, context tuning, and debug tools."
            : "Immersive reading: focus on story flow and visuals without setup clutter."}
        </p>
      </div>
    </header>
  );
}

export default StoryModeHeader;
