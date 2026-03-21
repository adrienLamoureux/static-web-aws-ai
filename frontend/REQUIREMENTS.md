# Requirements — design-yokai

> Last updated: 2026-03-21
> Branch: `codex/design-yokai/code`
> Worktree: `/Users/adrienlamoureux/Documents/code/wt/design-yokai/code`
> Scope: `frontend/**` plus branch-local docs only
> Design system: Yokai Neon (NERV-inspired retro-futuristic terminal, `yk-` prefix)

## 1. Purpose
- This branch is the Yokai variant for the Whisk product — a retro-futuristic CRT terminal aesthetic.
- Inspired by Evangelion NERV UI, Persona 5 menus, and CRT terminals.
- Preserves the full backend feature set with a radically different visual language.
- Target audience: anime fans who appreciate hacker/cyberpunk aesthetics.

## 2. Editable Scope
- Allowed:
  - `frontend/src/**`
  - `frontend/REQUIREMENTS.md`
  - `cdk/scripts/ui-smoke.mjs` (smoke test route updates only)
  - branch-local docs
- Not allowed:
  - `backend/**`, `cdk/lib/**`, shared idea registries

## 3. Design System — Yokai Neon

### Color Palette
```
--yk-bg:              #0A0A0F   (true near-black)
--yk-surface:         #12121A   (ink)
--yk-elevated:        #1C1C28   (midnight)
--yk-accent:          #00FFA3   (neon green)
--yk-accent-danger:   #FF3366   (neon red-pink)
--yk-accent-creative: #7B61FF   (electric purple)
--yk-accent-info:     #00E5FF   (cyan)
--yk-text:            #E8E8E8
--yk-text-secondary:  #888888
--yk-text-muted:      #555555
```

### Typography
- Headings/nav: "Space Mono" (monospaced), uppercase, wide letter-spacing
- Body: "Space Grotesk" (geometric sans)

### Key Visual Elements
- **Zero border-radius** — all elements are sharp/angular
- **CRT scanline overlay** via CSS repeating-linear-gradient
- **Neon text glow** on accent elements
- **Left-border cards** (terminal cursor feel)
- **Skewed page titles** (`skewX(-3deg)`)

### CSS Class Prefix
- All classes use `yk-` prefix
- NO `sol-` classes in JS files (except `sol-masonry-defaults.json` data path)

## 4. Architecture Entry Points
- App root: `frontend/src/App.js`
- Provider chain (FROZEN): `ConfigProvider -> AuthProvider -> MusicProvider -> Router`
- Auth: `frontend/src/contexts/AuthContext.js` (FROZEN)
- Music: `frontend/src/contexts/MusicContext.js`
- CSS: `frontend/src/index.css`

## 5. Route Model

### Primary Routes
| Route | Name | Component |
|-------|------|-----------|
| `/` | Terminal | HomePage |
| `/create` | Foundry | Forge |
| `/stories` | Codex | Story |
| `/browse` | Archive | SharedLibrary |
| `/system` | Control | Director |
| `/system/audio` | Audio Bank | StoryMusicLibrary |
| `/system/lora` | Model Index | LoraManagement |
| `/about` | SYS::ABOUT | AboutPage |

### Legacy Redirects
| Old Path | Redirects To |
|----------|-------------|
| `/whisk`, `/forge`, `/studio` | `/create` |
| `/videos` | `/create?tab=videos` |
| `/story`, `/storyboard` | `/stories` |
| `/shared`, `/showcase` | `/browse` |
| `/director`, `/admin` | `/system` |
| `/director/sounds`, `/music-library`, `/admin/sounds` | `/system/audio` |
| `/lora`, `/director/lora`, `/admin/lora` | `/system/lora` |

## 6. Frozen Contracts
- Provider chain order
- AuthContext.js — zero modifications
- All 13 service files in `services/`
- API response shapes (see MEMORY.md)
- Runtime config from `/config.json`

## 7. Libraries
| Package | Purpose |
|---------|---------|
| framer-motion | Glitch page transitions |
| react-split | Draggable split-screen (Foundry) |
| react-hotkeys-hook | Keyboard shortcuts |
| react-markdown | Story message rendering |

## 8. Agent Checklist
1. `npm --prefix frontend run build` must pass
2. No `sol-` class references in JS (except data file import)
3. All new classes use `yk-` prefix
4. Provider chain preserved
5. No modifications to `services/`, `contexts/AuthContext.js`, `contexts/ConfigContext.js`
