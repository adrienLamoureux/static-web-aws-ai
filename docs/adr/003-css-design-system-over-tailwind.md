# ADR 003 — Custom CSS Design System Over Tailwind

**Status:** Accepted
**Date:** 2026-04-06

---

## Context

Tailwind CSS is listed as a dependency in the frontend `package.json` and is available for use. However, the design-sakura variant uses a hand-written CSS system with the `skr-` class prefix and CSS custom properties (`--skr-*`).

We evaluated whether to:
1. Replace the custom system with Tailwind utility classes throughout.
2. Keep the custom system and reserve Tailwind for new utility-only usage.
3. Drop Tailwind entirely.

The `skr-` system was built specifically to enable multi-theme switching via `[data-theme]` attribute selectors and light/dark mode via `[data-brightness]`. This requires a coherent set of CSS custom properties that cascade from `tokens.css` through theme overrides — a pattern that Tailwind's JIT utility approach does not support natively without significant custom configuration.

The design inspiration (Genshin Impact, VN engines, Fate/Grand Order) demands rich `box-shadow` glows, glassmorphism backgrounds, and backdrop filters that are verbose in Tailwind but concise as named custom properties (`--skr-glow`, `--skr-glass`).

---

## Decision

**Keep the custom `skr-` CSS design system as the primary styling approach** for all components in design-sakura. Tailwind utilities may be used for one-off layout needs in new components where a full `skr-` class is not warranted, but never for theming.

The token architecture:
- `tokens.css` — `:root` defaults (sakura dark)
- `themes/dark-themes.css` — `[data-theme="<id>"]` overrides
- `themes/light-themes.css` — `[data-brightness="light"]` overrides
- All component CSS references `var(--skr-*)` tokens

---

## Consequences

**Positive:**
- Coherent multi-theme switching with a single `data-theme` attribute.
- Light/dark mode works for all 10 themes with CSS only, no JS re-render.
- Compact component CSS — `var(--skr-glow)` is far more readable than a multi-class Tailwind glow.
- No Tailwind purge/JIT configuration needed for custom properties.

**Negative / Trade-offs:**
- No Tailwind autocomplete for existing `skr-` components in IDEs configured only for Tailwind.
- Engineers must learn the `skr-` token vocabulary to be productive.
- Stale Tailwind devDependency adds minor package size (tracked in Known Gaps).
- Adding a new theme requires editing three CSS files (tokens default, dark override, light override).
