import React from "react";
import StoryDirectorIllustrations from "./StoryDirectorIllustrations";

function ReaderIllustrations({ scenes, featuredScene, readerScenes }) {
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
              <img src={featuredScene.imageUrl} alt={featuredScene.title || "Featured scene"} />
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
                  <img src={scene.imageUrl} alt={scene.title || "Scene"} />
                ) : (
                  <div className="story-reader-strip-placeholder">Pending</div>
                )}
              </div>
              <p className="story-reader-strip-title">{scene.title || "Scene beat"}</p>
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
        />
      )}
    </div>
  );
}

export default StoryIllustrationsPanel;
