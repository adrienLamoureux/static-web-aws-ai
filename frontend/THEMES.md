# Sakura Bloom — Theme System

> Last updated: 2026-03-24

The theme system has **two independent axes**: a **color palette** (10 options) and a **brightness mode** (dark / light). They are persisted separately in `localStorage` and applied as `data-*` attributes on `<html>`.

---

## How It Works

| Axis | `localStorage` key | HTML attribute | Default |
|------|--------------------|----------------|---------|
| Color palette | `skr-theme` | `data-theme="<id>"` | `sakura` (attribute omitted) |
| Brightness | `skr-brightness` | `data-brightness="light"` | `dark` (attribute omitted) |

### Key files

| File | Role |
|------|------|
| `src/contexts/ThemeContext.js` | State, persistence, attribute injection — exports `useTheme()` |
| `src/components/sakura/ThemeSwitcher.js` | Topbar UI: color dropdown + ☾/☀ toggle |
| `src/index.css` | CSS variable blocks for all themes (dark + light) |

### CSS selector pattern

```css
/* Dark default (no attribute) */
:root { --skr-bg: #0D0B14; ... }

/* Dark override for a non-default palette */
[data-theme="moonrise"] { --skr-bg: #08101A; ... }

/* Light override — default palette */
[data-brightness="light"],
[data-brightness="light"][data-theme="sakura"] { --skr-bg: #FEF0F6; ... }

/* Light override — other palettes */
[data-brightness="light"][data-theme="moonrise"] { --skr-bg: #EDF6FE; ... }
```

Accent colors (`--skr-accent`, `--skr-accent-secondary`) are **identical in both brightness modes** — they are the color identity and remain unchanged when toggling dark/light.

---

## Color Palettes

| ID | Label | Accent | Secondary | Dark bg | Light bg |
|----|-------|--------|-----------|---------|----------|
| `sakura` | Sakura | `#FF6B9D` pink | `#C084FC` wisteria | `#0D0B14` indigo | `#FEF0F6` rose-white |
| `moonrise` | Moonrise | `#38BDF8` sky blue | `#818CF8` indigo | `#08101A` deep navy | `#EDF6FE` sky-white |
| `bamboo` | Bamboo | `#4ADE80` jade | `#FBBF24` gold | `#090F0B` dark forest | `#EDFAF2` mint-white |
| `ember` | Ember | `#F87171` coral red | `#FB923C` orange | `#120B08` volcanic | `#FEF0EC` warm cream |
| `void` | Void | `#A855F7` electric violet | `#22D3EE` neon cyan | `#06040F` near-black | `#F5EEFF` lavender-white |
| `glacier` | Glacier | `#2DD4BF` icy teal | `#94A3B8` slate | `#08100F` arctic dark | `#ECF8F7` icy white |
| `dusk` | Dusk | `#FB923C` amber orange | `#F472B6` warm rose | `#110D08` twilight | `#FFF4EB` warm parchment |
| `aurora` | Aurora | `#34D399` aurora green | `#22D3EE` cyan | `#050E10` deep blue-green | `#EAFAF4` pale mint |
| `crimson` | Crimson | `#F43F5E` scarlet | `#F59E0B` gold | `#0F0608` dark red | `#FEF0F2` pale rose |
| `storm` | Storm | `#FDE047` lightning yellow | `#94A3B8` silver | `#090C10` dark slate | `#F8F9EE` yellow-tinted paper |

---

## CSS Variables Reference

All design tokens use the `--skr-` prefix. The full set defined per theme:

| Variable | Purpose |
|----------|---------|
| `--skr-bg` | Page background |
| `--skr-surface` | Cards, panels |
| `--skr-elevated` | Hover states, dropdowns |
| `--skr-card` | Card background |
| `--skr-accent` | Primary accent (buttons, links, highlights) |
| `--skr-accent-hover` | Accent on hover |
| `--skr-accent-secondary` | Secondary accent |
| `--skr-accent-info` | Info state |
| `--skr-accent-success` | Success state |
| `--skr-accent-warning` | Warning state |
| `--skr-text` / `--skr-text-primary` | Primary text |
| `--skr-text-inverse` | Text on accent backgrounds |
| `--skr-text-secondary` | Subdued text |
| `--skr-text-muted` | Placeholder / disabled text |
| `--skr-text-tertiary` | Faintest text level |
| `--skr-border` | Default border |
| `--skr-border-strong` | Accent-tinted border |
| `--skr-overlay` | Modal / sheet backdrop |
| `--skr-glow` | Soft glow shadow |
| `--skr-glow-strong` | Strong glow shadow |
| `--skr-glass` | Glassmorphism surface color |

---

## Adding a New Theme

1. Add an entry to `THEMES` in `src/contexts/ThemeContext.js` with `id`, `label`, `swatch`, `swatchSecondary`.
2. Add a `[data-theme="<id>"]` dark block in `index.css` (after the existing theme blocks, before the responsive section).
3. Add a `[data-brightness="light"][data-theme="<id>"]` light block after the existing light blocks.
4. Build and deploy: `npm --prefix frontend run build` then `npm --prefix cdk run idea:deploy -- --stage=dev`.
