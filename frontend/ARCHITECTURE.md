# Frontend Architecture — Sakura Bloom

> Last updated: 2026-04-11

This document covers the component hierarchy, context providers, hook graph, CSS design system, and API communication layer for the Whisk Studio frontend (Sakura Bloom design system, living on `main`).

---

## 1. Component Tree

```
App
  ├── ConfigProvider          (runtime config from /config.json)
  │     └── AuthProvider      (Cognito PKCE auth state)
  │           └── MusicProvider  (background music state)
  │                 └── ThemeProvider  (theme + brightness state)
  │                       └── CompanionProvider  (event bus for companion actions)
  │                             └── Router
  │                                   ├── TopBar               (logo, ThemeSwitcher, auth button)
  │                                   ├── BottomHUD            (NAV_ITEMS: Realm / Atelier / Chronicle / Sanctum)
  │                                   ├── SakuraMusicBar       (now-playing dock, music controls)
  │                                   ├── CompanionPanel       (Live2D Hiyori + chat overlay)
  │                                   └── Routes
  │                                         ├── /               → HomePage
  │                                         ├── /atelier        → Forge (image/video generation)
  │                                         ├── /chronicle      → Story (story sessions + scenes)
  │                                         ├── /gallery        → redirect to /
  │                                         ├── /sanctum        → Director (admin panel)
  │                                         ├── /sanctum/sounds → StoryMusicLibrary
  │                                         ├── /sanctum/lora   → LoraManagement
  │                                         ├── /auth/callback  → AuthCallback
  │                                         └── /about          → AboutPage
  │                                         (legacy paths /lora, /music-library, etc. redirect to the above)
```

Protected routes render a `LoginModal` (inline, not redirect) when the user is unauthenticated.
Admin routes redirect to `/` when the user lacks the `admin` group.

---

## 2. Context Providers

### ConfigContext (`src/contexts/ConfigContext.js`)
- Fetches `/config.json` at startup via `useEffect`.
- Exposes: `apiBaseUrl`, `cognito` (domain, clientId, userPoolId, region).
- All API service modules receive `apiBaseUrl` via this context.

### AuthContext (`src/contexts/AuthContext.js`)
- Manages Cognito PKCE authentication state.
- Exposes: `isAuthenticated`, `isLoading`, `user` (including `isAdmin`), `login()`, `logout()`.
- Stores `idToken` and `accessToken` via `src/utils/authTokens.js` (sessionStorage).
- Listens for `whisk:auth:expired` custom events dispatched by `apiClient.js`.

### MusicContext (`src/contexts/MusicContext.js`)
- Global audio player state.
- Exposes: `currentTrack`, `isPlaying`, `play()`, `pause()`, `setTrack()`.
- `SakuraMusicBar` renders the now-playing UI from this context.

### ThemeContext (`src/contexts/ThemeContext.js`)
- Manages active theme (`skr-theme` localStorage key) and brightness (`skr-brightness`).
- Applies `data-theme="<id>"` and `data-brightness="light"` to `document.documentElement`.
- Default theme is `sakura` (no attribute set — fallback in tokens.css).
- Exposes: `theme`, `brightness`, `setTheme(id)`, `setBrightness("dark"|"light")`, `THEMES` array.

### CompanionProvider (`src/lib/companion/CompanionContext.js`)
- Event bus for companion action tags emitted by the backend.
- Action types: `GENERATE_IMAGE`, `NAVIGATE`, `START_STORY`, `GENERATE_MUSIC`.
- Exposes: `CompanionActions`, `useCompanion()` hook, `dispatch(action)`.

### ModeProvider (`src/lib/mode/ModeContext.js`)
- Toggles between `"dashboard"` and `"agent"` UI modes. Persisted to `localStorage["skr-mode"]`.
- Triggers the `.skr-mode-transition` ink-wash overlay on `<html>` whenever the mode flips (600ms keyframe).
- Mode is route-scoped: only `/atelier` honors `agent`; other routes render the same Dashboard regardless.
- Exposes: `useMode()` → `{ mode, setMode, toggleMode }`.

### AgentProvider (`src/lib/agent/AgentContext.js`)
- Owns the manga-panel turn stream for Agent mode. Mounted globally inside `ModeProvider`.
- Maintains a serial submit queue so users can type-ahead while a prior turn is in flight.
- Drives staged "thinking…" labels client-side (`THINKING_STAGES`) so latency feels eventful.
- Renders a canned greeting (`greet()`) on mount with no LLM round-trip.
- Auto-flips back to Dashboard mode when the backend 404s (feature flag off).
- Exposes: `useAgent()` → `{ turns, submitting, queueLength, submit, reroll, tweak, reset, greet }`.

---

## 3. Hook Dependency Graph

```
useLoginPrompt
  └── useAuth (from AuthContext)

useProactiveCompanion
  └── calls POST /api/companion/proactive
  └── dispatches CompanionActions via useCompanion

CompanionPanel (component, not a hook)
  ├── useProactiveCompanion
  ├── useCompanion (CompanionContext)
  └── CompanionCanvas → pixi-live2d-display (Hiyori model)
```

Custom hooks live in:
- `src/contexts/*.js` — provider-paired hooks (`useConfig`, `useAuth`, `useMusicContext`, `useTheme`)
- `src/hooks/useLoginPrompt.js` — shows login modal on demand
- `src/lib/companion/useProactiveCompanion.js` — companion proactive message trigger

---

## 4. CSS Design System

