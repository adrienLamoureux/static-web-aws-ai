/**
 * ModeContext — global UI mode toggle (dashboard | agent).
 *
 * Persisted to localStorage under `skr-mode`. Only the /atelier route is
 * expected to honor `agent` mode; all other routes ignore it.
 *
 * Usage:
 *   const { mode, setMode, toggleMode } = useMode();
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "skr-mode";
const VALID_MODES = ["dashboard", "agent"];
const DEFAULT_MODE = "dashboard";

const ModeContext = createContext({
  mode: DEFAULT_MODE,
  setMode: () => {},
  toggleMode: () => {},
});

const readStoredMode = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return VALID_MODES.includes(raw) ? raw : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
};

export function ModeProvider({ children }) {
  const [mode, setModeState] = useState(DEFAULT_MODE);

  // Hydrate from storage after mount (avoids SSR / private-mode crashes)
  useEffect(() => {
    setModeState(readStoredMode());
  }, []);

  const setMode = useCallback((next) => {
    if (!VALID_MODES.includes(next)) return;
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore (private mode, quota, etc.)
    }
    // Trigger the ink-wash transition by toggling a class on <html>.
    // The CSS animation auto-removes via animation-end timing; we also clean
    // up after 700ms in case the animation never fires (reduced-motion users).
    try {
      const root = document.documentElement;
      root.classList.add("skr-mode-transition");
      root.dataset.skrMode = next;
      window.setTimeout(() => root.classList.remove("skr-mode-transition"), 700);
    } catch {
      // ignore (SSR / non-DOM env)
    }
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "agent" ? "dashboard" : "agent");
  }, [mode, setMode]);

  // Keep the data-attribute in sync on hydrate so CSS can target the current mode
  useEffect(() => {
    try {
      document.documentElement.dataset.skrMode = mode;
    } catch {
      // ignore
    }
  }, [mode]);

  return (
    <ModeContext.Provider value={{ mode, setMode, toggleMode }}>{children}</ModeContext.Provider>
  );
}

export const useMode = () => useContext(ModeContext);
