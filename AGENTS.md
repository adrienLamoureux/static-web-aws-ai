# Design-Sakura Agent Guide

> Last updated: 2026-03-23
> Branch: `codex/design-sakura/code`
> Worktree: `/Users/adrienlamoureux/Documents/code/wt/design-sakura/code`
> Live stack: see `ideas/design-sakura/STATUS.md`
> Backend (shared): `codex/dev` — `https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/`

## Mission
- This branch is a frontend-only UI overlay. It does **not** own a backend.
- It uses the `codex/dev` backend (Lambda + API GW + DynamoDB + Cognito User Pool) via `UiOnlyStack`.
- The design system is **Sakura Bloom** (`skr-` CSS prefix): deep indigo `#0D0B14`, sakura pink `#FF6B9D`, glassmorphism, bottom HUD navigation.
- Treat it as a live authenticated product surface: all routes hit the shared dev API.

## ⚠ Scope — HARD LIMIT
**This branch may only change `frontend/**`** and these branch-local docs:
- `AGENTS.md`
- `README.md`
- `frontend/REQUIREMENTS.md`
- `ideas/design-sakura/**`

**Never change:**
- `backend/**` — all backend work belongs on `codex/dev`
- `cdk/lib/static-web-aws-ai-stack.ts` — full-stack CDK, not ours
- shared idea registries or cross-repo architecture docs

If a task appears to require a backend change, stop. Move that work to `codex/dev` first.

## Read Order
1. `frontend/REQUIREMENTS.md`
2. `frontend/src/App.js` (SakuraShell, bottom HUD, route map)
3. `frontend/src/index.css` (Sakura Bloom design tokens — `skr-` prefix)
4. The page or component you are about to touch
5. The matching service file under `frontend/src/services/`

## Runtime Architecture
- Provider chain (frozen): `ConfigProvider → AuthProvider → MusicProvider → Router`
- `ConfigContext` loads `/config.json` and provides `apiBaseUrl`, `cognito`, `configReady`
- `AuthContext` owns Cognito PKCE login/logout. Do NOT modify.
- `MusicContext` is the shared track registry and autoplay trigger
- Styling is centralized in `frontend/src/index.css` using the `skr-` namespace

## Route Map
| Path | Page | Notes |
|------|------|-------|
| `/` | Realm (HomePage) | Animated masonry hero |
| `/atelier` | Atelier (Forge) | Images + Videos tabs |
| `/chronicle` | Chronicle (Story) | Story sessions |
| `/gallery` | Gallery (SharedLibrary) | Masonry gallery |
| `/sanctum` | Sanctum (Director) | Admin dashboard |
| `/sanctum/sounds` | Sound Vault (StoryMusicLibrary) | |
| `/sanctum/lora` | LoRA Archive (LoraManagement) | |
| `/about` | About | |

Legacy paths (`/forge`, `/story`, `/shared`, `/director/*`, `/music-library`, etc.) all redirect to the primary routes above.

## CSS Conventions
- All new classes must use the `skr-` prefix
- Design tokens are CSS variables defined in `:root` in `index.css`
- Key tokens: `--skr-bg`, `--skr-surface`, `--skr-accent` (sakura pink), `--skr-accent-secondary` (wisteria purple)
- Do not introduce Tailwind, Bootstrap, or other utility frameworks

## Frozen Service Contracts
- `services/` files are read-only in this branch. If an API payload changes, update `codex/dev` first.
- `GET /story/sessions/:id` → `{ session: { id }, messages: [], scenes: [] }` — messages/scenes at top level
- Music track shape: `{ key, url, title, source, mood, energy, tempoBpm, tags, updatedAt }`

## Quality Gates
- Frontend build: `npm --prefix frontend run build`
- Deploy (ui-only, uses shared dev backend):
  `npm --prefix cdk run idea:deploy -- --stage=design-sakura --backend-stage=dev`

**Always deploy with `--backend-stage=dev`.** Never deploy without it — omitting creates a duplicate full-stack with its own backend.

## What `--backend-stage=dev` Does
- Reads `ideas/dev/cdk-outputs.json` for the backend API endpoint, User Pool ID, and Cognito domain
- Deploys a `UiOnlyStack`: CloudFront + S3 + a new Cognito app client on the **shared** dev User Pool
- No Lambda, no API GW, no DynamoDB, no new Cognito User Pool are created
- `config.json` in the S3 bucket points to the shared dev API automatically
