import React, { useEffect, useMemo } from "react";
import StoryModeHeader from "./story/StoryModeHeader";
import StoryControls from "./story/StoryControls";
import StoryChatPanel from "./story/StoryChatPanel";
import StoryIllustrationsPanel from "./story/StoryIllustrationsPanel";
import useStoryStudio from "./story/useStoryStudio";
import { STORY_VIEW_MODE } from "./story/constants";
import "./story/story-v3.css";

const parseTrackStamp = (value = "") => {
  const stamp = Date.parse(value || "");
  return Number.isFinite(stamp) ? stamp : 0;
};

const resolveNowPlayingTrack = ({
  activeMusicTrackKey = "",
  scenes = [],
  musicLibrary = [],
  featuredScene = null,
}) => {
  const normalizedScenes = Array.isArray(scenes) ? scenes : [];
  const normalizedLibrary = Array.isArray(musicLibrary) ? musicLibrary : [];
  const key = String(activeMusicTrackKey || "").trim();
  const libraryByKey = new Map(
    normalizedLibrary
      .filter((track) => track?.key)
      .map((track) => [String(track.key).trim(), track])
  );
  const sceneByKey = new Map();
  normalizedScenes.forEach((scene) => {
    const sceneKey = String(scene?.musicKey || "").trim();
    if (!sceneKey || sceneByKey.has(sceneKey)) return;
    sceneByKey.set(sceneKey, scene);
  });

  const fromLibraryTrack = (track = {}) => {
    if (!track?.url) return null;
    return {
      key: String(track.key || "").trim(),
      url: track.url,
      title: track.title || "Soundtrack",
      source: "library",
      mood: track.mood || "",
      energy: track.energy || "",
      tempoBpm: typeof track.tempoBpm === "number" ? track.tempoBpm : null,
      tags: Array.isArray(track.tags) ? track.tags.filter(Boolean) : [],
      updatedAt: track.updatedAt || track.createdAt || "",
    };
  };

  const fromSceneTrack = (scene = {}) => {
    if (!scene?.musicUrl) return null;
    return {
      key: String(scene.musicKey || "").trim(),
      url: scene.musicUrl,
      title: scene.title || "Scene soundtrack",
      source: "scene",
      mood: scene.musicMood || "",
      energy: scene.musicEnergy || "",
      tempoBpm:
        typeof scene.musicTempoBpm === "number" ? scene.musicTempoBpm : null,
      tags: Array.isArray(scene.musicTags) ? scene.musicTags.filter(Boolean) : [],
      updatedAt: scene.musicUpdatedAt || scene.updatedAt || scene.createdAt || "",
    };
  };

  if (key) {
    const libraryTrack = fromLibraryTrack(libraryByKey.get(key));
    if (libraryTrack) return libraryTrack;
    const sceneTrack = fromSceneTrack(sceneByKey.get(key));
    if (sceneTrack) return sceneTrack;
  }

  const featuredKey = String(featuredScene?.musicKey || "").trim();
  if (featuredKey) {
    const featuredLibraryTrack = fromLibraryTrack(libraryByKey.get(featuredKey));
    if (featuredLibraryTrack) return featuredLibraryTrack;
    const featuredSceneTrack = fromSceneTrack(featuredScene);
    if (featuredSceneTrack) return featuredSceneTrack;
  }

  const latestSceneTrack = [...normalizedScenes]
    .sort(
      (left, right) =>
        parseTrackStamp(right.musicUpdatedAt || right.updatedAt || right.createdAt) -
        parseTrackStamp(left.musicUpdatedAt || left.updatedAt || left.createdAt)
    )
    .map(fromSceneTrack)
    .find(Boolean);
  if (latestSceneTrack) return latestSceneTrack;

  return null;
};

