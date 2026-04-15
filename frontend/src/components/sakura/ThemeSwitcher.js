import { useState, useRef, useEffect } from "react";
import { useTheme } from "../../contexts/ThemeContext";

export default function ThemeSwitcher() {
  const { theme, setTheme, themes, brightness, setBrightness } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const active = themes.find((t) => t.id === theme) || themes[0];
  const isLight = brightness === "light";

  return (
    <div className="skr-theme-controls">
      <button
        type="button"
        className="skr-brightness-toggle"
        onClick={() => setBrightness(isLight ? "dark" : "light")}
        title={isLight ? "Switch to dark mode" : "Switch to light mode"}
        aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
        aria-pressed={isLight}
      >
        {isLight ? "☀" : "☾"}
      </button>

      <div ref={ref} style={{ position: "relative" }}>
        <button
          type="button"
          className="skr-theme-trigger"
          onClick={() => setOpen((v) => !v)}
          title="Switch theme"
          aria-label={`Current theme: ${active.label}. Click to change.`}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span
            className="skr-theme-swatch"
            style={{
              background: `linear-gradient(135deg, ${active.swatch}, ${active.swatchSecondary})`,
            }}
          />
          <span className="skr-theme-trigger-label">{active.label}</span>
          <span className="skr-theme-caret" aria-hidden="true">
            ▾
          </span>
        </button>

        {open && (
          <div className="skr-theme-menu" role="listbox" aria-label="Select theme">
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={t.id === theme}
                className={`skr-theme-option${t.id === theme ? " is-active" : ""}`}
                onClick={() => {
                  setTheme(t.id);
                  setOpen(false);
                }}
              >
                <span
                  className="skr-theme-swatch"
                  style={{
                    background: `linear-gradient(135deg, ${t.swatch}, ${t.swatchSecondary})`,
                  }}
                />
                <span>{t.label}</span>
                {t.id === theme && (
                  <span className="skr-theme-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
