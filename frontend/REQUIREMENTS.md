# Requirements — design-kitsune

> Last updated: 2026-03-21
> Branch: `codex/design-kitsune/code`
> Worktree: `/Users/adrienlamoureux/Documents/code/wt/design-kitsune/code`
> Scope: `frontend/**` plus branch-local docs only
> Design system: Kitsune Mono (AniList-inspired dark navy, `kit-` prefix)

## 1. Purpose
- This branch is the Kitsune variant for the Whisk product — an AniList-inspired modern dark theme.
- It preserves the full backend feature set while providing sidebar navigation, Cmd+K command palette, and Spotify-style music bar.
- Auth, services, story, music, director, character, and LoRA flows are all live.
- Target audience: young anime/manga fans who appreciate clean, modern dark UIs.

## 2. Editable Scope
- Allowed:
  - `frontend/src/**`
  - `frontend/REQUIREMENTS.md`
  - `cdk/scripts/ui-smoke.mjs` (smoke test route updates only)
  - branch-local `AGENTS.md` and `README.md`
- Not allowed:
  - `backend/**`
  - `cdk/lib/**` (stack definition)
  - shared idea registries
  - generic repo docs

## 3. Design System — Kitsune Mono

### Color Palette
```
--kit-bg:             #0B1622   (deep navy background)
--kit-surface:        #151F2E   (lighter navy)
--kit-elevated:       #1F2937   (blue-gray)
--kit-card:           #1A2332   (card background)
--kit-accent:         #3DB4F2   (AniList sky blue)
--kit-accent-heart:   #EC4899   (hot pink for favorites)
--kit-success:        #4ADE80
--kit-warning:        #FBBF24
--kit-text:           #EDF1F5
--kit-text-secondary: #8BA0B2
--kit-text-muted:     #516170
--kit-border:         rgba(139, 160, 178, 0.12)
```

### CSS Class Prefix
- All classes use `kit-` prefix (e.g., `kit-card`, `kit-btn-primary`, `kit-input`)
- NO `sol-` classes should appear in JS files (only the JSON data import `sol-masonry-defaults.json` is acceptable)

### Key UI Components
- **Sidebar** (`kit-sidebar`): Collapsible left sidebar with icon + label navigation
- **Topbar** (`kit-topbar`): Hamburger toggle, page title, search trigger, user display
- **Command Palette** (`KitsuneCommandPalette`): Cmd+K modal for quick navigation
- **Music Bar** (`KitsuneMusicBar`): Fixed bottom bar, Spotify-style now-playing
- **Page Transitions**: framer-motion fade+slide on route change

## 4. Architecture Entry Points
- App root: `frontend/src/App.js`
- Provider chain (FROZEN — do not modify order):
  - `ConfigProvider` -> `AuthProvider` -> `MusicProvider` -> `Router`
- Runtime config: `frontend/src/contexts/ConfigContext.js`
- Auth: `frontend/src/contexts/AuthContext.js` (FROZEN — zero modifications)
- Music state: `frontend/src/contexts/MusicContext.js`
- CSS: `frontend/src/index.css`

## 5. Route Model

### Primary Routes
| Path | Component | Description |
|------|-----------|-------------|
| `/` | HomePage | Activity feed, stats, continue-creating cards |
| `/studio` | Forge | Image generation + video animation (tab switcher) |
| `/stories` | Story | Story sessions with chat, scenes, illustrations |
| `/browse` | SharedLibrary | Masonry gallery of shared images |
| `/admin` | Director | Admin dashboard (characters, config) |
| `/admin/sounds` | StoryMusicLibrary | Sound vault (upload, categorize tracks) |
| `/admin/lora` | LoraManagement | LoRA catalog and character profiles |
| `/about` | AboutPage | Static about page |
| `/login` | LoginPage | Cognito PKCE login |
| `/auth/callback` | AuthCallback | OAuth callback handler |

### Legacy Redirects (all redirect to primary routes)
| Old Path | Redirects To |
|----------|-------------|
| `/whisk`, `/forge` | `/studio` |
| `/videos` | `/studio?tab=videos` |
| `/story`, `/storyboard` | `/stories` |
| `/shared`, `/showcase` | `/browse` |
| `/director` | `/admin` |
| `/director/sounds`, `/music-library` | `/admin/sounds` |
| `/lora`, `/director/lora` | `/admin/lora` |

## 6. Frozen Contracts (DO NOT MODIFY)
- **Provider chain order**: ConfigProvider -> AuthProvider -> MusicProvider -> Router
- **AuthContext.js**: Zero modifications allowed
- **Service layer**: All 13 files in `services/` are frozen
- **API response shapes**: See MEMORY.md for session/message/scene/music contracts
- **Runtime config**: `/config.json` loaded by ConfigContext

## 7. Libraries
| Package | Purpose |
|---------|---------|
| framer-motion | Page transitions, scroll animations |
| cmdk | Command palette (Cmd+K) — available but using custom implementation |
| react-intersection-observer | Scroll-triggered animations |
| react-virtuoso | Virtualized lists for large datasets |
| date-fns | Human-readable timestamps |

## 8. Smoke Test Contract
- File: `cdk/scripts/ui-smoke.mjs`
- Unauthenticated: `/login`, `/`, `/studio`, `/stories`, `/browse`, `/admin`, `/about` all redirect to `/login`
- Authenticated: All primary routes render expected text
- Legacy redirects: `/forge` -> `/studio`, `/story` -> `/stories`, `/shared` -> `/browse`, `/director` -> `/admin`

## 9. Agent Checklist
Before committing any change:
1. `npm --prefix frontend run build` must pass
2. No `sol-` class references in JS files (except `sol-masonry-defaults.json` data import)
3. All new classes use `kit-` prefix
4. Provider chain order preserved
5. No modifications to `services/`, `contexts/AuthContext.js`, `contexts/ConfigContext.js`
6. Smoke tests updated if routes change
