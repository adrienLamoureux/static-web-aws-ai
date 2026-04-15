import React, { useState, useEffect } from "react";
import { pinDirectorStorySession, fetchAllStorySessions } from "../../services/operations";
import { formatTimestamp } from "../../utils/dateFormat";
import EmptyRow from "../../components/sakura/EmptyRow";
import { useNotify } from "../../components/sakura/NotificationStack";

const SESSION_TABS = ["My Sessions", "All Users"];

/**
 * StorySessions
 * Props: { apiBaseUrl, sessions, isLoading, onRefresh }
 */
export default function StorySessions({ apiBaseUrl, sessions, isLoading, onRefresh }) {
  const notify = useNotify();
  const [pinning, setPinning] = useState("");
  const [activeTab, setActiveTab] = useState(0);
  const [allSessions, setAllSessions] = useState([]);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (activeTab !== 1 || !apiBaseUrl) return;
    setIsLoadingAll(true);
    fetchAllStorySessions(apiBaseUrl, {})
      .then((data) => setAllSessions(data?.sessions || []))
      .catch((e) => notify(e?.message || "Failed to load all sessions.", "error"))
      .finally(() => setIsLoadingAll(false));
  }, [activeTab, apiBaseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePin = async (session) => {
    if (!apiBaseUrl) return;
    setPinning(session.sessionId);
    try {
      await pinDirectorStorySession(apiBaseUrl, {
        sessionId: session.sessionId,
        pinned: !session.pinned,
      });
      onRefresh();
    } catch (e) {
      notify(e?.message || "Failed to pin session.", "error");
    } finally {
      setPinning("");
    }
  };

  const activeSessions = activeTab === 0 ? sessions : allSessions;
  const activeIsLoading = activeTab === 0 ? isLoading : isLoadingAll;

  const filtered = activeSessions.filter(
    (s) => !search || (s.title || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ marginTop: 24 }}>
      <div className="skr-section-header">
        <h3 className="skr-section-title">Story Sessions</h3>
      </div>
      <div className="skr-tab-bar" style={{ marginBottom: 8 }}>
        {SESSION_TABS.map((t, i) => (
          <button
            key={t}
            className={`skr-tab${activeTab === i ? " is-active" : ""}`}
            onClick={() => setActiveTab(i)}
          >
            {t}
          </button>
        ))}
      </div>
      <input
        className="skr-input"
        style={{ fontSize: 12, marginBottom: 8, width: "100%" }}
        placeholder="Search sessions…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="skr-card" style={{ padding: 0, overflow: "hidden" }}>
        {activeIsLoading ? (
          <p style={{ padding: "16px", fontSize: 12, color: "var(--skr-text-tertiary)" }}>
            Loading…
          </p>
        ) : filtered.length === 0 ? (
          <EmptyRow message="No story sessions yet — sessions will appear here once users start a story." />
        ) : (
          filtered.map((session, i) => (
            <div
              key={session.sessionId || i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 16px",
                borderBottom: i < filtered.length - 1 ? "1px solid var(--skr-border)" : "none",
              }}
            >
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--skr-text-primary)",
                    margin: 0,
                  }}
                >
                  {session.title || session.name || session.sessionId?.slice(0, 12) || "Session"}
                  {session.pinned && (
                    <span className="skr-chip accent" style={{ marginLeft: 8 }}>
                      Pinned
                    </span>
                  )}
                  {activeTab === 1 && session.userId && (
                    <span className="skr-chip" style={{ marginLeft: 8, fontSize: 10 }}>
                      {session.userId.slice(0, 12)}
                    </span>
                  )}
                </p>
                {session.updatedAt && (
                  <p style={{ fontSize: 11, color: "var(--skr-text-tertiary)", margin: 0 }}>
                    {formatTimestamp(session.updatedAt)}
                  </p>
                )}
              </div>
              {activeTab === 0 && (
                <button
                  className="skr-btn-secondary"
                  style={{ fontSize: 11, padding: "3px 10px" }}
                  onClick={() => handlePin(session)}
                  disabled={pinning === session.sessionId}
                >
                  {pinning === session.sessionId ? "…" : session.pinned ? "Unpin" : "Pin"}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
