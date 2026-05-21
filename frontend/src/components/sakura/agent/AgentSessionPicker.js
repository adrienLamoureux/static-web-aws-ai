/**
 * AgentSessionPicker — dropdown of named agent sessions in the AgentStage
 * meta strip. Lets users keep parallel conversations (one per project) backed
 * by separate memory namespaces on the server.
 *
 * UX:
 *   - Click the pill → menu opens listing existing sessions + "+ New session"
 *   - Choose one → AgentContext.setActiveSession wipes local turns; next agent
 *     call hydrates memory from the backend via the new sessionId
 *   - "+ New session" prompts for a name, mints a uuid, creates the metadata
 *     record + switches immediately
 *   - Each row has a rename + delete affordance on hover
 *
 * Uses native <prompt> / <confirm> for v1.7. Custom modal UI is parked for
 * v1.8 — picker is admin-adjacent functionality and the native dialogs are
 * acceptable for early adopters.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useConfig } from "../../../contexts/ConfigContext";
import { useAgent } from "../../../lib/agent/AgentContext";
import {
  listAgentSessions,
  createAgentSession,
  renameAgentSession,
  deleteAgentSession,
  mintSessionId,
} from "../../../services/agentSessions";

const DEFAULT_SESSION = { sessionId: "default", name: "Default" };

export default function AgentSessionPicker() {
  const { apiBaseUrl } = useConfig();
  const { activeSessionId, setActiveSession } = useAgent();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const menuRef = useRef(null);

  const load = useCallback(() => {
    if (!apiBaseUrl) return;
    listAgentSessions(apiBaseUrl)
      .then((data) => setItems(Array.isArray(data?.items) ? data.items : []))
      .catch(() => {
        // Sessions endpoint may be disabled (flag off) — treat as no sessions
        setItems([]);
      });
  }, [apiBaseUrl]);

  useEffect(() => {
    load();
  }, [load]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Compose the rendered list: the implicit "Default" session is always first
  // even though it has no metadata record, so users have a fallback.
  const renderItems = [
    DEFAULT_SESSION,
    ...items.filter((s) => s.sessionId !== "default"),
  ];

  const activeName =
    renderItems.find((s) => s.sessionId === activeSessionId)?.name || activeSessionId;

  const handleSwitch = (sessionId) => {
    setActiveSession(sessionId);
    setOpen(false);
  };

  const handleCreate = async () => {
    const name = window.prompt("Name this session:", "New project");
    if (!name || !name.trim()) return;
    setPending(true);
    try {
      const sessionId = mintSessionId();
      const res = await createAgentSession(apiBaseUrl, { sessionId, name: name.trim() });
      const created = res?.session || { sessionId, name: name.trim() };
      setItems((prev) => [created, ...prev]);
      handleSwitch(created.sessionId);
    } catch (err) {
      window.alert(`Couldn't create session: ${err?.message || "unknown error"}`);
    } finally {
      setPending(false);
    }
  };

  const handleRename = async (s) => {
    const next = window.prompt("Rename session:", s.name);
    if (!next || !next.trim() || next.trim() === s.name) return;
    try {
      await renameAgentSession(apiBaseUrl, s.sessionId, next.trim());
      setItems((prev) =>
        prev.map((it) => (it.sessionId === s.sessionId ? { ...it, name: next.trim() } : it))
      );
    } catch (err) {
      window.alert(`Couldn't rename: ${err?.message || "unknown error"}`);
    }
  };

  const handleDelete = async (s) => {
    if (s.sessionId === "default") return;
    const ok = window.confirm(
      `Delete "${s.name}"? This also wipes the conversation memory for this session.`
    );
    if (!ok) return;
    try {
      await deleteAgentSession(apiBaseUrl, s.sessionId);
      setItems((prev) => prev.filter((it) => it.sessionId !== s.sessionId));
      if (activeSessionId === s.sessionId) setActiveSession("default");
    } catch (err) {
      window.alert(`Couldn't delete: ${err?.message || "unknown error"}`);
    }
  };

  return (
    <div className="skr-session-picker" ref={menuRef}>
      <button
        type="button"
        className="skr-session-picker-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch agent session"
      >
        ◧ {activeName}
      </button>
      {open ? (
        <div className="skr-session-picker-menu" role="listbox">
          {renderItems.map((s) => (
            <div
              key={s.sessionId}
              className={`skr-session-row${s.sessionId === activeSessionId ? " is-active" : ""}`}
            >
              <button
                type="button"
                className="skr-session-row-name"
                onClick={() => handleSwitch(s.sessionId)}
                role="option"
                aria-selected={s.sessionId === activeSessionId}
              >
                {s.name}
              </button>
              {s.sessionId !== "default" ? (
                <span className="skr-session-row-actions">
                  <button
                    type="button"
                    className="skr-session-row-btn"
                    onClick={() => handleRename(s)}
                    title="Rename"
                    aria-label="Rename session"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="skr-session-row-btn skr-session-row-btn--danger"
                    onClick={() => handleDelete(s)}
                    title="Delete"
                    aria-label="Delete session"
                  >
                    ✕
                  </button>
                </span>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            className="skr-session-picker-new"
            onClick={handleCreate}
            disabled={pending}
          >
            + New session
          </button>
        </div>
      ) : null}
    </div>
  );
}
