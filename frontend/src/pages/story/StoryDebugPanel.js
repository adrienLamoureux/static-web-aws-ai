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
    <div className="story-session-debug">
      <div className="story-session-debug-header">
        <p className="story-debug-title">Story debug</p>
        <label className="story-scenes-toggle">
          <input
            type="checkbox"
            checked={storyDebugEnabled}
            onChange={(event) => setStoryDebugEnabled(event.target.checked)}
          />
          Show
        </label>
        <select
          className="field-select story-session-debug-select"
          value={storyDebugView}
          onChange={(event) => setStoryDebugView(event.target.value)}
        >
          <option value="state">State</option>
          <option value="lorebook">Lorebook</option>
          <option value="both">Both</option>
        </select>
      </div>
      {storyDebugEnabled && (
        <div className="story-session-debug-body">
          {(storyDebugView === "state" || storyDebugView === "both") && (
            <>
              <p className="story-debug-label">State</p>
              <pre className="story-debug-code">
                {JSON.stringify(activeSessionDetail.storyState || {}, null, 2)}
              </pre>
            </>
          )}
          {(storyDebugView === "lorebook" || storyDebugView === "both") && (
            <>
              <p className="story-debug-label">Lorebook</p>
              <pre className="story-debug-code">
                {JSON.stringify(activeSessionDetail.lorebook || {}, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SceneDebugPanel({ scene }) {
  return (
    <div className="story-scene-debug">
      <p className="story-debug-title">Debug</p>
      <p className="story-debug-line">
        <span className="story-debug-label">Scene prompt:</span> {scene.prompt || "—"}
      </p>
      <p className="story-debug-line">
        <span className="story-debug-label">Scene environment:</span>{" "}
        {scene.sceneEnvironment || "—"}
      </p>
      <p className="story-debug-line">
        <span className="story-debug-label">Scene action:</span> {scene.sceneAction || "—"}
      </p>
      <p className="story-debug-line">
        <span className="story-debug-label">Positive prompt:</span>{" "}
        {scene.promptPositive || "—"}
      </p>
      <p className="story-debug-line">
        <span className="story-debug-label">Negative prompt:</span>{" "}
        {scene.promptNegative || "—"}
      </p>

      {scene.debug?.context && (
        <>
          <p className="story-debug-line">
            <span className="story-debug-label">Context mode:</span>{" "}
            {scene.debug.context.mode || "—"}
          </p>
          <p className="story-debug-line">
            <span className="story-debug-label">Context summary:</span>{" "}
            {scene.debug.context.summary || "—"}
          </p>
          <p className="story-debug-line">
            <span className="story-debug-label">Context latest:</span>{" "}
            {scene.debug.context.latest || "—"}
          </p>
          <p className="story-debug-line">
            <span className="story-debug-label">Context recent:</span>{" "}
            {scene.debug.context.recent || "—"}
          </p>
        </>
      )}

      {scene.debug?.replicate?.input && (
        <pre className="story-debug-code">
          {JSON.stringify(scene.debug.replicate.input, null, 2)}
        </pre>
      )}
    </div>
  );
}
