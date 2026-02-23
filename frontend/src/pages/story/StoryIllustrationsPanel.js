import React, { useEffect, useMemo, useState } from "react";
import StoryDirectorIllustrations from "./StoryDirectorIllustrations";
import StoryMusicTrackCard from "./StoryMusicTrackCard";

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

const parseTrackStamp = (value = "") => {
  const stamp = Date.parse(value || "");
  return Number.isFinite(stamp) ? stamp : 0;
};

const buildTrackOptionLabel = (track = {}) => {
  const sourceLabel = track.source === "library" ? "Library" : "Scene";
  const moodLabel = track.mood ? ` · ${track.mood}` : "";
  return `${sourceLabel}: ${track.title || "Soundtrack"}${moodLabel}`;
};

const buildTrackSearchText = (track = {}) => {
  const tags = Array.isArray(track.tags) ? track.tags : [];
  return [
    track.title || "",
    track.description || "",
    track.mood || "",
    track.energy || "",
    track.source || "",
    ...tags,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
};

function StoryMusicTrack({
  scenes = [],
  musicLibrary = [],
  activeMusicTrackKey,
  musicAutoPlayRequest,
  setActiveMusicTrackKey,
  focusedSceneId = "",
  focusedSceneTitle = "",
}) {
  const [isLooping, setIsLooping] = useState(true);
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [manualOverrideTrackKey, setManualOverrideTrackKey] = useState("");
  const [trackQuery, setTrackQuery] = useState("");

  const availableTracks = useMemo(() => {
    const trackMap = new Map();
    const upsertTrack = (candidate = {}) => {
      const key = String(candidate.key || "").trim();
      if (!key) return;
      const current = trackMap.get(key);
      if (!current) {
        const normalizedTags = Array.isArray(candidate.tags)
          ? candidate.tags.filter(Boolean)
          : [];
        trackMap.set(key, {
          ...candidate,
          key,
          trackId: candidate.trackId || "",
          url: candidate.url || "",
          title: candidate.title || "Soundtrack",
          description: candidate.description || "",
          source: candidate.source || "scene",
          mood: candidate.mood || "",
          energy: candidate.energy || "",
          tempoBpm:
            typeof candidate.tempoBpm === "number" ? candidate.tempoBpm : null,
          tags: normalizedTags,
          createdAt: candidate.createdAt || "",
        });
        return;
      }
      const candidateTags = Array.isArray(candidate.tags)
        ? candidate.tags.filter(Boolean)
        : [];
      const preferCandidateMetadata =
        candidate.source === "library" && current.source !== "library";
      trackMap.set(key, {
        ...current,
        trackId: current.trackId || candidate.trackId || "",
        url: current.url || candidate.url || "",
        title:
          preferCandidateMetadata && candidate.title
            ? candidate.title
            : current.title || candidate.title || "Soundtrack",
        description:
          preferCandidateMetadata && candidate.description
            ? candidate.description
            : current.description || candidate.description || "",
        mood:
          preferCandidateMetadata && candidate.mood
            ? candidate.mood
            : current.mood || candidate.mood || "",
        energy:
          preferCandidateMetadata && candidate.energy
            ? candidate.energy
            : current.energy || candidate.energy || "",
        tempoBpm: (() => {
          if (preferCandidateMetadata && typeof candidate.tempoBpm === "number") {
            return candidate.tempoBpm;
          }
          if (typeof current.tempoBpm === "number") return current.tempoBpm;
          if (typeof candidate.tempoBpm === "number") return candidate.tempoBpm;
          return null;
        })(),
        tags:
          preferCandidateMetadata && candidateTags.length > 0
            ? candidateTags
            : current.tags?.length
              ? current.tags
              : candidateTags,
        source:
          current.source === candidate.source
            ? current.source
            : current.source === "library" || candidate.source === "library"
              ? "library"
              : "scene",
        createdAt:
          parseTrackStamp(candidate.createdAt) > parseTrackStamp(current.createdAt)
            ? candidate.createdAt || current.createdAt || ""
            : current.createdAt || candidate.createdAt || "",
      });
    };

    scenes.forEach((scene, index) => {
      if (!scene?.musicKey) return;
      upsertTrack({
        key: scene.musicKey,
        sceneId: scene.sceneId || "",
        url: scene.musicUrl || "",
        title: scene.title || `Scene ${index + 1}`,
        description: scene.musicPrompt || "",
        mood: scene.musicMood || "",
        energy: scene.musicEnergy || "",
        tempoBpm:
          typeof scene.musicTempoBpm === "number" ? scene.musicTempoBpm : null,
        tags: Array.isArray(scene.musicTags) ? scene.musicTags : [],
        source: "scene",
        createdAt: scene.musicUpdatedAt || scene.updatedAt || scene.createdAt || "",
      });
    });

    musicLibrary.forEach((track) => {
      if (!track?.key) return;
      upsertTrack({
        trackId: track.trackId || "",
        key: track.key,
        url: track.url || "",
        title: track.title || "Saved soundtrack",
        description: track.description || "",
        mood: track.mood || "",
        energy: track.energy || "",
        tempoBpm:
          typeof track.tempoBpm === "number" ? track.tempoBpm : null,
        tags: Array.isArray(track.tags) ? track.tags : [],
        source: "library",
        createdAt: track.updatedAt || track.createdAt || "",
      });
    });

    return Array.from(trackMap.values()).sort(
      (left, right) => parseTrackStamp(right.createdAt) - parseTrackStamp(left.createdAt)
    );
  }, [musicLibrary, scenes]);

  const focusedSceneTrackKey = useMemo(() => {
    if (!focusedSceneId) return "";
    const focusedScene = scenes.find((scene) => scene?.sceneId === focusedSceneId);
    return String(focusedScene?.musicKey || "").trim();
  }, [focusedSceneId, scenes]);

  const selectedTrackKey = useMemo(() => {
    if (isManualOverride && manualOverrideTrackKey) {
      const hasManualTrack = availableTracks.some(
        (track) => track.key === manualOverrideTrackKey
      );
      if (hasManualTrack) return manualOverrideTrackKey;
    }
    const hasActiveTrack = availableTracks.some(
      (track) => track.key === activeMusicTrackKey
    );
    if (hasActiveTrack) return activeMusicTrackKey;
    if (!isManualOverride && focusedSceneTrackKey) {
      const hasFocusedTrack = availableTracks.some(
        (track) => track.key === focusedSceneTrackKey
      );
      if (hasFocusedTrack) return focusedSceneTrackKey;
    }
    return availableTracks[0]?.key || "";
  }, [
    activeMusicTrackKey,
    availableTracks,
    focusedSceneTrackKey,
    isManualOverride,
    manualOverrideTrackKey,
  ]);

  useEffect(() => {
    if (typeof setActiveMusicTrackKey !== "function") return;
    if (!selectedTrackKey && activeMusicTrackKey) {
      setActiveMusicTrackKey("");
      return;
    }
    if (selectedTrackKey && selectedTrackKey !== activeMusicTrackKey) {
      setActiveMusicTrackKey(selectedTrackKey);
    }
  }, [activeMusicTrackKey, selectedTrackKey, setActiveMusicTrackKey]);

  useEffect(() => {
    if (isManualOverride) return;
    if (typeof setActiveMusicTrackKey !== "function") return;
    if (!focusedSceneTrackKey) return;
    const hasFocusedTrack = availableTracks.some(
      (track) => track.key === focusedSceneTrackKey
    );
    if (!hasFocusedTrack) return;
    if (focusedSceneTrackKey !== activeMusicTrackKey) {
      setActiveMusicTrackKey(focusedSceneTrackKey);
    }
  }, [
    activeMusicTrackKey,
    availableTracks,
    focusedSceneTrackKey,
    isManualOverride,
    setActiveMusicTrackKey,
  ]);

  const selectedTrack = useMemo(
    () => availableTracks.find((track) => track.key === selectedTrackKey) || null,
    [availableTracks, selectedTrackKey]
  );

  const normalizedTrackQuery = trackQuery.trim().toLowerCase();
  const filteredTracks = useMemo(() => {
    if (!normalizedTrackQuery) return availableTracks;
    return availableTracks.filter((track) =>
      buildTrackSearchText(track).includes(normalizedTrackQuery)
    );
  }, [availableTracks, normalizedTrackQuery]);
  const trackOptions = useMemo(() => {
    if (!selectedTrack) return filteredTracks;
    const selectedInResults = filteredTracks.some(
      (track) => track.key === selectedTrack.key
    );
    if (selectedInResults) return filteredTracks;
    return [selectedTrack, ...filteredTracks];
  }, [filteredTracks, selectedTrack]);

  const selectTrackManually = (trackKey = "") => {
    const nextKey = String(trackKey || "").trim();
    const shouldOverride = Boolean(nextKey) && nextKey !== focusedSceneTrackKey;
    if (typeof setActiveMusicTrackKey === "function") {
      setActiveMusicTrackKey(nextKey);
    }
    setIsManualOverride(shouldOverride);
    setManualOverrideTrackKey(shouldOverride ? nextKey : "");
  };

  const resumeSceneFocus = () => {
    setIsManualOverride(false);
    setManualOverrideTrackKey("");
    if (typeof setActiveMusicTrackKey !== "function") return;
    if (focusedSceneTrackKey) {
      setActiveMusicTrackKey(focusedSceneTrackKey);
      return;
    }
    setActiveMusicTrackKey(availableTracks[0]?.key || "");
  };

  useEffect(() => {
    if (!isManualOverride) return;
    if (!manualOverrideTrackKey) {
      setIsManualOverride(false);
      return;
    }
    const hasManualTrack = availableTracks.some(
      (track) => track.key === manualOverrideTrackKey
    );
    if (!hasManualTrack) {
      setIsManualOverride(false);
      setManualOverrideTrackKey("");
    }
  }, [availableTracks, isManualOverride, manualOverrideTrackKey]);

  return (
    <div className="story-music-track glass-panel">
      <div className="story-scenes-header">
        <h2 className="story-section-title">Music tracks</h2>
        <span className="story-scenes-meta">
          {availableTracks.length} track{availableTracks.length === 1 ? "" : "s"}
        </span>
      </div>
      <p className="story-music-track-meta">
        {selectedTrack
          ? `Selected: ${selectedTrack.title || "Soundtrack"} (${selectedTrack.source === "library" ? "library" : "scene"})`
          : "Selected: none"}
      </p>
      <div className="story-music-track-mode-row">
        <p className="story-music-track-mode">
          {isManualOverride
            ? "Manual override active."
            : focusedSceneTrackKey
              ? `Following scene: ${focusedSceneTitle || "Current scene"}`
              : "No scene soundtrack to follow."}
        </p>
        {isManualOverride && (
          <button
            type="button"
            className="btn-ghost px-3 py-1 text-xs story-music-track-follow-btn"
            onClick={resumeSceneFocus}
            disabled={availableTracks.length === 0}
          >
            Follow Scene
          </button>
        )}
      </div>
      {availableTracks.length === 0 ? (
        <p className="story-empty">No soundtrack yet.</p>
      ) : (
        <>
          <input
            type="search"
            className="field-input story-music-track-search"
            value={trackQuery}
            onChange={(event) => setTrackQuery(event.target.value)}
            placeholder="Search tracks by title, mood, energy, or tags..."
          />
          <div className="story-music-track-picker-row">
            <select
              id="story-music-track-picker"
              className="field-select story-music-track-picker"
              value={selectedTrackKey}
              onChange={(event) => selectTrackManually(event.target.value)}
              disabled={trackOptions.length === 0}
            >
              {trackOptions.length === 0 ? (
                <option value="">No tracks found</option>
              ) : (
                trackOptions.map((track) => (
                  <option key={track.key} value={track.key}>
                    {buildTrackOptionLabel(track)}
                  </option>
                ))
              )}
            </select>
            <p className="story-music-track-search-meta">
              {filteredTracks.length} match{filteredTracks.length === 1 ? "" : "es"}
            </p>
          </div>
          {selectedTrack ? (
            <StoryMusicTrackCard
              track={selectedTrack}
              isSelected
              showSource
              loop={isLooping}
              onLoopChange={setIsLooping}
              autoPlayRequest={musicAutoPlayRequest}
            />
          ) : (
            <p className="story-empty">No selected track.</p>
          )}
        </>
      )}
    </div>
  );
}

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
                  <button
                    type="button"
                    className="story-scene-music-trigger"
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
              <div className="story-scene-placeholder">
                <span>Illustration pending</span>
              </div>
            )}
            <div className="story-scene-overlay">
              <p className="story-scene-title">{featuredScene.title || "Latest scene"}</p>
              <p className="story-scene-description">{featuredScene.description}</p>
            </div>
          </div>
          {(featuredScene.videoUrl ||
            formatAnimationStatus(
              featuredScene.videoStatus,
              Boolean(featuredScene.videoUrl)
            )) && (
            <div className="story-scene-video">
              {featuredScene.videoUrl ? (
                <video controls preload="metadata" src={featuredScene.videoUrl} />
              ) : (
                <p className="story-scene-video-status">
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
                  <p className="story-scene-video-status">
                    {formatAnimationStatus(
                      featuredScene.videoStatus,
                      Boolean(featuredScene.videoUrl)
                    )}
                  </p>
                )}
            </div>
          )}
          {featuredMusicStatusLabel && (
            <div className="story-scene-music">
              <p className="story-scene-music-status">{featuredMusicStatusLabel}</p>
            </div>
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
                      <button
                        type="button"
                        className="story-scene-music-trigger"
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
                  <div className="story-reader-strip-placeholder">Pending</div>
                )}
              </div>
              <p className="story-reader-strip-title">{scene.title || "Scene beat"}</p>
              {scene.videoUrl ? (
                <div className="story-scene-video">
                  <video controls preload="metadata" src={scene.videoUrl} />
                  {formatAnimationStatus(scene.videoStatus, Boolean(scene.videoUrl)) && (
                    <p className="story-scene-video-status">
                      {formatAnimationStatus(scene.videoStatus, Boolean(scene.videoUrl))}
                    </p>
                  )}
                </div>
              ) : (
                formatAnimationStatus(scene.videoStatus, Boolean(scene.videoUrl)) && (
                  <p className="story-reader-strip-title">
                    {formatAnimationStatus(scene.videoStatus, Boolean(scene.videoUrl))}
                  </p>
                )
              )}
              {formatMusicStatus(scene.musicStatus, Boolean(scene.musicUrl)) && (
                <p className="story-reader-strip-title">
                  {formatMusicStatus(scene.musicStatus, Boolean(scene.musicUrl))}
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
      <StoryMusicTrack
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
