import React, { useCallback, useEffect, useMemo, useState } from "react";
import { putFileToUrl } from "../services/s3";
import {
  listStoryMusicLibrary,
  requestStoryMusicUploadUrl,
  saveUploadedStoryMusicTrack,
} from "../services/story";
import { buildSafeFileName } from "../utils/fileName";
import StoryMusicTrackCard from "./story/StoryMusicTrackCard";

const AUDIO_CONTENT_TYPE_BY_EXTENSION = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
};

const inferAudioContentType = (file) => {
  const type = String(file?.type || "").trim().toLowerCase();
  if (type.startsWith("audio/")) return type;
  const extension = String(file?.name || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  return AUDIO_CONTENT_TYPE_BY_EXTENSION[extension] || "";
};

const parseTagList = (value = "") =>
  Array.from(
    new Set(
      String(value)
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 12);

function StoryMusicLibrary({ apiBaseUrl = "" }) {
  const resolvedApiBaseUrl = apiBaseUrl || process.env.REACT_APP_API_URL || "";
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [totalMatches, setTotalMatches] = useState(0);
  const [query, setQuery] = useState("");
  const [searchMood, setSearchMood] = useState("");
  const [searchEnergy, setSearchEnergy] = useState("");
  const [searchTags, setSearchTags] = useState("");
  const [searchSource, setSearchSource] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [mood, setMood] = useState("");
  const [energy, setEnergy] = useState("");
  const [tempoInput, setTempoInput] = useState("");

  const searchParams = useMemo(
    () => ({
      q: query.trim(),
      mood: searchMood.trim().toLowerCase(),
      energy: searchEnergy.trim().toLowerCase(),
      tags: searchTags.trim(),
      source: searchSource.trim().toLowerCase(),
      limit: 200,
    }),
    [query, searchEnergy, searchMood, searchSource, searchTags]
  );

  const refreshTracks = useCallback(async (params = {}) => {
    if (!resolvedApiBaseUrl) return;
    setLoading(true);
    setError("");
    try {
      const data = await listStoryMusicLibrary(resolvedApiBaseUrl, params);
      setTracks(data.tracks || []);
      setTotalMatches(
        Number.isFinite(Number(data.total))
          ? Number(data.total)
          : (data.tracks || []).length
      );
    } catch (err) {
      setError(err?.message || "Failed to load music library.");
    } finally {
      setLoading(false);
    }
  }, [resolvedApiBaseUrl]);

  useEffect(() => {
    if (!resolvedApiBaseUrl) return;
    const timerId = setTimeout(() => {
      refreshTracks(searchParams);
    }, 250);
    return () => clearTimeout(timerId);
  }, [refreshTracks, resolvedApiBaseUrl, searchParams]);

  const resetForm = () => {
    setSelectedFile(null);
    setTitle("");
    setDescription("");
    setTagsInput("");
    setMood("");
    setEnergy("");
    setTempoInput("");
  };

  const onFileChange = (event) => {
    const nextFile = event.target.files?.[0] || null;
    setSelectedFile(nextFile);
    if (nextFile && !title.trim()) {
      const baseName = nextFile.name.replace(/\.[^.]+$/, "");
      setTitle(baseName);
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    if (!selectedFile) {
      setError("Select an audio file first.");
      return;
    }
    if (!title.trim()) {
      setError("Track title is required.");
      return;
    }
    const contentType = inferAudioContentType(selectedFile);
    if (!contentType) {
      setError("Unsupported file type. Use mp3, wav, ogg, m4a, aac, or flac.");
      return;
    }

    setError("");
    setNotice("");
    setIsUploading(true);

    const safeName = buildSafeFileName(title.trim()) || "track";
    const safeBase = safeName.replace(/\.[^.]+$/, "");
    const parsedTempo = Number(tempoInput);
    const tempoBpm =
      Number.isFinite(parsedTempo) && parsedTempo > 0
        ? Math.round(parsedTempo)
        : undefined;

    try {
      const uploadData = await requestStoryMusicUploadUrl(resolvedApiBaseUrl, {
        fileName: safeBase,
        contentType,
      });
      await putFileToUrl(uploadData.url, selectedFile, contentType);

      const metadataData = await saveUploadedStoryMusicTrack(
        resolvedApiBaseUrl,
        {
          trackId: uploadData.trackId,
          key: uploadData.key,
          title: title.trim(),
          description: description.trim(),
          tags: parseTagList(tagsInput),
          mood: mood.trim().toLowerCase(),
          energy: energy.trim().toLowerCase(),
          tempoBpm,
          prompt: description.trim(),
        }
      );

      if (metadataData?.track?.trackId) {
        setTracks((prev) => {
          const filtered = prev.filter(
            (item) => item.trackId !== metadataData.track.trackId
          );
          return [metadataData.track, ...filtered];
        });
        await refreshTracks(searchParams);
      } else {
        await refreshTracks(searchParams);
      }
      setNotice("Music uploaded and saved to your library.");
      resetForm();
    } catch (err) {
      setError(err?.message || "Music upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section className="music-library-page">
      <div className="music-library-hero">
        <p className="music-library-eyebrow">Music Library</p>
        <h1 className="music-library-title">Upload and categorize soundtracks</h1>
        <p className="music-library-copy">
          Add your own tracks with description and tags so they are easier to
          find later.
        </p>
      </div>

      <div className="music-library-grid">
        <div className="music-library-panel glass-panel">
          <h2 className="music-library-panel-title">Upload music</h2>
          <p className="music-library-panel-copy">
            Description, tags, mood, and energy are stored for future search.
          </p>
          <form className="music-library-form" onSubmit={handleUpload}>
            <label className="field-label" htmlFor="music-file">
              Audio file
            </label>
            <input
              id="music-file"
              type="file"
              accept="audio/*"
              className="field-input"
              onChange={onFileChange}
              disabled={isUploading}
            />

            <label className="field-label" htmlFor="music-title">
              Title
            </label>
            <input
              id="music-title"
              className="field-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Forest ambience"
              maxLength={120}
              disabled={isUploading}
            />

            <label className="field-label" htmlFor="music-description">
              Description
            </label>
            <textarea
              id="music-description"
              className="field-textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Warm strings, magical atmosphere, good for exploration scenes."
              rows={4}
              maxLength={800}
              disabled={isUploading}
            />

            <label className="field-label" htmlFor="music-tags">
              Tags (comma-separated)
            </label>
            <input
              id="music-tags"
              className="field-input"
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="fantasy, calm, exploration"
              maxLength={240}
              disabled={isUploading}
            />

            <div className="music-library-row">
              <div>
                <label className="field-label" htmlFor="music-mood">
                  Mood
                </label>
                <input
                  id="music-mood"
                  className="field-input"
                  value={mood}
                  onChange={(event) => setMood(event.target.value)}
                  placeholder="calm"
                  maxLength={40}
                  disabled={isUploading}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="music-energy">
                  Energy
                </label>
                <select
                  id="music-energy"
                  className="field-select"
                  value={energy}
                  onChange={(event) => setEnergy(event.target.value)}
                  disabled={isUploading}
                >
                  <option value="">Select</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="music-tempo">
                  Tempo BPM
                </label>
                <input
                  id="music-tempo"
                  type="number"
                  min="1"
                  className="field-input"
                  value={tempoInput}
                  onChange={(event) => setTempoInput(event.target.value)}
                  placeholder="96"
                  disabled={isUploading}
                />
              </div>
            </div>

            <div className="music-library-actions">
              <button
                type="submit"
                className="btn-primary px-4 py-2 text-sm"
                disabled={isUploading}
              >
                {isUploading ? "Uploading..." : "Upload Track"}
              </button>
              <button
                type="button"
                className="btn-ghost px-4 py-2 text-sm"
                onClick={resetForm}
                disabled={isUploading}
              >
                Reset
              </button>
            </div>
          </form>

          {notice && <p className="music-library-notice">{notice}</p>}
          {error && <p className="music-library-error">{error}</p>}
        </div>

        <div className="music-library-panel glass-panel">
          <div className="music-library-list-header">
            <h2 className="music-library-panel-title">Saved tracks</h2>
            <button
              type="button"
              className="btn-ghost px-3 py-1 text-xs"
              onClick={() => refreshTracks(searchParams)}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div className="music-library-search-grid">
            <input
              className="field-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title, description, prompt..."
            />
            <input
              className="field-input"
              value={searchTags}
              onChange={(event) => setSearchTags(event.target.value)}
              placeholder="Filter tags: fantasy, calm"
            />
            <input
              className="field-input"
              value={searchMood}
              onChange={(event) => setSearchMood(event.target.value)}
              placeholder="Filter mood"
              maxLength={40}
            />
            <select
              className="field-select"
              value={searchEnergy}
              onChange={(event) => setSearchEnergy(event.target.value)}
            >
              <option value="">Energy: all</option>
              <option value="low">Energy: low</option>
              <option value="medium">Energy: medium</option>
              <option value="high">Energy: high</option>
            </select>
            <select
              className="field-select"
              value={searchSource}
              onChange={(event) => setSearchSource(event.target.value)}
            >
              <option value="">Source: all</option>
              <option value="upload">Source: upload</option>
              <option value="generated">Source: generated</option>
            </select>
          </div>
          <p className="music-library-count">
            {loading ? "Searching..." : `${totalMatches} track(s) matched`}
          </p>
          <div className="music-library-list">
            {tracks.length === 0 ? (
              <p className="music-library-empty">
                {loading ? "Loading tracks..." : "No tracks found."}
              </p>
            ) : (
              tracks.map((track) => (
                <StoryMusicTrackCard key={track.trackId || track.key} track={track} />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default StoryMusicLibrary;
