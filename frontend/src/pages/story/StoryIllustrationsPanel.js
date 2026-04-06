import React, { useMemo } from "react";
import "./story-scenes.css";
import "./story-illustrations.css";
import StoryDirectorIllustrations from "./StoryDirectorIllustrations";
import StoryMusicTrackInline from "./StoryMusicTrackInline";
import ReaderIllustrations from "./ReaderIllustrations";

const parseTrackStamp = (value = "") => {
  const stamp = Date.parse(value || "");
  return Number.isFinite(stamp) ? stamp : 0;
};

function StoryIllustrationsPanel({ isDirectorMode, ...props }) {
  const focusedScene = useMemo(() => {
    if (!isDirectorMode && props.featuredScene?.sceneId) {
      return props.featuredScene;
    }
    if (!Array.isArray(props.scenes) || props.scenes.length === 0) return null;
    const sortedScenes = [...props.scenes].sort(
      (left, right) =>
        parseTrackStamp(right.updatedAt || right.createdAt) -
        parseTrackStamp(left.updatedAt || left.createdAt)
    );
    return sortedScenes[0] || null;
  }, [isDirectorMode, props.featuredScene, props.scenes]);

  return (
    <div className="story-book-column story-book-images">
      <StoryMusicTrackInline
        scenes={props.scenes}
        musicLibrary={props.musicLibrary}
        activeMusicTrackKey={props.activeMusicTrackKey}
        musicAutoPlayRequest={props.musicAutoPlayRequest}
        setActiveMusicTrackKey={props.setActiveMusicTrackKey}
        focusedSceneId={focusedScene?.sceneId || ""}
        focusedSceneTitle={focusedScene?.title || ""}
      />
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
    </div>
  );
}

export default StoryIllustrationsPanel;
