import React from "react";
import StoryModeHeader from "./story/StoryModeHeader";
import StoryControls from "./story/StoryControls";
import StoryChatPanel from "./story/StoryChatPanel";
import StoryIllustrationsPanel from "./story/StoryIllustrationsPanel";
import useStoryStudio from "./story/useStoryStudio";
import "./story/story-base.css";
import "./story/story-scenes.css";

function Story({ apiBaseUrl = "" }) {
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
    setInput,
    setSelectedPresetId,
    setIllustrationContextMode,
    setIllustrationModel,
    setAnimationPrompt,
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
    isSceneGenerating,
    isSceneAnimating,
  } = useStoryStudio(apiBaseUrl);

  return (
    <section className="story-page">
      <StoryModeHeader
        isDirectorMode={isDirectorMode}
        setStoryViewMode={setStoryViewMode}
      />

      <StoryControls
        isDirectorMode={isDirectorMode}
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
          isDirectorMode ? "story-book--director" : "story-book--reader"
        }`}
      >
        <StoryChatPanel
          isDirectorMode={isDirectorMode}
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

        {isDirectorMode && <div className="story-book-spine" />}

        <StoryIllustrationsPanel
          isDirectorMode={isDirectorMode}
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
          illustrationDebugEnabled={illustrationDebugEnabled}
          setIllustrationDebugEnabled={setIllustrationDebugEnabled}
          triggerIllustration={triggerIllustration}
          triggerSceneAnimation={triggerSceneAnimation}
          isSceneGenerating={isSceneGenerating}
          isSceneAnimating={isSceneAnimating}
          featuredScene={featuredScene}
          readerScenes={readerScenes}
        />
      </div>

      {error && <div className="whisk-error-panel">{error}</div>}
    </section>
  );
}

export default Story;
