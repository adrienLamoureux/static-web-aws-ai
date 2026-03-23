import { createContext, useCallback, useContext, useEffect, useState } from "react";

export const THEMES = [
  { id: "sakura",  label: "Sakura",  swatch: "#FF6B9D", swatchSecondary: "#C084FC" },
  { id: "moonrise",label: "Moonrise",swatch: "#38BDF8", swatchSecondary: "#818CF8" },
  { id: "bamboo",  label: "Bamboo",  swatch: "#4ADE80", swatchSecondary: "#FBBF24" },
  { id: "ember",   label: "Ember",   swatch: "#F87171", swatchSecondary: "#FB923C" },
  { id: "void",    label: "Void",    swatch: "#A855F7", swatchSecondary: "#22D3EE" },
  { id: "glacier", label: "Glacier", swatch: "#2DD4BF", swatchSecondary: "#94A3B8" },
  { id: "dusk",    label: "Dusk",    swatch: "#FB923C", swatchSecondary: "#F472B6" },
  { id: "aurora",  label: "Aurora",  swatch: "#34D399", swatchSecondary: "#22D3EE" },
  { id: "crimson", label: "Crimson", swatch: "#F43F5E", swatchSecondary: "#F59E0B" },
  { id: "storm",   label: "Storm",   swatch: "#FDE047", swatchSecondary: "#94A3B8" },
];

const STORAGE_KEY = "skr-theme";
const DEFAULT_THEME = "sakura";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === DEFAULT_THEME) {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }, [theme]);

  const setTheme = useCallback((id) => {
    localStorage.setItem(STORAGE_KEY, id);
    setThemeState(id);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