### Overview
Prefix: `skr-` — avoids collision with Tailwind utilities and other overlays.
Inspired by VN game UIs (Genshin Impact, Fate/Grand Order).

### File Layout
```
src/styles/
  tokens.css         → :root CSS custom properties (base sakura dark theme)
  themes/
    dark-themes.css  → [data-theme="<id>"] overrides for 9 non-default dark themes
    light-themes.css → [data-brightness="light"] overrides for all 10 themes
  reset.css          → minimal CSS reset
  layout.css         → page shell, topbar, bottom HUD, grid helpers
  components.css     → .skr-card, .skr-btn, .skr-input, .skr-badge, etc.
  agent.css          → Agent mode primitives (manga panel, composer, mode toggle, memory badge)
  animations.css     → keyframes and transition utilities (incl. ink-wash, speed-lines)
  theme-switcher.css → ThemeSwitcher component-specific styles
  login.css          → LoginModal styles
  responsive.css     → media queries
```

### Core Token Reference

| Token | Default (sakura dark) | Purpose |
|-------|-----------------------|---------|
| `--skr-bg` | `#0D0B14` | Page background |
| `--skr-surface` | `#1A1726` | Card / panel background |
| `--skr-elevated` | `#251F35` | Elevated surface (modals) |
| `--skr-card` | `#1E1830` | Card background |
| `--skr-accent` | `#FF6B9D` | Primary interactive color |
| `--skr-accent-hover` | `#FF8AB5` | Accent hover state |
| `--skr-accent-secondary` | `#C084FC` | Secondary accent |
| `--skr-text` | `#F0E6FF` | Primary text |
| `--skr-text-secondary` | `#A78BDB` | Secondary / muted text |
| `--skr-border` | `rgba(168,139,219,0.15)` | Default border |
| `--skr-glow` | pink drop-shadow | Glow effect |
| `--skr-glass` | `rgba(26,23,38,0.65)` | Glassmorphism background |
| `--skr-hud-height` | `64px` | Bottom HUD height |
| `--skr-topbar-height` | `56px` | Top bar height |

### Theme Switching

Theme is applied by setting `data-theme` on `<html>`:
- No attribute → **sakura** (default dark, deep indigo + pink)
- `data-theme="moonrise"` → navy + ocean blue
- `data-theme="bamboo"` → forest + jade green
- `data-theme="ember"` → volcanic + coral red
- `data-theme="void"` → ultraviolet + neon cyan
- `data-theme="glacier"` → arctic + icy teal
- `data-theme="dusk"` → twilight + amber orange
- `data-theme="aurora"` → northern lights + aurora green
- `data-theme="crimson"` → scarlet + golden
- `data-theme="storm"` → dark slate + lightning yellow

### Light Mode

`data-brightness="light"` on `<html>` triggers per-theme light overrides from `light-themes.css`.
These override `--skr-bg`, `--skr-surface`, `--skr-card`, `--skr-text*` to light values while keeping the theme accent colors.

### Common CSS Classes

```
.skr-card           bordered card surface
.skr-btn            primary button (accent background)
.skr-btn-ghost      outline/ghost button
.skr-input          themed text input
.skr-badge          small status badge
.skr-page-header    page title + subtitle block
.skr-page-title     h2 display heading
.skr-page-subtitle  muted subtitle paragraph
.skr-section        content section with bottom margin
.skr-hud            bottom navigation bar
.skr-topbar         top navigation bar
```

---

## 5. API Communication

### Runtime Config
`ConfigContext` fetches `/config.json` at app startup. The file is generated by CDK at deploy time and placed in the S3 bucket root. It contains:
```json
{
  "apiBaseUrl": "https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod",
  "cognito": {
    "domain": "whiskstudio-alx-dev-761593662432.auth.us-east-1.amazoncognito.com",
    "clientId": "6qcsnr78lth12ql962iu9thhu6",
    "userPoolId": "us-east-1_KGfmw3Ykn",
    "region": "us-east-1"
  }
}
```

### apiClient.js (`src/services/apiClient.js`)
Central HTTP utility. All service modules import from here.

Key functions:
- `fetchJson(url, options, errorMessage)` — authenticated GET/DELETE
- `postJson(url, payload, errorMessage)` — authenticated POST
- `putJson(url, payload, errorMessage)` — authenticated PUT
- `deleteJson(url, errorMessage)` — authenticated DELETE
- `buildApiUrl(baseUrl, path)` — joins base + path, strips trailing slashes
- `buildUrlWithQuery(baseUrl, path, params)` — adds query string, skips nullish values

Auth injection: `withAuthHeaders()` reads the JWT from `authTokens.js` and adds `Authorization: Bearer <token>`. If a response is `401`, it dispatches `whisk:auth:expired` to trigger re-login.

### Service Modules
Each service module receives `apiBaseUrl` from `ConfigContext` via the calling component's `useConfig()` hook, then constructs full URLs via `buildApiUrl`.

| Module | Covers |
|--------|--------|
| `images.js` | S3 image upload, share, delete |
| `s3.js` | Shared image/video browse |
| `story.js` | Sessions, messages, scenes, music |
| `lora.js` | LoRA catalog and profiles |
| `characters.js` | Character CRUD |
| `operations.js` | Admin ops endpoints |
| `bedrock.js` | Bedrock image generation |
| `replicate.js` | Replicate image/video generation |
| `civitai.js` | CivitAI generation |
| `promptHelper.js` | Prompt helper options + suggestions |
| `runtime-config.js` | Fallback config when ConfigContext is unavailable |
