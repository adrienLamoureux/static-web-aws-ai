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

function ReaderIllustrations({
  scenes,
  featuredScene,
  readerScenes,
  activeSessionId,
  status,
  triggerIllustration,
  triggerSceneAnimation,
  triggerSceneMusic,
  isSceneGenerating,
  isSceneAnimating,
  isSceneGeneratingMusic,
}) {
  const canRunActions = Boolean(activeSessionId) && status !== "sending";
  const featuredMusicStatusLabel = formatMusicStatus(
    featuredScene?.musicStatus,
    Boolean(featuredScene?.musicUrl)
  );
  const runRegenerate = (sceneId) => {
    if (!canRunActions || !sceneId) return;
    triggerIllustration(activeSessionId, sceneId, { regenerate: true });
  };
  const runAnimate = (sceneId) => {
    if (!canRunActions || !sceneId) return;
    triggerSceneAnimation(activeSessionId, sceneId);
  };
  const runMusic = (sceneId) => {
    if (!canRunActions || !sceneId) return;
    triggerSceneMusic(activeSessionId, sceneId);
  };

  return (
    <section className="story-v3-scene-stage">
      <div className="story-v3-panel-head">
        <h2 className="story-v3-section-title">Illustrated moments</h2>
        <span className="story-v3-scenes-meta">
          {scenes.length} scene{scenes.length === 1 ? "" : "s"}
        </span>
      </div>

      {featuredScene ? (
        <div className="story-v3-reader-feature">
          <div className="story-v3-scene-card story-v3-scene-card--feature">
            {featuredScene.imageUrl ? (
              <>
                <img
                  src={featuredScene.imageUrl}
                  alt={featuredScene.title || "Featured scene"}
                />
                <div className="story-v3-scene-actions">
                  <button
                    type="button"
                    className="story-v3-scene-action story-v3-scene-action--regenerate"
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
                    className="story-v3-scene-action story-v3-scene-action--animate"
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
                  <button
                    type="button"
                    className="story-v3-scene-action story-v3-scene-action--music"
                    onClick={() => runMusic(featuredScene.sceneId)}
                    disabled={
                      !canRunActions || isSceneGeneratingMusic(featuredScene.sceneId)
                    }
                  >
                    {isSceneGeneratingMusic(featuredScene.sceneId)
                      ? "Scoring..."
                      : "Music"}
                  </button>
                </div>
              </>
            ) : (
              <div className="story-v3-scene-placeholder">
                <span>Illustration pending</span>
              </div>
            )}
            <div className="story-v3-scene-overlay">
              <p className="story-v3-scene-title">{featuredScene.title || "Latest scene"}</p>
              <p className="story-v3-scene-description">{featuredScene.description}</p>
            </div>
          </div>
          {(featuredScene.videoUrl ||
            formatAnimationStatus(
              featuredScene.videoStatus,
              Boolean(featuredScene.videoUrl)
            )) && (
            <div className="story-v3-scene-video">
              {featuredScene.videoUrl ? (
                <video controls preload="metadata" src={featuredScene.videoUrl} />
              ) : (
                <p className="story-v3-scene-video-status">
                  {formatAnimationStatus(
                    featuredScene.videoStatus,
                    Boolean(featuredScene.videoUrl)
                  )}
                </p>
              )}
              {featuredScene.videoUrl &&
                formatAnimationStatus(
                  featuredScene.videoStatus,
                  Boolean(featuredScene.videoUrl)
                ) && (
                  <p className="story-v3-scene-video-status">
                    {formatAnimationStatus(
                      featuredScene.videoStatus,
                      Boolean(featuredScene.videoUrl)
                    )}
                  </p>
                )}
            </div>
          )}
          {featuredMusicStatusLabel && (
            <div className="story-v3-scene-music">
              <p className="story-v3-scene-music-status">{featuredMusicStatusLabel}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="story-v3-empty">
          No illustrations yet. Continue the story to generate visual beats.
        </div>
      )}

      {readerScenes.length > 1 && (
        <div className="story-v3-reader-strip">
          {readerScenes.slice(1).map((scene) => (
            <div key={scene.sceneId} className="story-v3-strip-item">
              <div className="story-v3-strip-frame">
                {scene.imageUrl ? (
                  <>
                    <img src={scene.imageUrl} alt={scene.title || "Scene"} />
                    <div className="story-v3-scene-actions">
                      <button
                        type="button"
                        className="story-v3-scene-action story-v3-scene-action--regenerate"
                        onClick={() => runRegenerate(scene.sceneId)}
                        disabled={!canRunActions || isSceneGenerating(scene.sceneId)}
                      >
                        {isSceneGenerating(scene.sceneId)
                          ? "Rendering..."
                          : "Regenerate"}
                      </button>
                      <button
                        type="button"
                        className="story-v3-scene-action story-v3-scene-action--animate"
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
                      <button
                        type="button"
                        className="story-v3-scene-action story-v3-scene-action--music"
                        onClick={() => runMusic(scene.sceneId)}
                        disabled={
                          !canRunActions || isSceneGeneratingMusic(scene.sceneId)
                        }
                      >
                        {isSceneGeneratingMusic(scene.sceneId) ? "Scoring..." : "Music"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="story-v3-strip-placeholder">Pending</div>
                )}
              </div>
              <p className="story-v3-strip-title">{scene.title || "Scene beat"}</p>
              {scene.videoUrl ? (
                <div className="story-v3-scene-video">
                  <video controls preload="metadata" src={scene.videoUrl} />
                  {formatAnimationStatus(scene.videoStatus, Boolean(scene.videoUrl)) && (
                    <p className="story-v3-scene-video-status">
                      {formatAnimationStatus(scene.videoStatus, Boolean(scene.videoUrl))}
                    </p>
                  )}
                </div>
              ) : (
                formatAnimationStatus(scene.videoStatus, Boolean(scene.videoUrl)) && (
                  <p className="story-v3-strip-title">
                    {formatAnimationStatus(scene.videoStatus, Boolean(scene.videoUrl))}
                  </p>
                )
              )}
              {formatMusicStatus(scene.musicStatus, Boolean(scene.musicUrl)) && (
                <p className="story-v3-strip-title">
                  {formatMusicStatus(scene.musicStatus, Boolean(scene.musicUrl))}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StoryIllustrationsPanel({ isDirectorMode, ...props }) {
  return (
    <article className="story-v3-visual-shell">
      <section className="story-v3-visual-block story-v3-visual-block--illustrations">
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
            triggerSceneMusic={props.triggerSceneMusic}
            isSceneGenerating={props.isSceneGenerating}
            isSceneAnimating={props.isSceneAnimating}
            isSceneGeneratingMusic={props.isSceneGeneratingMusic}
          />
        )}
      </section>
    </article>
  );
}

export default StoryIllustrationsPanel;
