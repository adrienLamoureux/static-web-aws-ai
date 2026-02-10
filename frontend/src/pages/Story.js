import React, { useEffect, useMemo, useState } from "react";
import {
  createStorySession,
  deleteStorySession,
  generateStoryIllustration,
  getStorySession,
  listStoryPresets,
  listStorySessions,
  sendStoryMessage,
} from "../services/story";

function Story({ apiBaseUrl = "" }) {
  const [presets, setPresets] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [messages, setMessages] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [illustrationContextMode, setIllustrationContextMode] = useState(
    "summary+scene"
  );
  const [illustrationDebugEnabled, setIllustrationDebugEnabled] = useState(true);

  const resolvedApiBaseUrl = apiBaseUrl || process.env.REACT_APP_API_URL || "";

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [sessions, activeSessionId]
  );

  useEffect(() => {
    if (!resolvedApiBaseUrl) return;
    listStoryPresets(resolvedApiBaseUrl)
      .then((data) => {
        setPresets(data.presets || []);
        setSelectedPresetId((prev) => prev || data.presets?.[0]?.id || "");
      })
      .catch((err) => {
        setError(err?.message || "Failed to load presets.");
      });
  }, [resolvedApiBaseUrl]);

  const refreshSessions = () => {
    if (!resolvedApiBaseUrl) return;
    listStorySessions(resolvedApiBaseUrl)
      .then((data) => {
        setSessions(data.sessions || []);
      })
      .catch((err) => {
        setError(err?.message || "Failed to load sessions.");
      });
  };

  useEffect(() => {
    if (!resolvedApiBaseUrl) return;
    refreshSessions();
  }, [resolvedApiBaseUrl]);

  const loadSession = async (sessionId) => {
    if (!resolvedApiBaseUrl || !sessionId) return;
    setIsLoadingSession(true);
    setError("");
    try {
      const data = await getStorySession(resolvedApiBaseUrl, sessionId);
      setActiveSessionId(sessionId);
      setMessages(data.messages || []);
      setScenes(data.scenes || []);
    } catch (err) {
      setError(err?.message || "Failed to load session.");
    } finally {
      setIsLoadingSession(false);
    }
  };

  const handleDeleteSession = async (session) => {
    if (!session?.id) return;
    const confirmed = window.confirm(
      `Delete "${session.title}"? This will remove the session, messages, and scenes.`
    );
    if (!confirmed) return;
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    setError("");
    try {
      await deleteStorySession(resolvedApiBaseUrl, session.id);
      setSessions((prev) => prev.filter((item) => item.id !== session.id));
      if (activeSessionId === session.id) {
        setActiveSessionId("");
        setMessages([]);
        setScenes([]);
      }
    } catch (err) {
      setError(err?.message || "Failed to delete session.");
    }
  };

  const triggerIllustration = async (sessionId, sceneId, options = {}) => {
    if (!resolvedApiBaseUrl || !sessionId || !sceneId) return;
    const shouldDebug =
      typeof options.debug === "boolean"
        ? options.debug
        : illustrationDebugEnabled;
    try {
      const illustration = await generateStoryIllustration(
        resolvedApiBaseUrl,
        sessionId,
        {
          sceneId,
          contextMode:
            options.contextMode || illustrationContextMode,
          ...(options.regenerate ? { regenerate: true } : {}),
        },
        { debug: shouldDebug }
      );
      if (illustration?.imageUrl) {
        const debugData =
          illustration?.identity || illustration?.context || illustration?.replicate
            ? {
                identity: illustration.identity,
                context: illustration.context,
                promptPattern: illustration.promptPattern,
                replicate: illustration.replicate,
              }
            : null;
        setScenes((prev) =>
          prev.map((scene) =>
            scene.sceneId === sceneId
              ? {
                  ...scene,
                  status: "completed",
                  imageUrl: illustration.imageUrl,
                  imageKey: illustration.imageKey,
                  promptPositive: illustration.prompt?.positive || scene.promptPositive,
                  promptNegative: illustration.prompt?.negative || scene.promptNegative,
                  sceneEnvironment:
                    illustration.context?.sceneEnvironment ||
                    scene.sceneEnvironment,
                  sceneAction:
                    illustration.context?.sceneAction || scene.sceneAction,
                  debug: debugData || scene.debug,
                }
              : scene
          )
        );
      }
    } catch (err) {
      setError(err?.message || "Failed to generate illustration.");
    }
  };

  const handleCreateSession = async () => {
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    if (!selectedPresetId) {
      setError("Select a preset to begin.");
      return;
    }
    setStatus("creating");
    setError("");
    try {
      const data = await createStorySession(resolvedApiBaseUrl, {
        presetId: selectedPresetId,
      });
      if (data?.session) {
        setSessions((prev) => [data.session, ...prev]);
        setActiveSessionId(data.session.id);
        setMessages(data.messages || []);
        setScenes(data.scenes || []);
          const openingScene = data.scenes?.[0];
          if (openingScene?.sceneId) {
            await triggerIllustration(data.session.id, openingScene.sceneId);
          }
      }
      setStatus("idle");
    } catch (err) {
      setStatus("idle");
      setError(err?.message || "Failed to create session.");
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    if (!resolvedApiBaseUrl || !activeSessionId) {
      setError("Select or create a story session first.");
      return;
    }
    const messageText = input.trim();
    setInput("");
    setStatus("sending");
    setError("");

    const userMessage = {
      role: "user",
      content: messageText,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const data = await sendStoryMessage(
        resolvedApiBaseUrl,
        activeSessionId,
        { content: messageText }
      );
      if (data?.assistant?.content) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.assistant.content,
            createdAt: new Date().toISOString(),
          },
        ]);
      }

      if (data?.scene?.sceneId) {
        const pendingScene = {
          ...data.scene,
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        setScenes((prev) => [...prev, pendingScene]);
        await triggerIllustration(activeSessionId, data.scene.sceneId, {
          contextMode: illustrationContextMode,
        });
      }
      refreshSessions();
    } catch (err) {
      setError(err?.message || "Failed to send message.");
    } finally {
      setStatus("idle");
    }
  };

  return (
    <section className="story-page">
      <header className="story-hero">
        <p className="whisk-eyebrow">Whisk Studio</p>
        <h1 className="story-title">Storytelling Studio</h1>
        <p className="story-subtitle">
          A living illustrated novel. Chat on the left, story art on the right.
        </p>
      </header>

      <div className="story-config glass-panel">
        <div className="story-config-section">
          <div className="story-config-header">
            <h2 className="story-section-title">Sessions</h2>
            <button
              type="button"
              className="btn-ghost px-4 py-1 text-xs"
              onClick={refreshSessions}
            >
              Refresh
            </button>
          </div>
          <div className="story-session-list">
            {sessions.length === 0 && (
              <p className="story-empty">No sessions yet.</p>
            )}
            {sessions.map((session) => (
              <div key={session.id} className="story-session-row">
                <button
                  type="button"
                  className={`story-session-item ${
                    session.id === activeSessionId ? "is-active" : ""
                  }`}
                  onClick={() => loadSession(session.id)}
                >
                  <span className="story-session-title">{session.title}</span>
                  <span className="story-session-meta">
                    {session.turnCount} turns · {session.sceneCount} scenes
                  </span>
                </button>
                <button
                  type="button"
                  className="story-session-delete"
                  onClick={() => handleDeleteSession(session)}
                  aria-label={`Delete ${session.title}`}
                  title="Delete session"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="story-config-divider" />

        <div className="story-config-section">
          <div className="story-config-header">
            <h2 className="story-section-title">Scenario presets</h2>
          </div>
          <div className="story-preset-grid">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`story-preset-card ${
                  preset.id === selectedPresetId ? "is-selected" : ""
                }`}
                onClick={() => setSelectedPresetId(preset.id)}
              >
                <p className="story-preset-title">{preset.name}</p>
                <p className="story-preset-copy">{preset.synopsis}</p>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-primary mt-4 w-full py-2 text-sm"
            onClick={handleCreateSession}
            disabled={status === "creating"}
          >
            {status === "creating" ? "Creating..." : "Start new story"}
          </button>
        </div>
      </div>

      <div className="story-book">
        <div className="story-book-column story-book-text">
          <div className="story-chat-header">
            <div>
              <h2 className="story-section-title">
                {activeSession?.title || "Story"}
              </h2>
              {activeSession?.synopsis && (
                <p className="story-chat-subtitle">{activeSession.synopsis}</p>
              )}
            </div>
            <span className="story-chat-meta">
              {activeSession
                ? `${activeSession.turnCount || 0} turns`
                : "No session"}
            </span>
          </div>

          <div className="story-chat-thread">
            {isLoadingSession && (
              <p className="story-empty">Loading session...</p>
            )}
            {!isLoadingSession && messages.length === 0 && (
              <p className="story-empty">
                Start by choosing a preset and begin chatting.
              </p>
            )}
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`story-message story-message--${message.role}`}
              >
                <div className="story-message-bubble">{message.content}</div>
              </div>
            ))}
          </div>

          <div className="story-chat-input">
            <textarea
              className="field-textarea"
              placeholder={
                activeSession
                  ? "Describe what you do next..."
                  : "Select a session to begin..."
              }
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={!activeSessionId || status === "sending"}
              rows={3}
            />
            <div className="story-chat-actions">
              <button
                type="button"
                className="btn-accent px-6 py-2 text-sm"
                onClick={handleSendMessage}
                disabled={!input.trim() || status === "sending"}
              >
                {status === "sending" ? "Sending..." : "Send"}
              </button>
              <span className="story-chat-hint">
                Illustrations appear on impactful moments, max one every 3 turns.
              </span>
            </div>
          </div>
        </div>

        <div className="story-book-spine" />

        <div className="story-book-column story-book-images">
          <div className="story-scenes-header">
            <h2 className="story-section-title">Illustrations</h2>
            <span className="story-scenes-meta">
              {scenes.length} scene{scenes.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="story-scenes-controls">
            <label className="story-scenes-label" htmlFor="story-context-mode">
              Illustration context
            </label>
            <select
              id="story-context-mode"
              className="field-select story-scenes-select"
              value={illustrationContextMode}
              onChange={(event) =>
                setIllustrationContextMode(event.target.value)
              }
            >
              <option value="scene">Scene prompt only</option>
              <option value="summary">Summary only (Haiku)</option>
              <option value="summary+scene">Summary + scene</option>
              <option value="summary+latest">Summary + latest reply</option>
              <option value="summary+recent">Summary + recent turns</option>
              <option value="recent">Recent turns only</option>
            </select>
            <label className="story-scenes-toggle">
              <input
                type="checkbox"
                checked={illustrationDebugEnabled}
                onChange={(event) =>
                  setIllustrationDebugEnabled(event.target.checked)
                }
              />
              Include debug data
            </label>
          </div>
          <div className="story-scene-grid">
            {scenes.length === 0 && (
              <div className="story-empty">
                No illustrations yet. Keep chatting to unlock scene beats.
              </div>
            )}
            {scenes.map((scene) => (
              <div key={scene.sceneId} className="story-scene-item">
                <div className="story-scene-card">
                  {scene.imageUrl ? (
                    <>
                      <img src={scene.imageUrl} alt={scene.title || "Scene"} />
                      <button
                        type="button"
                        className="story-scene-regenerate"
                        onClick={() =>
                          triggerIllustration(activeSessionId, scene.sceneId, {
                            regenerate: true,
                          })
                        }
                      >
                        Regenerate
                      </button>
                    </>
                  ) : (
                    <div className="story-scene-placeholder">
                      <span>Illustration pending</span>
                      <button
                        type="button"
                        className="story-scene-generate"
                        onClick={() =>
                          triggerIllustration(activeSessionId, scene.sceneId)
                        }
                        disabled={status === "sending"}
                      >
                        Generate
                      </button>
                      </div>
                    )}
                    <div className="story-scene-overlay">
                      <p className="story-scene-title">
                        {scene.title || "Scene beat"}
                      </p>
                      <p className="story-scene-description">
                        {scene.description}
                      </p>
                    </div>
                  </div>
                  {illustrationDebugEnabled && (
                    <div className="story-scene-debug">
                      <p className="story-debug-title">Debug</p>
                      <p className="story-debug-line">
                        <span className="story-debug-label">Scene prompt:</span>{" "}
                        {scene.prompt || "—"}
                      </p>
                      <p className="story-debug-line">
                        <span className="story-debug-label">Scene environment:</span>{" "}
                        {scene.sceneEnvironment || "—"}
                      </p>
                      <p className="story-debug-line">
                        <span className="story-debug-label">Scene action:</span>{" "}
                        {scene.sceneAction || "—"}
                      </p>
                      <p className="story-debug-line">
                        <span className="story-debug-label">Positive prompt:</span>{" "}
                        {scene.promptPositive || "—"}
                      </p>
                      <p className="story-debug-line">
                        <span className="story-debug-label">Negative prompt:</span>{" "}
                        {scene.promptNegative || "—"}
                      </p>
                      {scene.debug?.context && (
                        <>
                          <p className="story-debug-line">
                            <span className="story-debug-label">Context mode:</span>{" "}
                            {scene.debug.context.mode || "—"}
                          </p>
                          <p className="story-debug-line">
                            <span className="story-debug-label">Context summary:</span>{" "}
                            {scene.debug.context.summary || "—"}
                          </p>
                          <p className="story-debug-line">
                            <span className="story-debug-label">Context latest:</span>{" "}
                            {scene.debug.context.latest || "—"}
                          </p>
                          <p className="story-debug-line">
                            <span className="story-debug-label">Context recent:</span>{" "}
                            {scene.debug.context.recent || "—"}
                          </p>
                        </>
                      )}
                      {scene.debug?.replicate?.input && (
                        <pre className="story-debug-code">
                          {JSON.stringify(scene.debug.replicate.input, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

      {error && <div className="whisk-error-panel">{error}</div>}
    </section>
  );
}

export default Story;
