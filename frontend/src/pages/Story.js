import React, { useEffect } from "react";
import StoryModeHeader from "./story/StoryModeHeader";
import StoryControls from "./story/StoryControls";
import StoryChatPanel from "./story/StoryChatPanel";
import StoryIllustrationsPanel from "./story/StoryIllustrationsPanel";
import useStoryStudio from "./story/useStoryStudio";
import { STORY_VIEW_MODE } from "./story/constants";

function Story({ apiBaseUrl = "", forcedViewMode = "", pageVariant = "story" }) {
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

  const pageTitle = resolvedDirectorMode ? "Director Console" : "Story Teller";
  const pageSubtitle = resolvedDirectorMode
    ? "Drive scene production, regeneration, and music sync from one command surface."
    : "Write and read your story with a focused narrative workspace and live memory context.";

  return (
    <section
      className={`story-page story-page--${resolvedDirectorMode ? "director" : "reader"} story-page--${pageVariant}`}
    >
      {modeLocked ? (
        <header className="story-hero story-hero--locked glass-panel">
          <p className="story-hero-kicker">{resolvedDirectorMode ? "Director" : "Story"}</p>
          <h1 className="story-title">{pageTitle}</h1>
          <p className="story-subtitle">{pageSubtitle}</p>
        </header>
      ) : (
        <StoryModeHeader
          isDirectorMode={isDirectorMode}
          setStoryViewMode={setStoryViewMode}
        />
      )}

      <StoryControls
        isDirectorMode={resolvedDirectorMode}
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

      <div
        className={`story-book ${
          resolvedDirectorMode ? "story-book--director" : "story-book--reader"
        }`}
      >
        <StoryChatPanel
          isDirectorMode={resolvedDirectorMode}
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

        {resolvedDirectorMode && <div className="story-book-spine" />}

        <StoryIllustrationsPanel
          isDirectorMode={resolvedDirectorMode}
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
      </div>

      {error && <div className="whisk-error-panel">{error}</div>}
    </section>
  );
}

export default Story;
