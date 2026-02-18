import React from "react";
import {
  ILLUSTRATION_CONTEXT_OPTIONS,
  STORY_GROUP_TYPES,
  STORY_ILLUSTRATION_MODEL_OPTIONS,
} from "./constants";
import { formatStamp } from "./storyDirectorUtils";
import { SceneDebugPanel } from "./StoryDebugPanel";
import StoryContinuityCenter from "./StoryContinuityCenter";
import useStoryDirectorBoard from "./useStoryDirectorBoard";

const formatAnimationStatus = (value = "") => {
  const normalized = (value || "").toLowerCase();
  if (!normalized) return "";
  if (normalized === "starting") return "Animation queued...";
  if (normalized === "processing") return "Animation rendering...";
  if (normalized === "succeeded") return "Animation ready";
  if (normalized === "failed") return "Animation failed";
  if (normalized === "canceled") return "Animation canceled";
  return `Animation ${normalized}`;
};

function StoryDirectorIllustrations({
  scenes,
  messages,
  input,
  activeSessionId,
  activeSessionDetail,
  status,
  illustrationContextMode,
  setIllustrationContextMode,
  illustrationModel,
  setIllustrationModel,
  animationPrompt,
  setAnimationPrompt,
  illustrationDebugEnabled,
  setIllustrationDebugEnabled,
  triggerIllustration,
  triggerSceneAnimation,
  isSceneGenerating,
  isSceneAnimating,
}) {
  const {
    groupType,
    setGroupType,
    currentBoard,
    sortedScenes,
    visibleScenes,
    activeGroupId,
    groupCounts,
    handleSelectGroup,
    handleCreateGroup,
    handleAssignSceneGroup,
    setSceneRef,
    handleJumpToScene,
  } = useStoryDirectorBoard(activeSessionId, scenes);

  return (
    <>
      <StoryContinuityCenter
        scenes={scenes}
        messages={messages}
        input={input}
        activeSessionDetail={activeSessionDetail}
        illustrationContextMode={illustrationContextMode}
      />

      <div className="story-production-board glass-panel">
        <div className="story-production-header">
          <h3 className="story-section-title">Production board</h3>
          <button
            type="button"
            className="btn-ghost px-3 py-1 text-xs"
            onClick={handleCreateGroup}
            disabled={!activeSessionId}
          >
            + New {STORY_GROUP_TYPES.find((item) => item.value === groupType)?.label}
          </button>
        </div>

        <div className="story-group-type-row" role="tablist" aria-label="Grouping type">
          {STORY_GROUP_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              className={`story-group-type ${groupType === type.value ? "is-active" : ""}`}
              onClick={() => setGroupType(type.value)}
              role="tab"
              aria-selected={groupType === type.value}
            >
              {type.label}
            </button>
          ))}
        </div>

        <div className="story-folder-row">
          <button
            type="button"
            className={`story-folder-chip ${activeGroupId === "all" ? "is-active" : ""}`}
            onClick={() => handleSelectGroup("all")}
          >
            All scenes ({sortedScenes.length})
          </button>
          {currentBoard.groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={`story-folder-chip ${activeGroupId === group.id ? "is-active" : ""}`}
              onClick={() => handleSelectGroup(group.id)}
            >
              {group.name} ({groupCounts[group.id] || 0})
            </button>
          ))}
        </div>

        <div className="story-timeline-strip" role="navigation" aria-label="Scene timeline">
          {sortedScenes.map((scene, index) => {
            const assignedGroupId = currentBoard.assignments[scene.sceneId];
            const assignedGroup = currentBoard.groups.find((group) => group.id === assignedGroupId);
            const muted = activeGroupId !== "all" && assignedGroupId !== activeGroupId;

            return (
              <button
                key={scene.sceneId}
                type="button"
                className={`story-timeline-chip ${muted ? "is-muted" : ""}`}
                onClick={() => handleJumpToScene(scene.sceneId, assignedGroupId)}
              >
                <span className="story-timeline-step">S{index + 1}</span>
                <span className="story-timeline-title">{scene.title || "Scene beat"}</span>
                <span className="story-timeline-meta">
                  {assignedGroup?.name || "Unsorted"} · {formatStamp(scene.createdAt)}
                </span>
              </button>
            );
          })}
          {sortedScenes.length === 0 && (
            <p className="story-empty">No scenes yet. Continue the story to populate the board.</p>
          )}
        </div>
      </div>

      <div className="story-scenes-header">
        <h2 className="story-section-title">Illustrations</h2>
        <span className="story-scenes-meta">
          {visibleScenes.length} / {scenes.length} scene{scenes.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="story-scenes-controls">
        <label className="story-scenes-label" htmlFor="story-context-mode">
          Illustration context
        </label>
        <select
          id="story-context-mode"
          className="field-select story-scenes-select"
          value={illustrationContextMode}
          onChange={(event) => setIllustrationContextMode(event.target.value)}
        >
          {ILLUSTRATION_CONTEXT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="story-scenes-label" htmlFor="story-illustration-model">
          Illustration model
        </label>
        <select
          id="story-illustration-model"
          className="field-select story-scenes-select"
          value={illustrationModel}
          onChange={(event) => setIllustrationModel(event.target.value)}
        >
          {STORY_ILLUSTRATION_MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="story-scenes-label" htmlFor="story-animation-prompt">
          Animation prompt
        </label>
        <input
          id="story-animation-prompt"
          className="field-input story-scenes-text"
          value={animationPrompt}
          onChange={(event) => setAnimationPrompt(event.target.value)}
          placeholder="A lot of movements"
          maxLength={240}
        />
        <label className="story-scenes-toggle">
          <input
            type="checkbox"
            checked={illustrationDebugEnabled}
            onChange={(event) => setIllustrationDebugEnabled(event.target.checked)}
          />
          Include debug data
        </label>
      </div>

      <div className="story-scene-grid">
        {visibleScenes.length === 0 && (
          <div className="story-empty">
            {activeGroupId === "all"
              ? "No illustrations yet. Keep chatting to unlock scene beats."
              : "No scenes in this folder yet. New scene beats will save here while this folder is active."}
          </div>
        )}

        {visibleScenes.map((scene) => {
          const generating = isSceneGenerating(scene.sceneId);
          const animating = isSceneAnimating(scene.sceneId);
          const animationStatusLabel = formatAnimationStatus(scene.videoStatus);
          const assignedGroupId = currentBoard.assignments[scene.sceneId] || "";

          return (
            <div
              key={scene.sceneId}
              className="story-scene-item"
              ref={(node) => setSceneRef(scene.sceneId, node)}
            >
              <div className="story-scene-card">
                {scene.imageUrl ? (
                  <>
                    <img src={scene.imageUrl} alt={scene.title || "Scene"} />
                    <div className="story-scene-actions">
                      <button
                        type="button"
                        className="story-scene-regenerate"
                        onClick={() =>
                          triggerIllustration(activeSessionId, scene.sceneId, {
                            regenerate: true,
                          })
                        }
                        disabled={generating || status === "sending"}
                      >
                        {generating ? "Rendering..." : "Regenerate"}
                      </button>
                      <button
                        type="button"
                        className="story-scene-animate"
                        onClick={() =>
                          triggerSceneAnimation(activeSessionId, scene.sceneId, {
                            prompt: animationPrompt,
                          })
                        }
                        disabled={
                          generating ||
                          animating ||
                          status === "sending" ||
                          !scene.imageKey
                        }
                      >
                        {animating ? "Animating..." : "Animate"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="story-scene-placeholder">
                    <span>
                      {generating ? "Rendering illustration..." : "Illustration pending"}
                    </span>
                    <button
                      type="button"
                      className="story-scene-generate"
                      onClick={() => triggerIllustration(activeSessionId, scene.sceneId)}
                      disabled={status === "sending" || generating}
                    >
                      {generating ? "Rendering..." : "Generate"}
                    </button>
                  </div>
                )}

                <div className="story-scene-overlay">
                  <p className="story-scene-title">{scene.title || "Scene beat"}</p>
                  <p className="story-scene-description">{scene.description}</p>
                </div>
              </div>

              {(scene.videoUrl || animationStatusLabel) && (
                <div className="story-scene-video">
                  {scene.videoUrl ? (
                    <video controls preload="metadata" src={scene.videoUrl} />
                  ) : (
                    <p className="story-scene-video-status">{animationStatusLabel}</p>
                  )}
                  {scene.videoUrl && animationStatusLabel && (
                    <p className="story-scene-video-status">{animationStatusLabel}</p>
                  )}
                </div>
              )}

              <div className="story-scene-row">
                <label className="story-scenes-label" htmlFor={`scene-group-${scene.sceneId}`}>
                  Folder
                </label>
                <select
                  id={`scene-group-${scene.sceneId}`}
                  className="field-select story-scene-folder-select"
                  value={assignedGroupId}
                  onChange={(event) => handleAssignSceneGroup(scene.sceneId, event.target.value)}
                >
                  <option value="" disabled>
                    Select folder
                  </option>
                  {currentBoard.groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>

              {illustrationDebugEnabled && <SceneDebugPanel scene={scene} />}
            </div>
          );
        })}
      </div>
    </>
  );
}

export default StoryDirectorIllustrations;
