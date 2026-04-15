import React, { useEffect, useMemo, useState } from "react";
import StoryMusicTrackCard from "./StoryMusicTrackCard";

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
    .map((value) =>
      String(value || "")
        .trim()
        .toLowerCase()
    )
    .filter(Boolean)
    .join(" ");
};

export default function StoryMusicTrackInline({
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
        const normalizedTags = Array.isArray(candidate.tags) ? candidate.tags.filter(Boolean) : [];
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
          tempoBpm: typeof candidate.tempoBpm === "number" ? candidate.tempoBpm : null,
          tags: normalizedTags,
          createdAt: candidate.createdAt || "",
        });
        return;
      }
      const candidateTags = Array.isArray(candidate.tags) ? candidate.tags.filter(Boolean) : [];
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
        tempoBpm: typeof scene.musicTempoBpm === "number" ? scene.musicTempoBpm : null,
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
        tempoBpm: typeof track.tempoBpm === "number" ? track.tempoBpm : null,
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
      const hasManualTrack = availableTracks.some((track) => track.key === manualOverrideTrackKey);
      if (hasManualTrack) return manualOverrideTrackKey;
    }
    const hasActiveTrack = availableTracks.some((track) => track.key === activeMusicTrackKey);
    if (hasActiveTrack) return activeMusicTrackKey;
    if (!isManualOverride && focusedSceneTrackKey) {
      const hasFocusedTrack = availableTracks.some((track) => track.key === focusedSceneTrackKey);
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
    const hasFocusedTrack = availableTracks.some((track) => track.key === focusedSceneTrackKey);
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
    const selectedInResults = filteredTracks.some((track) => track.key === selectedTrack.key);
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
    const hasManualTrack = availableTracks.some((track) => track.key === manualOverrideTrackKey);
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
