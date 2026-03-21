import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

/* ─── Kitsune Command Palette ───
   Cmd+K search modal with fuzzy navigation, recent items, and quick actions.
   Lightweight implementation — no external dependency required.
*/

const COMMANDS = [
  { id: "home", label: "Home", section: "Navigate", icon: "⌂", action: "/" },
  { id: "studio", label: "Studio", section: "Navigate", icon: "◎", action: "/studio" },
  { id: "stories", label: "Stories", section: "Navigate", icon: "▤", action: "/stories" },
  { id: "browse", label: "Browse Gallery", section: "Navigate", icon: "◈", action: "/browse" },
  { id: "admin", label: "Admin Dashboard", section: "Navigate", icon: "⚙", action: "/admin" },
  { id: "sounds", label: "Sound Vault", section: "Navigate", icon: "♫", action: "/admin/sounds" },
  { id: "lora", label: "LoRA Management", section: "Navigate", icon: "◐", action: "/admin/lora" },
  { id: "about", label: "About", section: "Navigate", icon: "ℹ", action: "/about" },
];

export default function KitsuneCommandPalette({ onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = query.trim()
    ? COMMANDS.filter((c) =>
        c.label.toLowerCase().includes(query.toLowerCase())
      )
    : COMMANDS;

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const runCommand = useCallback(
    (cmd) => {
      if (cmd.action.startsWith("/")) {
        navigate(cmd.action);
      }
      onClose();
    },
    [navigate, onClose]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        runCommand(filtered[selectedIndex]);
      }
    },
    [onClose, filtered, selectedIndex, runCommand]
  );

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  // Group by section
  const sections = {};
  filtered.forEach((cmd) => {
    if (!sections[cmd.section]) sections[cmd.section] = [];
    sections[cmd.section].push(cmd);
  });

  let flatIndex = 0;

  return (
    <div className="kit-cmdk-overlay" onClick={handleBackdropClick} onKeyDown={handleKeyDown}>
      <div className="kit-cmdk-dialog" role="dialog" aria-label="Command palette">
        <div className="kit-cmdk-input-wrap">
          <span className="kit-cmdk-search-icon">⌕</span>
          <input
            ref={inputRef}
            className="kit-cmdk-input"
            placeholder="Type a command or search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="kit-cmdk-esc">ESC</kbd>
        </div>

        <div className="kit-cmdk-list">
          {filtered.length === 0 && (
            <div className="kit-cmdk-empty">No results found.</div>
          )}
          {Object.entries(sections).map(([section, items]) => (
            <div key={section} className="kit-cmdk-group">
              <div className="kit-cmdk-group-label">{section}</div>
              {items.map((cmd) => {
                const idx = flatIndex++;
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    className={`kit-cmdk-item${idx === selectedIndex ? " is-selected" : ""}`}
                    onClick={() => runCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="kit-cmdk-item-icon">{cmd.icon}</span>
                    <span className="kit-cmdk-item-label">{cmd.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="kit-cmdk-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