function Story({
  apiBaseUrl = "",
  forcedViewMode = "",
  pageVariant = "story",
  onNowPlayingChange,
}) {
  const {
    presets,
    sessions,
    activeSessionId,
    messages,
    scenes,
    input,
    status,
    error,
    selectedPresetId,
    isLoadingSession,
    illustrationContextMode,
    illustrationModel,
    animationPrompt,
    musicPrompt,
    illustrationDebugEnabled,
    activeSessionDetail,
    storyDebugEnabled,
    storyDebugView,
    isForcingIllustration,
    isDirectorMode,
    activeSession,
    activeTurnCount,
    readerScenes,
    featuredScene,
    musicLibrary,
    sceneLibrarySelectionMap,
    activeMusicTrackKey,
    musicAutoPlayRequest,
    setInput,
    setSelectedPresetId,
    setIllustrationContextMode,
    setIllustrationModel,
    setAnimationPrompt,
    setMusicPrompt,
    setActiveMusicTrackKey,
    setIllustrationDebugEnabled,
    setStoryDebugEnabled,
    setStoryDebugView,
    setStoryViewMode,
    refreshSessions,
    handleSelectSession,
    handleDeleteSession,
    handleCreateSession,
    handleSendMessage,
    handleForceIllustration,
    triggerIllustration,
    triggerSceneAnimation,
    triggerSceneMusic,
    saveSceneMusic,
    applyLibraryTrackToScene,
    setSceneLibraryTrackSelection,
    isSceneGenerating,
    isSceneAnimating,
    isSceneGeneratingMusic,
  } = useStoryStudio(apiBaseUrl);

  useEffect(() => {
    if (!forcedViewMode) return;
    setStoryViewMode(forcedViewMode);
  }, [forcedViewMode, setStoryViewMode]);

  const modeLocked = Boolean(forcedViewMode);
  const resolvedDirectorMode =
    forcedViewMode === STORY_VIEW_MODE.DIRECTOR
      ? true
      : forcedViewMode === STORY_VIEW_MODE.READER
        ? false
        : isDirectorMode;

  const pageTitle = resolvedDirectorMode ? "Director Console" : "Storytelling Studio";
  const pageSubtitle = resolvedDirectorMode
    ? "Drive scene production, regeneration, and music sync from one command surface."
    : "A cinematic chat workspace where scenes, animation, and music stay in lockstep.";
  const nowPlayingTrack = useMemo(
    () =>
      resolveNowPlayingTrack({
        activeMusicTrackKey,
        scenes,
        musicLibrary,
        featuredScene,
      }),
    [activeMusicTrackKey, featuredScene, musicLibrary, scenes]
  );

  useEffect(() => {
    if (typeof onNowPlayingChange !== "function") return;
    if (!nowPlayingTrack?.url) return;
    onNowPlayingChange((previousTrack) => {
      if (
        previousTrack?.key === nowPlayingTrack.key &&
        previousTrack?.url === nowPlayingTrack.url &&
        previousTrack?.title === nowPlayingTrack.title &&
        previousTrack?.tempoBpm === nowPlayingTrack.tempoBpm &&
        previousTrack?.mood === nowPlayingTrack.mood &&
        previousTrack?.energy === nowPlayingTrack.energy &&
        JSON.stringify(previousTrack?.tags || []) ===
          JSON.stringify(nowPlayingTrack.tags || [])
      ) {
        return previousTrack;
      }
      return nowPlayingTrack;
    });
  }, [nowPlayingTrack, onNowPlayingChange]);

  return (
    <section
      className={`story-page--v3 story-page--${
        resolvedDirectorMode ? "director" : "reader"
      } story-page--${pageVariant}`}
    >
      {modeLocked ? (
        <header className="story-v3-header story-v3-header--locked">
          <p className="story-v3-kicker">{resolvedDirectorMode ? "Director" : "Story"}</p>
          <h1 className="story-v3-title">{pageTitle}</h1>
          <p className="story-v3-subtitle">{pageSubtitle}</p>
        </header>
      ) : (
        <StoryModeHeader
          isDirectorMode={isDirectorMode}
          setStoryViewMode={setStoryViewMode}
        />
      )}

      {resolvedDirectorMode ? (
        <div className="story-v3-layout story-v3-layout--director">
          <aside className="story-v3-rail" aria-label="Story setup and controls">
            <StoryControls
              isDirectorMode
              sessions={sessions}
              activeSessionId={activeSessionId}
              selectedPresetId={selectedPresetId}
              presets={presets}
              status={status}
              refreshSessions={refreshSessions}
              handleSelectSession={handleSelectSession}
              handleDeleteSession={handleDeleteSession}
              setSelectedPresetId={setSelectedPresetId}
              handleCreateSession={handleCreateSession}
            />
          </aside>

          <section className="story-v3-visual" aria-label="Story visual stage">
            <StoryIllustrationsPanel
              isDirectorMode
              scenes={scenes}
              messages={messages}
              input={input}
              activeSessionId={activeSessionId}
              activeSessionDetail={activeSessionDetail}
              status={status}
              illustrationContextMode={illustrationContextMode}
              setIllustrationContextMode={setIllustrationContextMode}
              illustrationModel={illustrationModel}
              setIllustrationModel={setIllustrationModel}
              animationPrompt={animationPrompt}
              setAnimationPrompt={setAnimationPrompt}
              musicPrompt={musicPrompt}
              setMusicPrompt={setMusicPrompt}
              illustrationDebugEnabled={illustrationDebugEnabled}
              setIllustrationDebugEnabled={setIllustrationDebugEnabled}
              triggerIllustration={triggerIllustration}
              triggerSceneAnimation={triggerSceneAnimation}
              triggerSceneMusic={triggerSceneMusic}
              saveSceneMusic={saveSceneMusic}
              applyLibraryTrackToScene={applyLibraryTrackToScene}
              setSceneLibraryTrackSelection={setSceneLibraryTrackSelection}
              musicLibrary={musicLibrary}
              sceneLibrarySelectionMap={sceneLibrarySelectionMap}
              activeMusicTrackKey={activeMusicTrackKey}
              musicAutoPlayRequest={musicAutoPlayRequest}
              setActiveMusicTrackKey={setActiveMusicTrackKey}
              isSceneGenerating={isSceneGenerating}
              isSceneAnimating={isSceneAnimating}
              isSceneGeneratingMusic={isSceneGeneratingMusic}
              featuredScene={featuredScene}
              readerScenes={readerScenes}
            />
          </section>

          <section className="story-v3-chat" aria-label="Story narrative panel">
            <StoryChatPanel
              isDirectorMode
              activeSession={activeSession}
              activeTurnCount={activeTurnCount}
              isLoadingSession={isLoadingSession}
              messages={messages}
              status={status}
              activeSessionId={activeSessionId}
              input={input}
              setInput={setInput}
              handleSendMessage={handleSendMessage}
              handleForceIllustration={handleForceIllustration}
              isForcingIllustration={isForcingIllustration}
              activeSessionDetail={activeSessionDetail}
              storyDebugEnabled={storyDebugEnabled}
              setStoryDebugEnabled={setStoryDebugEnabled}
              storyDebugView={storyDebugView}
              setStoryDebugView={setStoryDebugView}
            />
          </section>
        </div>
      ) : (
        <>
          <section className="story-v3-session-bar" aria-label="Story session controls">
            <StoryControls
              isDirectorMode={false}
              sessions={sessions}
              activeSessionId={activeSessionId}
              selectedPresetId={selectedPresetId}
              presets={presets}
              status={status}
              refreshSessions={refreshSessions}
              handleSelectSession={handleSelectSession}
              handleDeleteSession={handleDeleteSession}
              setSelectedPresetId={setSelectedPresetId}
              handleCreateSession={handleCreateSession}
            />
          </section>

          <div className="story-v3-layout story-v3-layout--reader">
            <section className="story-v3-visual" aria-label="Story visual stage">
              <StoryIllustrationsPanel
                isDirectorMode={false}
                scenes={scenes}
                messages={messages}
                input={input}
                activeSessionId={activeSessionId}
                activeSessionDetail={activeSessionDetail}
                status={status}
                illustrationContextMode={illustrationContextMode}
                setIllustrationContextMode={setIllustrationContextMode}
                illustrationModel={illustrationModel}
                setIllustrationModel={setIllustrationModel}
                animationPrompt={animationPrompt}
                setAnimationPrompt={setAnimationPrompt}
                musicPrompt={musicPrompt}
                setMusicPrompt={setMusicPrompt}
                illustrationDebugEnabled={illustrationDebugEnabled}
                setIllustrationDebugEnabled={setIllustrationDebugEnabled}
                triggerIllustration={triggerIllustration}
                triggerSceneAnimation={triggerSceneAnimation}
                triggerSceneMusic={triggerSceneMusic}
                saveSceneMusic={saveSceneMusic}
                applyLibraryTrackToScene={applyLibraryTrackToScene}
                setSceneLibraryTrackSelection={setSceneLibraryTrackSelection}
                musicLibrary={musicLibrary}
                sceneLibrarySelectionMap={sceneLibrarySelectionMap}
                activeMusicTrackKey={activeMusicTrackKey}
                musicAutoPlayRequest={musicAutoPlayRequest}
                setActiveMusicTrackKey={setActiveMusicTrackKey}
                isSceneGenerating={isSceneGenerating}
                isSceneAnimating={isSceneAnimating}
                isSceneGeneratingMusic={isSceneGeneratingMusic}
                featuredScene={featuredScene}
                readerScenes={readerScenes}
              />
            </section>

            <section className="story-v3-chat" aria-label="Story narrative panel">
              <StoryChatPanel
                isDirectorMode={false}
                activeSession={activeSession}
                activeTurnCount={activeTurnCount}
                isLoadingSession={isLoadingSession}
                messages={messages}
                status={status}
                activeSessionId={activeSessionId}
                input={input}
                setInput={setInput}
                handleSendMessage={handleSendMessage}
                handleForceIllustration={handleForceIllustration}
                isForcingIllustration={isForcingIllustration}
                activeSessionDetail={activeSessionDetail}
                storyDebugEnabled={storyDebugEnabled}
                setStoryDebugEnabled={setStoryDebugEnabled}
                storyDebugView={storyDebugView}
                setStoryDebugView={setStoryDebugView}
              />
            </section>
          </div>
        </>
      )}

      {error && <div className="story-v3-error">{error}</div>}
    </section>
  );
}

export default Story;
