import React, { useState, useEffect, useCallback, useMemo } from "react";
import SolarisTrackCard from "../components/music/SolarisTrackCard";
import { useConfig } from "../contexts/ConfigContext";
import SanctumSubNav from "../components/sakura/sanctum/SanctumSubNav";
import { useMusic } from "../contexts/MusicContext";
import { putFileToUrl } from "../services/s3";
import {
  listStoryMusicLibrary,
  requestStoryMusicUploadUrl,
  saveUploadedStoryMusicTrack,
} from "../services/story";
import { buildSafeFileName } from "../utils/fileName";

const AUDIO_TYPES = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
};

const inferContentType = (file) => {
  const t = String(file?.type || "")
    .trim()
    .toLowerCase();
  if (t.startsWith("audio/")) return t;
  const ext = String(file?.name || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  return AUDIO_TYPES[ext] || "";
};

const parseTagList = (value = "") =>
  Array.from(
    new Set(
      String(value)
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 12);

export default function StoryMusicLibrary() {
  const { apiBaseUrl } = useConfig();
  const { pushTracks, playTrack, currentTrack } = useMusic();

  // Search state
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalMatches, setTotalMatches] = useState(0);
  const [query, setQuery] = useState("");
  const [searchMood, setSearchMood] = useState("");
  const [searchEnergy, setSearchEnergy] = useState("");
  const [searchTags, setSearchTags] = useState("");
  const [searchSource, setSearchSource] = useState("");

  // Upload form state
  const [selectedFile, setSelectedFile] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [mood, setMood] = useState("");
  const [energy, setEnergy] = useState("");
  const [tempoInput, setTempoInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");

  const searchParams = useMemo(
    () => ({
      q: query.trim(),
      mood: searchMood.trim().toLowerCase(),
      energy: searchEnergy.trim().toLowerCase(),
      tags: searchTags.trim(),
      source: searchSource.trim().toLowerCase(),
      limit: 200,
    }),
    [query, searchMood, searchEnergy, searchTags, searchSource]
  );

  const refreshTracks = useCallback(
    async (params = {}) => {
      if (!apiBaseUrl) return;
      setLoading(true);
      try {
        const data = await listStoryMusicLibrary(apiBaseUrl, params);
        const list = data?.tracks || [];
        setTracks(list);
        setTotalMatches(Number.isFinite(Number(data?.total)) ? Number(data.total) : list.length);
        pushTracks(list);
      } catch {
        setTracks([]);
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl, pushTracks]
  );

  useEffect(() => {
    if (!apiBaseUrl) return;
    const id = setTimeout(() => refreshTracks(searchParams), 250);
    return () => clearTimeout(id);
  }, [apiBaseUrl, refreshTracks, searchParams]);

  const resetForm = () => {
    setSelectedFile(null);
    setTitle("");
    setDescription("");
    setTagsInput("");
    setMood("");
    setEnergy("");
    setTempoInput("");
  };

  const onFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    if (file && !title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!apiBaseUrl) {
      setUploadError("API base URL missing.");
      return;
    }
    if (!selectedFile) {
      setUploadError("Select an audio file first.");
      return;
    }
    if (!title.trim()) {
      setUploadError("Title is required.");
      return;
    }
    const contentType = inferContentType(selectedFile);
    if (!contentType) {
      setUploadError("Unsupported format. Use mp3, wav, ogg, m4a, aac, or flac.");
      return;
    }

    setUploadError("");
    setUploadNotice("");
    setIsUploading(true);
    const safeBase = (buildSafeFileName(title.trim()) || "track").replace(/\.[^.]+$/, "");
    const parsedTempo = Number(tempoInput);
    const tempoBpm =
      Number.isFinite(parsedTempo) && parsedTempo > 0 ? Math.round(parsedTempo) : undefined;

    try {
      const uploadData = await requestStoryMusicUploadUrl(apiBaseUrl, {
        fileName: safeBase,
        contentType,
      });
      await putFileToUrl(uploadData.url, selectedFile, contentType);
      await saveUploadedStoryMusicTrack(apiBaseUrl, {
        trackId: uploadData.trackId,
        key: uploadData.key,
        title: title.trim(),
        description: description.trim(),
        tags: parseTagList(tagsInput),
        mood: mood.trim().toLowerCase(),
        energy: energy.trim().toLowerCase(),
        tempoBpm,
        prompt: description.trim(),
      });
      setUploadNotice("Track uploaded successfully!");
      resetForm();
      await refreshTracks(searchParams);
    } catch (err) {
      setUploadError(err?.message || "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const autoPlayRequest = useMemo(() => ({ requestId: 0, trackKey: null }), []);

  return (
    <div>
      <SanctumSubNav />
      <div className="skr-page-header">
        <h2 className="skr-page-title">Story Music Library</h2>
        <p className="skr-page-subtitle">Upload and categorize soundtracks</p>
      </div>

      <div className="skr-lora-grid" style={{ gridTemplateColumns: "minmax(260px,1fr) 2fr" }}>
        {/* Upload panel */}
        <div className="skr-lora-panel">
          <p className="skr-lora-section-title">Upload music</p>
          <form
            onSubmit={handleUpload}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <div>
              <label className="skr-field-label" htmlFor="music-file">
                Audio file
              </label>
              <input
                id="music-file"
                type="file"
                accept="audio/*"
                className="skr-input"
                onChange={onFileChange}
                disabled={isUploading}
              />
            </div>
            <div>
              <label className="skr-field-label" htmlFor="music-title">
                Title
              </label>
              <input
                id="music-title"
                className="skr-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Forest ambience"
                maxLength={120}
                disabled={isUploading}
              />
            </div>
            <div>
              <label className="skr-field-label" htmlFor="music-desc">
                Description
              </label>
              <textarea
                id="music-desc"
                className="skr-field-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Warm strings, magical atmosphere…"
                rows={3}
                maxLength={800}
                disabled={isUploading}
              />
            </div>
            <div>
              <label className="skr-field-label" htmlFor="music-tags">
                Tags (comma-separated)
              </label>
              <input
                id="music-tags"
                className="skr-input"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="fantasy, calm, exploration"
                maxLength={240}
                disabled={isUploading}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div>
                <label className="skr-field-label" htmlFor="music-mood">
                  Mood
                </label>
                <input
                  id="music-mood"
                  className="skr-input"
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                  placeholder="calm"
                  maxLength={40}
                  disabled={isUploading}
                />
              </div>
              <div>
                <label className="skr-field-label" htmlFor="music-energy">
                  Energy
                </label>
                <select
                  id="music-energy"
                  className="skr-field-select"
                  value={energy}
                  onChange={(e) => setEnergy(e.target.value)}
                  disabled={isUploading}
                >
                  <option value="">Select</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </div>
              <div>
                <label className="skr-field-label" htmlFor="music-tempo">
                  BPM
                </label>
                <input
                  id="music-tempo"
                  type="number"
                  min="1"
                  className="skr-input"
                  value={tempoInput}
                  onChange={(e) => setTempoInput(e.target.value)}
                  placeholder="96"
                  disabled={isUploading}
                />
              </div>
            </div>
            {uploadError && (
              <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{uploadError}</p>
            )}
            {uploadNotice && (
              <p style={{ fontSize: 12, color: "var(--skr-accent)", margin: 0 }}>{uploadNotice}</p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="skr-btn-primary" disabled={isUploading}>
                {isUploading ? "Uploading…" : "Upload Track"}
              </button>
              <button
                type="button"
                className="skr-btn-secondary"
                onClick={resetForm}
                disabled={isUploading}
              >
                Reset
              </button>
            </div>
          </form>
        </div>

        {/* Search / library panel */}
        <div className="skr-lora-panel">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <p className="skr-lora-section-title" style={{ margin: 0 }}>
              Saved tracks
            </p>
            <button
              className="skr-btn-secondary"
              style={{ padding: "4px 10px", fontSize: 12 }}
              onClick={() => refreshTracks(searchParams)}
              disabled={loading}
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}
          >
            <input
              className="skr-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, description…"
            />
            <input
              className="skr-input"
              value={searchTags}
              onChange={(e) => setSearchTags(e.target.value)}
              placeholder="Filter tags"
            />
            <input
              className="skr-input"
              value={searchMood}
              onChange={(e) => setSearchMood(e.target.value)}
              placeholder="Filter mood"
              maxLength={40}
            />
            <select
              className="skr-field-select"
              value={searchEnergy}
              onChange={(e) => setSearchEnergy(e.target.value)}
            >
              <option value="">Energy: all</option>
              <option value="low">Energy: low</option>
              <option value="medium">Energy: medium</option>
              <option value="high">Energy: high</option>
            </select>
            <select
              className="skr-field-select"
              style={{ gridColumn: "1 / -1" }}
              value={searchSource}
              onChange={(e) => setSearchSource(e.target.value)}
            >
              <option value="">Source: all</option>
              <option value="upload">Source: upload</option>
              <option value="generated">Source: generated</option>
            </select>
          </div>
          <p style={{ fontSize: 12, color: "var(--skr-text-tertiary)", marginBottom: 12 }}>
            {loading ? "Searching…" : `${totalMatches} track(s) matched`}
          </p>
          <div>
            {tracks.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: 24,
                  color: "var(--skr-text-tertiary)",
                  fontSize: 13,
                }}
              >
                {loading ? "Loading tracks…" : "No tracks found."}
              </div>
            ) : (
              tracks.map((track) => (
                <SolarisTrackCard
                  key={track.trackId || track.key}
                  track={track}
                  isSelected={
                    currentTrack?.key === track.key || currentTrack?.trackId === track.trackId
                  }
                  onSelect={() => playTrack(track)}
                  autoPlayRequest={autoPlayRequest}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
