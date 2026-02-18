import React from "react";
import StoryDirectorIllustrations from "./StoryDirectorIllustrations";

const formatAnimationStatus = (value = "", hasVideo = false) => {
  if (hasVideo) return "Animation ready";
  const normalized = (value || "").toLowerCase();
  if (!normalized) return "";
  if (normalized === "starting") return "Animation queued...";
  if (normalized === "processing") return "Animation rendering...";
  if (normalized === "failed") return "Animation failed";
  if (normalized === "canceled") return "Animation canceled";
  return `Animation ${normalized}`;
};

function ReaderIllustrations({
  scenes,
  featuredScene,
  readerScenes,
  activeSessionId,
  status,
  triggerIllustration,
  triggerSceneAnimation,
  isSceneGenerating,
  isSceneAnimating,
}) {
  const canRunActions = Boolean(activeSessionId) && status !== "sending";
  const runRegenerate = (sceneId) => {
    if (!canRunActions || !sceneId) return;
    triggerIllustration(activeSessionId, sceneId, { regenerate: true });
  };
  const runAnimate = (sceneId) => {
    if (!canRunActions || !sceneId) return;
    triggerSceneAnimation(activeSessionId, sceneId);
  };

  return (
    <>
      <div className="story-scenes-header">
        <h2 className="story-section-title">Illustrated moments</h2>
        <span className="story-scenes-meta">
          {scenes.length} scene{scenes.length === 1 ? "" : "s"}
        </span>
      </div>

      {featuredScene ? (
        <div className="story-reader-feature">
          <div className="story-scene-card story-scene-card--feature">
            {featuredScene.imageUrl ? (
              <>
                <img
                  src={featuredScene.imageUrl}
                  alt={featuredScene.title || "Featured scene"}
                />
                <div className="story-scene-actions">
                  <button
                    type="button"
                    className="story-scene-regenerate"
                    onClick={() => runRegenerate(featuredScene.sceneId)}
                    disabled={
                      !canRunActions || isSceneGenerating(featuredScene.sceneId)
                    }
                  >
                    {isSceneGenerating(featuredScene.sceneId)
                      ? "Rendering..."
                      : "Regenerate"}
                  </button>
                  <button
                    type="button"
                    className="story-scene-animate"
                    onClick={() => runAnimate(featuredScene.sceneId)}
                    disabled={
                      !canRunActions ||
                      isSceneGenerating(featuredScene.sceneId) ||
                      isSceneAnimating(featuredScene.sceneId) ||
                      !featuredScene.imageKey
                    }
                  >
                    {isSceneAnimating(featuredScene.sceneId)
                      ? "Animating..."
                      : "Animate"}
                  </button>
                </div>
              </>
            ) : (
              <div className="story-scene-placeholder">
                <span>Illustration pending</span>
              </div>
            )}
            <div className="story-scene-overlay">
              <p className="story-scene-title">{featuredScene.title || "Latest scene"}</p>
              <p className="story-scene-description">{featuredScene.description}</p>
            </div>
          </div>
          {formatAnimationStatus(
            featuredScene.videoStatus,
            Boolean(featuredScene.videoUrl)
          ) && (
            <p className="story-reader-strip-title">
              {formatAnimationStatus(
                featuredScene.videoStatus,
                Boolean(featuredScene.videoUrl)
              )}
            </p>
          )}
        </div>
      ) : (
        <div className="story-empty">
          No illustrations yet. Continue the story to generate visual beats.
        </div>
      )}

      {readerScenes.length > 1 && (
        <div className="story-reader-strip">
          {readerScenes.slice(1).map((scene) => (
            <div key={scene.sceneId} className="story-reader-strip-item">
              <div className="story-reader-strip-frame">
                {scene.imageUrl ? (
                  <>
                    <img src={scene.imageUrl} alt={scene.title || "Scene"} />
                    <div className="story-scene-actions">
                      <button
                        type="button"
                        className="story-scene-regenerate"
                        onClick={() => runRegenerate(scene.sceneId)}
                        disabled={!canRunActions || isSceneGenerating(scene.sceneId)}
                      >
                        {isSceneGenerating(scene.sceneId)
                          ? "Rendering..."
                          : "Regenerate"}
                      </button>
                      <button
                        type="button"
                        className="story-scene-animate"
                        onClick={() => runAnimate(scene.sceneId)}
                        disabled={
                          !canRunActions ||
                          isSceneGenerating(scene.sceneId) ||
                          isSceneAnimating(scene.sceneId) ||
                          !scene.imageKey
                        }
                      >
                        {isSceneAnimating(scene.sceneId) ? "Animating..." : "Animate"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="story-reader-strip-placeholder">Pending</div>
                )}
              </div>
              <p className="story-reader-strip-title">{scene.title || "Scene beat"}</p>
              {formatAnimationStatus(scene.videoStatus, Boolean(scene.videoUrl)) && (
                <p className="story-reader-strip-title">
                  {formatAnimationStatus(scene.videoStatus, Boolean(scene.videoUrl))}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function StoryIllustrationsPanel({ isDirectorMode, ...props }) {
  return (
    <div className="story-book-column story-book-images">
      {isDirectorMode ? (
        <StoryDirectorIllustrations {...props} />
      ) : (
        <ReaderIllustrations
          scenes={props.scenes}
          featuredScene={props.featuredScene}
          readerScenes={props.readerScenes}
          activeSessionId={props.activeSessionId}
          status={props.status}
          triggerIllustration={props.triggerIllustration}
          triggerSceneAnimation={props.triggerSceneAnimation}
          isSceneGenerating={props.isSceneGenerating}
          isSceneAnimating={props.isSceneAnimating}
        />
      )}
    </div>
  );
}

export default StoryIllustrationsPanel;
