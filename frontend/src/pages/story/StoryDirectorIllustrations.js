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

const formatMusicStatus = (value = "", hasAudio = false) => {
  if (hasAudio) return "Soundtrack ready";
  const normalized = (value || "").toLowerCase();
  if (!normalized) return "";
  if (normalized === "starting") return "Soundtrack queued...";
  if (normalized === "processing") return "Soundtrack rendering...";
  if (normalized === "failed") return "Soundtrack failed";
  if (normalized === "canceled") return "Soundtrack canceled";
  return `Soundtrack ${normalized}`;
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
  musicPrompt,
  setMusicPrompt,
  illustrationDebugEnabled,
  setIllustrationDebugEnabled,
  triggerIllustration,
  triggerSceneAnimation,
  triggerSceneMusic,
  applyLibraryTrackToScene,
  setSceneLibraryTrackSelection,
  musicLibrary,
  sceneLibrarySelectionMap,
  isSceneGenerating,
  isSceneAnimating,
  isSceneGeneratingMusic,
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
    <div className="story-v3-director-layout">
      <section className="story-v3-director-region story-v3-director-region--continuity">
        <StoryContinuityCenter
          scenes={scenes}
          messages={messages}
          input={input}
          activeSessionDetail={activeSessionDetail}
          illustrationContextMode={illustrationContextMode}
        />
      </section>

      <section className="story-v3-director-region story-v3-director-region--board">
        <div className="story-v3-production-board">
          <div className="story-v3-production-header">
            <h3 className="story-v3-section-title">Production board</h3>
            <button
              type="button"
              className="story-v3-btn story-v3-btn--ghost story-v3-btn--small"
              onClick={handleCreateGroup}
              disabled={!activeSessionId}
            >
              + New {STORY_GROUP_TYPES.find((item) => item.value === groupType)?.label}
            </button>
          </div>

          <div className="story-v3-group-row" role="tablist" aria-label="Grouping type">
            {STORY_GROUP_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                className={`story-v3-chip-button ${groupType === type.value ? "is-active" : ""}`}
                onClick={() => setGroupType(type.value)}
                role="tab"
                aria-selected={groupType === type.value}
              >
                {type.label}
              </button>
            ))}
          </div>

          <div className="story-v3-folder-row">
            <button
              type="button"
              className={`story-v3-chip-button ${activeGroupId === "all" ? "is-active" : ""}`}
              onClick={() => handleSelectGroup("all")}
            >
              All scenes ({sortedScenes.length})
            </button>
            {currentBoard.groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`story-v3-chip-button ${activeGroupId === group.id ? "is-active" : ""}`}
                onClick={() => handleSelectGroup(group.id)}
              >
                {group.name} ({groupCounts[group.id] || 0})
              </button>
            ))}
          </div>

          <div className="story-v3-timeline-strip" role="navigation" aria-label="Scene timeline">
            {sortedScenes.map((scene, index) => {
              const assignedGroupId = currentBoard.assignments[scene.sceneId];
              const assignedGroup = currentBoard.groups.find((group) => group.id === assignedGroupId);
              const muted = activeGroupId !== "all" && assignedGroupId !== activeGroupId;

              return (
                <button
                  key={scene.sceneId}
                  type="button"
                  className={`story-v3-timeline-chip ${muted ? "is-muted" : ""}`}
                  onClick={() => handleJumpToScene(scene.sceneId, assignedGroupId)}
                >
                  <span className="story-v3-timeline-step">S{index + 1}</span>
                  <span className="story-v3-timeline-title">{scene.title || "Scene beat"}</span>
                  <span className="story-v3-timeline-meta">
                    {assignedGroup?.name || "Unsorted"} · {formatStamp(scene.createdAt)}
                  </span>
                </button>
              );
            })}
            {sortedScenes.length === 0 && (
              <p className="story-v3-empty">No scenes yet. Continue the story to populate the board.</p>
            )}
          </div>
        </div>
      </section>

      <section className="story-v3-director-region story-v3-director-region--scene-workflow">
        <div className="story-v3-scenes-headline">
          <h2 className="story-v3-section-title">Illustrations</h2>
          <span className="story-v3-scenes-meta">
            {visibleScenes.length} / {scenes.length} scene{scenes.length === 1 ? "" : "s"}
          </span>
        </div>

        <details className="story-v3-disclosure story-v3-disclosure--scene-settings">
          <summary className="story-v3-disclosure-summary">
            <span>Scene generation settings</span>
            <span className="story-v3-disclosure-meta">context, model, prompts, debug</span>
          </summary>
          <div className="story-v3-scenes-controls">
            <label className="story-v3-field" htmlFor="story-context-mode">
              <span className="story-v3-label">Illustration context</span>
              <select
                id="story-context-mode"
                className="story-v3-select"
                value={illustrationContextMode}
                onChange={(event) => setIllustrationContextMode(event.target.value)}
              >
                {ILLUSTRATION_CONTEXT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="story-v3-field" htmlFor="story-illustration-model">
              <span className="story-v3-label">Illustration model</span>
              <select
                id="story-illustration-model"
                className="story-v3-select"
                value={illustrationModel}
                onChange={(event) => setIllustrationModel(event.target.value)}
              >
                {STORY_ILLUSTRATION_MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="story-v3-field" htmlFor="story-animation-prompt">
              <span className="story-v3-label">Animation prompt</span>
              <input
                id="story-animation-prompt"
                className="story-v3-input"
                value={animationPrompt}
                onChange={(event) => setAnimationPrompt(event.target.value)}
                placeholder="A lot of movements"
                maxLength={240}
              />
            </label>
            <label className="story-v3-field" htmlFor="story-music-prompt">
              <span className="story-v3-label">Music prompt override</span>
              <input
                id="story-music-prompt"
                className="story-v3-input"
                value={musicPrompt}
                onChange={(event) => setMusicPrompt(event.target.value)}
                placeholder="Leave empty for Haiku auto-direction"
                maxLength={240}
              />
            </label>
            <div className="story-v3-field story-v3-field--toggle">
              <span className="story-v3-label">Debug payload</span>
              <label className="story-v3-toggle">
                <input
                  type="checkbox"
                  checked={illustrationDebugEnabled}
                  onChange={(event) => setIllustrationDebugEnabled(event.target.checked)}
                />
                Include debug data
              </label>
            </div>
          </div>
        </details>

        <div className="story-v3-scene-grid">
          {visibleScenes.length === 0 && (
            <div className="story-v3-empty">
              {activeGroupId === "all"
                ? "No illustrations yet. Keep chatting to unlock scene beats."
                : "No scenes in this folder yet. New scene beats will save here while this folder is active."}
            </div>
          )}

          {visibleScenes.map((scene) => {
            const generating = isSceneGenerating(scene.sceneId);
            const animating = isSceneAnimating(scene.sceneId);
            const generatingMusic = isSceneGeneratingMusic(scene.sceneId);
            const animationStatusLabel = formatAnimationStatus(scene.videoStatus);
            const soundtrackReady = Boolean(scene.musicUrl);
            const musicStatusLabel = formatMusicStatus(
              scene.musicStatus,
              soundtrackReady
            );
            const assignedGroupId = currentBoard.assignments[scene.sceneId] || "";
            const selectedTrackId = sceneLibrarySelectionMap?.[scene.sceneId] || "";
            const canApplyTrack = Boolean(selectedTrackId);
            const recommendedTrackId = scene.recommendedTrackId || "";
            const recommendedTrack = musicLibrary.find(
              (track) => track.trackId === recommendedTrackId
            );
            const hasRecommendation = Boolean(recommendedTrackId);
            const hasRecommendationScore =
              scene.recommendationScore !== null &&
              scene.recommendationScore !== "" &&
              typeof scene.recommendationScore !== "undefined";
            const recommendationPercent =
              hasRecommendationScore && Number.isFinite(Number(scene.recommendationScore))
                ? Math.round(Number(scene.recommendationScore) * 100)
                : null;

            return (
              <div
                key={scene.sceneId}
                className="story-v3-scene-item"
                ref={(node) => setSceneRef(scene.sceneId, node)}
              >
                <div className="story-v3-scene-card">
                  {scene.imageUrl ? (
                    <>
                      <img src={scene.imageUrl} alt={scene.title || "Scene"} />
                      <div className="story-v3-scene-actions">
                        <button
                          type="button"
                          className="story-v3-scene-action story-v3-scene-action--regenerate"
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
                          className="story-v3-scene-action story-v3-scene-action--animate"
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
                        <button
                          type="button"
                          className="story-v3-scene-action story-v3-scene-action--music"
                          onClick={() =>
                            triggerSceneMusic(activeSessionId, scene.sceneId, {
                              prompt: musicPrompt,
                            })
                          }
                          disabled={generatingMusic || status === "sending"}
                        >
                          {generatingMusic ? "Scoring..." : "Music"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="story-v3-scene-placeholder">
                      <span>
                        {generating ? "Rendering illustration..." : "Illustration pending"}
                      </span>
                      <button
                        type="button"
                        className="story-v3-btn story-v3-btn--primary story-v3-btn--small"
                        onClick={() => triggerIllustration(activeSessionId, scene.sceneId)}
                        disabled={status === "sending" || generating}
                      >
                        {generating ? "Rendering..." : "Generate"}
                      </button>
                    </div>
                  )}

                  <div className="story-v3-scene-overlay">
                    <p className="story-v3-scene-title">{scene.title || "Scene beat"}</p>
                    <p className="story-v3-scene-description">{scene.description}</p>
                  </div>
                </div>

                {(scene.videoUrl || animationStatusLabel) && (
                  <div className="story-v3-scene-video">
                    {scene.videoUrl ? (
                      <video controls preload="metadata" src={scene.videoUrl} />
                    ) : (
                      <p className="story-v3-scene-video-status">{animationStatusLabel}</p>
                    )}
                    {scene.videoUrl && animationStatusLabel && (
                      <p className="story-v3-scene-video-status">{animationStatusLabel}</p>
                    )}
                  </div>
                )}

                {musicStatusLabel && (
                  <div className="story-v3-scene-music">
                    <p className="story-v3-scene-music-status">{musicStatusLabel}</p>
                  </div>
                )}

                {musicLibrary.length > 0 && !soundtrackReady && (
                  <div className="story-v3-scene-row">
                    <label
                      className="story-v3-label"
                      htmlFor={`scene-music-library-${scene.sceneId}`}
                    >
                      Soundtrack library
                    </label>
                    <div className="story-v3-scene-library-row">
                      <select
                        id={`scene-music-library-${scene.sceneId}`}
                        className="story-v3-select"
                        value={selectedTrackId}
                        onChange={(event) =>
                          setSceneLibraryTrackSelection(
                            scene.sceneId,
                            event.target.value
                          )
                        }
                      >
                        <option value="">Select soundtrack</option>
                        {musicLibrary.map((track) => {
                          const isRecommendedTrack = track.trackId === recommendedTrackId;
                          return (
                            <option key={track.trackId} value={track.trackId}>
                              {track.title}
                              {track.mood ? ` · ${track.mood}` : ""}
                              {isRecommendedTrack ? " (recommended)" : ""}
                            </option>
                          );
                        })}
                      </select>
                      <button
                        type="button"
                        className="story-v3-btn story-v3-btn--ghost story-v3-btn--small"
                        onClick={() =>
                          applyLibraryTrackToScene(
                            activeSessionId,
                            scene.sceneId,
                            selectedTrackId
                          )
                        }
                        disabled={!canApplyTrack || status === "sending"}
                      >
                        Apply
                      </button>
                    </div>
                    {hasRecommendation && (
                      <p className="story-v3-scene-library-note">
                        Recommended: {recommendedTrack?.title || "Soundtrack"}
                        {recommendationPercent !== null ? ` (${recommendationPercent}%)` : ""}
                      </p>
                    )}
                  </div>
                )}

                <div className="story-v3-scene-row">
                  <label className="story-v3-label" htmlFor={`scene-group-${scene.sceneId}`}>
                    Folder
                  </label>
                  <select
                    id={`scene-group-${scene.sceneId}`}
                    className="story-v3-select"
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
      </section>
    </div>
  );
}

export default StoryDirectorIllustrations;
