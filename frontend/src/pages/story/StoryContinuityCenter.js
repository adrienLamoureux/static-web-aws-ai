import React, { useMemo, useState } from "react";
import { CONTEXT_SOURCES_BY_MODE, MEMORY_TABS } from "./constants";
import {
  DEFAULT_BUDGET_CAP,
  buildMemoryItems,
  computeRelevance,
  formatStamp,
  getLatestDebugContext,
} from "./storyDirectorUtils";

function StoryContinuityCenter({
  scenes,
  messages,
  input,
  activeSessionDetail,
  illustrationContextMode,
}) {
  const [memoryTab, setMemoryTab] = useState(MEMORY_TABS.TIMELINE);
  const [memoryOpen, setMemoryOpen] = useState(true);
  const [whyResponseOpen, setWhyResponseOpen] = useState(false);

  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant") || null,
    [messages]
  );

  const latestDebugContext = useMemo(() => getLatestDebugContext(scenes), [scenes]);

  const recentEvents =
    Array.isArray(activeSessionDetail?.storyState?.meta?.recentEvents)
      ? activeSessionDetail.storyState.meta.recentEvents
      : [];

  const alwaysOnContext = [
    {
      label: "Active goals",
      value: Array.isArray(activeSessionDetail?.storyState?.goals?.active)
        ? activeSessionDetail.storyState.goals.active.length
        : 0,
    },
    {
      label: "Known locations",
      value: Array.isArray(activeSessionDetail?.lorebook?.locations)
        ? activeSessionDetail.lorebook.locations.length
        : 0,
    },
    {
      label: "Tracked NPCs",
      value: Array.isArray(activeSessionDetail?.lorebook?.npcs)
        ? activeSessionDetail.lorebook.npcs.length
        : 0,
    },
    {
      label: "Scene tags",
      value: Array.isArray(activeSessionDetail?.storyState?.scene?.tags)
        ? activeSessionDetail.storyState.scene.tags.length
        : 0,
    },
  ];

  const budgetSummaryText =
    latestDebugContext?.summary ||
    activeSessionDetail?.storyState?.scene?.description ||
    "";
  const budgetSceneText = scenes[scenes.length - 1]?.prompt || "";
  const budgetLatestText = latestAssistantMessage?.content || "";
  const budgetRecentText = messages.slice(-6).map((message) => message.content).join(" ");

  const budgetSegments = {
    summary: budgetSummaryText,
    scene: budgetSceneText,
    latest: budgetLatestText,
    recent: budgetRecentText,
  };

  const segmentKeys = {
    scene: ["scene"],
    summary: ["summary"],
    "summary+scene": ["summary", "scene"],
    "summary+latest": ["summary", "latest"],
    "summary+recent": ["summary", "recent"],
    recent: ["recent"],
  }[illustrationContextMode] || ["summary", "scene"];

  const estimatedBudgetChars = segmentKeys.reduce(
    (sum, key) => sum + (budgetSegments[key]?.length || 0),
    0
  );

  const budgetPercent = Math.max(
    8,
    Math.min(100, Math.round((estimatedBudgetChars / DEFAULT_BUDGET_CAP) * 100))
  );

  const memoryItems = useMemo(() => buildMemoryItems(messages, scenes), [messages, scenes]);

  const relevanceSeed =
    input.trim() ||
    [...messages].reverse().find((message) => message.role === "user")?.content ||
    "";

  const relevanceItems = useMemo(() => {
    if (!relevanceSeed) return memoryItems;
    return memoryItems
      .map((item) => ({ ...item, score: computeRelevance(item.text, relevanceSeed) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [memoryItems, relevanceSeed]);

  const memoryList =
    memoryTab === MEMORY_TABS.RELEVANCE
      ? relevanceItems.slice(0, 12)
      : memoryItems.slice(0, 12);

  const contextSourceChips = CONTEXT_SOURCES_BY_MODE[illustrationContextMode] || [];

  return (
    <div className="story-director-overview">
      <div className="story-context-grid">
        <article className="story-context-card glass-panel">
          <p className="story-context-eyebrow">Always-on context</p>
          <div className="story-context-stat-grid">
            {alwaysOnContext.map((item) => (
              <div key={item.label} className="story-context-stat">
                <span className="story-context-stat-value">{item.value}</span>
                <span className="story-context-stat-label">{item.label}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="story-context-card glass-panel">
          <p className="story-context-eyebrow">Triggered context</p>
          <div className="story-context-lines">
            <p className="story-context-line">
              <span>Recent events:</span>
              {recentEvents.length > 0
                ? recentEvents.map((event) => event.id || event.type || "event").join(", ")
                : " none"}
            </p>
            <p className="story-context-line">
              <span>Scene mode:</span> {illustrationContextMode}
            </p>
            <p className="story-context-line">
              <span>Latest summary:</span>{" "}
              {latestDebugContext?.summary || "No scene-context summary yet."}
            </p>
          </div>
        </article>

        <article className="story-context-card glass-panel">
          <p className="story-context-eyebrow">Context budget</p>
          <div className="story-budget-row">
            <span>{estimatedBudgetChars} chars estimated</span>
            <span>{budgetPercent}%</span>
          </div>
          <div className="story-budget-track">
            <div className="story-budget-fill" style={{ width: `${budgetPercent}%` }} />
          </div>
          <p className="story-context-hint">
            Keeps prompt payload predictable for stronger continuity over long sessions.
          </p>
        </article>
      </div>

      <div className="story-why-card glass-panel">
        <button
          type="button"
          className="story-disclosure-toggle"
          onClick={() => setWhyResponseOpen((prev) => !prev)}
        >
          <span>Why this response?</span>
          <span>{whyResponseOpen ? "Hide" : "Show"}</span>
        </button>
        {whyResponseOpen && (
          <div className="story-why-body">
            <p className="story-context-line">
              <span>Sources in play:</span>
            </p>
            <div className="story-chip-row">
              {contextSourceChips.map((source) => (
                <span key={source} className="story-mini-chip">
                  {source}
                </span>
              ))}
              {contextSourceChips.length === 0 && (
                <span className="story-mini-chip">No context source selected</span>
              )}
            </div>
            <p className="story-context-line">
              <span>Latest narrator beat:</span>{" "}
              {latestAssistantMessage?.content || "No reply generated yet."}
            </p>
            {latestDebugContext?.latest && (
              <p className="story-context-line">
                <span>Latest context excerpt:</span> {latestDebugContext.latest}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="story-memory-card glass-panel">
        <button
          type="button"
          className="story-disclosure-toggle"
          onClick={() => setMemoryOpen((prev) => !prev)}
        >
          <span>Explore memory</span>
          <span>{memoryOpen ? "Collapse" : "Expand"}</span>
        </button>
        {memoryOpen && (
          <>
            <div className="story-tab-row" role="tablist" aria-label="Memory views">
              <button
                type="button"
                className={`story-tab ${memoryTab === MEMORY_TABS.TIMELINE ? "is-active" : ""}`}
                onClick={() => setMemoryTab(MEMORY_TABS.TIMELINE)}
                role="tab"
                aria-selected={memoryTab === MEMORY_TABS.TIMELINE}
              >
                Timeline
              </button>
              <button
                type="button"
                className={`story-tab ${memoryTab === MEMORY_TABS.RELEVANCE ? "is-active" : ""}`}
                onClick={() => setMemoryTab(MEMORY_TABS.RELEVANCE)}
                role="tab"
                aria-selected={memoryTab === MEMORY_TABS.RELEVANCE}
              >
                Relevance
              </button>
            </div>

            <div className="story-memory-list">
              {memoryList.length === 0 && (
                <p className="story-empty">No memory items yet. Continue writing to populate this panel.</p>
              )}
              {memoryList.map((item) => (
                <article key={item.id} className="story-memory-item">
                  <div className="story-memory-meta">
                    <span className={`story-memory-pill story-memory-pill--${item.type}`}>
                      {item.type}
                    </span>
                    <span>{formatStamp(item.createdAt)}</span>
                  </div>
                  <p className="story-memory-title">{item.title}</p>
                  <p className="story-memory-detail">{item.detail || "No details recorded."}</p>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default StoryContinuityCenter;
