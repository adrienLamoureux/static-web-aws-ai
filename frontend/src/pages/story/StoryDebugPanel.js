import React from "react";

export function StorySessionDebugPanel({
  activeSessionDetail,
  storyDebugEnabled,
  setStoryDebugEnabled,
  storyDebugView,
  setStoryDebugView,
}) {
  if (!activeSessionDetail) {
    return null;
  }

  return (
    <details className="story-v3-disclosure story-v3-disclosure--debug">
      <summary className="story-v3-disclosure-summary">
        <span>Story debug</span>
        <span className="story-v3-disclosure-meta">
          {storyDebugEnabled ? "enabled" : "disabled"}
        </span>
      </summary>
      <div className="story-v3-debug-header">
        <label className="story-v3-toggle">
          <input
            type="checkbox"
            checked={storyDebugEnabled}
            onChange={(event) => setStoryDebugEnabled(event.target.checked)}
          />
          Show
        </label>
        <select
          className="story-v3-select story-v3-debug-select"
          value={storyDebugView}
          onChange={(event) => setStoryDebugView(event.target.value)}
        >
          <option value="state">State</option>
          <option value="lorebook">Lorebook</option>
          <option value="both">Both</option>
        </select>
      </div>
      {storyDebugEnabled && (
        <div className="story-v3-debug-body">
          {(storyDebugView === "state" || storyDebugView === "both") && (
            <>
              <p className="story-v3-debug-label">State</p>
              <pre className="story-v3-debug-code">
                {JSON.stringify(activeSessionDetail.storyState || {}, null, 2)}
              </pre>
            </>
          )}
          {(storyDebugView === "lorebook" || storyDebugView === "both") && (
            <>
              <p className="story-v3-debug-label">Lorebook</p>
              <pre className="story-v3-debug-code">
                {JSON.stringify(activeSessionDetail.lorebook || {}, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </details>
  );
}

export function SceneDebugPanel({ scene }) {
  return (
    <details className="story-v3-disclosure story-v3-disclosure--scene-debug">
      <summary className="story-v3-disclosure-summary">
        <span>Scene debug payload</span>
        <span className="story-v3-disclosure-meta">{scene.sceneId || "scene"}</span>
      </summary>
      <div className="story-v3-debug-body">
        <p className="story-v3-debug-line">
          <span className="story-v3-debug-label">Scene prompt:</span> {scene.prompt || "—"}
        </p>
        <p className="story-v3-debug-line">
          <span className="story-v3-debug-label">Scene environment:</span>{" "}
          {scene.sceneEnvironment || "—"}
        </p>
        <p className="story-v3-debug-line">
          <span className="story-v3-debug-label">Scene action:</span> {scene.sceneAction || "—"}
        </p>
        <p className="story-v3-debug-line">
          <span className="story-v3-debug-label">Positive prompt:</span>{" "}
          {scene.promptPositive || "—"}
        </p>
        <p className="story-v3-debug-line">
          <span className="story-v3-debug-label">Negative prompt:</span>{" "}
          {scene.promptNegative || "—"}
        </p>

        {scene.debug?.context && (
          <>
            <p className="story-v3-debug-line">
              <span className="story-v3-debug-label">Context mode:</span>{" "}
              {scene.debug.context.mode || "—"}
            </p>
            <p className="story-v3-debug-line">
              <span className="story-v3-debug-label">Context summary:</span>{" "}
              {scene.debug.context.summary || "—"}
            </p>
            <p className="story-v3-debug-line">
              <span className="story-v3-debug-label">Context latest:</span>{" "}
              {scene.debug.context.latest || "—"}
            </p>
            <p className="story-v3-debug-line">
              <span className="story-v3-debug-label">Context recent:</span>{" "}
              {scene.debug.context.recent || "—"}
            </p>
          </>
        )}

        {scene.debug?.replicate?.input && (
          <pre className="story-v3-debug-code">
            {JSON.stringify(scene.debug.replicate.input, null, 2)}
          </pre>
        )}
      </div>
    </details>
  );
}
