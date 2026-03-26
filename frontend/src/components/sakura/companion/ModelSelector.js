/**
 * ModelSelector — Director-only dropdown to swap the Live2D model.
 * Visible only when user.isAdmin === true.
 * Fetches current selection from the backend on mount; persists on change.
 */

import { useState, useEffect, useRef } from "react";
import { getAllModels } from "../../../lib/live2d/model-registry";
import { useConfig } from "../../../contexts/ConfigContext";
import { buildApiUrl } from "../../../services/apiClient";

export default function ModelSelector({ currentModel, onModelChange, isAdmin }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const menuRef = useRef(null);
  const models = getAllModels();
  const { apiBaseUrl } = useConfig();

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  if (!isAdmin) {
    return <span style={styles.modelName}>{currentModel?.name}</span>;
  }

  const handleSelect = async (model) => {
    setOpen(false);
    if (model.id === currentModel?.id) return;
    setSaving(true);
    onModelChange(model);
    try {
      await fetch(buildApiUrl(apiBaseUrl, "/api/admin/companion-model"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id }),
      });
    } catch (err) {
      console.warn("[ModelSelector] Failed to persist model choice:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={menuRef} style={styles.wrapper}>
      <button
        type="button"
        style={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        title="Director: change companion model"
      >
        {currentModel?.name}
        <span style={{ marginLeft: 4, opacity: 0.6, fontSize: 9 }}>
          {saving ? "…" : "▾"}
        </span>
      </button>

      {open && (
        <div style={styles.menu}>
          {models.map((m) => (
            <button
              key={m.id}
              type="button"
              style={{
                ...styles.menuItem,
                ...(m.id === currentModel?.id ? styles.menuItemActive : {}),
              }}
              onClick={() => handleSelect(m)}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    position: "relative",
  },
  modelName: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--skr-text-secondary)",
    letterSpacing: "0.04em",
  },
  trigger: {
    background: "none",
    border: "none",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--skr-text-secondary)",
    cursor: "pointer",
    padding: 0,
    display: "flex",
    alignItems: "center",
    letterSpacing: "0.04em",
  },
  menu: {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    background: "rgba(26, 23, 38, 0.98)",
    border: "1px solid rgba(192, 132, 252, 0.3)",
    borderRadius: 8,
    boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
    overflow: "hidden",
    minWidth: 160,
    zIndex: 20,
  },
  menuItem: {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "none",
    border: "none",
    padding: "8px 12px",
    fontSize: 12,
    color: "var(--skr-text)",
    cursor: "pointer",
  },
  menuItemActive: {
    color: "var(--skr-accent)",
    background: "rgba(255, 107, 157, 0.1)",
  },
};
