import React, { useEffect, useMemo } from "react";
import StoryModeHeader from "./story/StoryModeHeader";
import StoryControls from "./story/StoryControls";
import StoryChatPanel from "./story/StoryChatPanel";
import StoryIllustrationsPanel from "./story/StoryIllustrationsPanel";
import useStoryStudio from "./story/useStoryStudio";
import { STORY_VIEW_MODE } from "./story/constants";
import "./story/story-v3.css";

const DEFAULT_TRACK_TITLE = "Soundtrack";
const DEFAULT_SCENE_TRACK_TITLE = "Scene soundtrack";
const TRACK_SOURCE_LIBRARY = "library";
const TRACK_SOURCE_SCENE = "scene";

const parseTrackStamp = (value = "") => {
  const stamp = Date.parse(value || "");
  return Number.isFinite(stamp) ? stamp : 0;
};

const normalizeTrackTags = (tags = []) =>
  Array.isArray(tags) ? tags.filter(Boolean) : [];

const resolveTrackIdentity = (track = {}) =>
  String(track?.key || track?.url || "").trim();

const fromLibraryTrack = (track = {}) => {
  if (!track?.url) return null;
  return {
    key: String(track.key || "").trim(),
    url: track.url,
    title: track.title || DEFAULT_TRACK_TITLE,
    source: TRACK_SOURCE_LIBRARY,
    mood: track.mood || "",
    energy: track.energy || "",
    tempoBpm: typeof track.tempoBpm === "number" ? track.tempoBpm : null,
    tags: normalizeTrackTags(track.tags),
    updatedAt: track.updatedAt || track.createdAt || "",
  };
};

const fromSceneTrack = (scene = {}) => {
  if (!scene?.musicUrl) return null;
  return {
    key: String(scene.musicKey || "").trim(),
    url: scene.musicUrl,
    title: scene.title || DEFAULT_SCENE_TRACK_TITLE,
    source: TRACK_SOURCE_SCENE,
    mood: scene.musicMood || "",
    energy: scene.musicEnergy || "",
    tempoBpm: typeof scene.musicTempoBpm === "number" ? scene.musicTempoBpm : null,
    tags: normalizeTrackTags(scene.musicTags),
    updatedAt: scene.musicUpdatedAt || scene.updatedAt || scene.createdAt || "",
  };
};

const areTracksEqual = (left = {}, right = {}) =>
  left?.key === right?.key &&
  left?.url === right?.url &&
  left?.title === right?.title &&
  left?.source === right?.source &&
  left?.mood === right?.mood &&
  left?.energy === right?.energy &&
  left?.tempoBpm === right?.tempoBpm &&
  left?.updatedAt === right?.updatedAt &&
  JSON.stringify(left?.tags || []) === JSON.stringify(right?.tags || []);

const areTrackListsEqual = (previous = [], next = []) => {
  if (!Array.isArray(previous) || !Array.isArray(next)) return false;
  if (previous.length !== next.length) return false;
  return previous.every((track, index) => areTracksEqual(track, next[index]));
};

const resolveAvailableTracks = ({
  activeMusicTrackKey = "",
  scenes = [],
  musicLibrary = [],
  featuredScene = null,
  nowPlayingTrack = null,
}) => {
  const normalizedScenes = Array.isArray(scenes) ? scenes : [];
  const normalizedLibrary = Array.isArray(musicLibrary) ? musicLibrary : [];
  const sortedScenes = [...normalizedScenes].sort(
    (left, right) =>
      parseTrackStamp(right.musicUpdatedAt || right.updatedAt || right.createdAt) -
      parseTrackStamp(left.musicUpdatedAt || left.updatedAt || left.createdAt)
  );

  const trackByIdentity = new Map();
  const appendTrack = (track) => {
    if (!track?.url) return;
    const identity = resolveTrackIdentity(track);
    if (!identity) return;
    const existingTrack = trackByIdentity.get(identity);
    if (!existingTrack) {
      trackByIdentity.set(identity, track);
      return;
    }
    if (parseTrackStamp(track.updatedAt) >= parseTrackStamp(existingTrack.updatedAt)) {
      trackByIdentity.set(identity, { ...existingTrack, ...track });
    }
  };

  const activeKey = String(activeMusicTrackKey || "").trim();
  if (activeKey) {
    const activeLibraryTrack = normalizedLibrary
      .map(fromLibraryTrack)
      .find((track) => track?.key === activeKey);
    appendTrack(activeLibraryTrack);
    const activeSceneTrack = sortedScenes
      .map(fromSceneTrack)
      .find((track) => track?.key === activeKey);
    appendTrack(activeSceneTrack);
  }

  appendTrack(fromLibraryTrack(normalizedLibrary.find((track) => String(track?.key || "").trim() === String(featuredScene?.musicKey || "").trim())));
  appendTrack(fromSceneTrack(featuredScene));

  normalizedLibrary.forEach((track) => appendTrack(fromLibraryTrack(track)));
  sortedScenes.forEach((scene) => appendTrack(fromSceneTrack(scene)));
  appendTrack(nowPlayingTrack);

  return [...trackByIdentity.values()].sort(
    (left, right) => parseTrackStamp(right.updatedAt) - parseTrackStamp(left.updatedAt)
  );
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
  onTrackCatalogChange,
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
  const availableTracks = useMemo(
    () =>
      resolveAvailableTracks({
        activeMusicTrackKey,
        scenes,
        musicLibrary,
        featuredScene,
        nowPlayingTrack,
      }),
    [activeMusicTrackKey, featuredScene, musicLibrary, nowPlayingTrack, scenes]
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

  useEffect(() => {
    if (typeof onTrackCatalogChange !== "function") return;
    onTrackCatalogChange((previousTracks) => {
      if (areTrackListsEqual(previousTracks, availableTracks)) {
        return previousTracks;
      }
      return availableTracks;
    });
  }, [availableTracks, onTrackCatalogChange]);

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
