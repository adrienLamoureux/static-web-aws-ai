# Design-Fusion Agent Guide

> Last updated: 2026-03-19
> Branch: `codex/design-fusion/code`
> Worktree: `/Users/adrienlamoureux/Documents/code/wt/design-fusion/code`
> Live stack: `https://d3ei9r5awjyzzr.cloudfront.net`
> Live API: `https://luu3x0m826.execute-api.us-east-1.amazonaws.com/prod/`

## Mission
- This branch is a feature-rich UI overlay, not a visual mock.
- It keeps `codex/dev` backend and contract behavior, while replacing the frontend shell, page composition, and interaction model with the Solaris design system.
- Treat it as a live authenticated product surface: Forge, Storyboard, Showcase, Director, Sound Vault, and LoRA flows all hit real services.

## Scope
- Edit only `frontend/**` plus this branch-local doc set:
  - `AGENTS.md`
  - `README.md`
  - `frontend/REQUIREMENTS.md`
- Optional stack wiring is allowed only if the task explicitly requires it.
- Do not edit:
  - `backend/**`
  - shared idea registries
  - generic cross-repo docs that belong on `codex/dev`

## Read Order
1. `frontend/REQUIREMENTS.md`
2. `frontend/src/App.js`
3. the page or hook you are about to touch
4. the matching service file under `frontend/src/services/`

## Runtime Architecture
- Provider chain is fixed: `ConfigProvider -> AuthProvider -> MusicProvider -> Router`.
- `ConfigContext` loads `/config.json` and provides `apiBaseUrl`, `cognito`, and `configReady`.
- `AuthContext` owns Cognito PKCE login/logout, token bootstrap, and session-cache cleanup on logout.
- `MusicContext` is the shared track registry and autoplay trigger used by Story and Sound Vault.
- Styling is centralized in `frontend/src/index.css` and uses the `sol-` namespace.

## Routes You Must Preserve
- Primary:
  - `/`
  - `/forge`
  - `/storyboard`
  - `/showcase`
  - `/director`
  - `/director/sounds`
  - `/director/lora`
  - `/about`
  - `/login`
  - `/auth/callback`
- Legacy redirects:
  - `/whisk -> /forge`
  - `/videos -> /forge?tab=videos`
  - `/story -> /storyboard`
  - `/shared -> /showcase`
  - `/lora -> /director/lora`
  - `/music-library -> /director/sounds`

## Page Ownership Reality
- `HomePage.js`: animated masonry hero, nav cards, and recent shared-image strip.
- `Forge.js`: tab shell for `Whisk.js` and `WhiskVideos.js`, driven by `?tab=images|videos`.
- `Whisk.js`: image studio coordinator with prompt helper, character/LoRA cascade, CivitAI quick mode, upload flow, image gallery, and video-launch modal.
- `WhiskVideos.js`: generated video gallery with preview, share, favorite, and delete actions.
- `Story.js`: session bootstrap, preset picker, chat loop, on-demand illustration, scene animation/music polling, and LoRA switching per active session.
- `SharedLibrary.js`: shared image wall plus shared videos, favorites filter, search, and lightbox.
- `Director.js`: overview stats, queue prioritization, session pinning, home-page masonry management, and character CRUD.
- `StoryMusicLibrary.js`: soundtrack upload, metadata tagging, search/filter, and playback into the global dock.
- `LoraManagement.js`: per-character LoRA profile editing plus CivitAI catalog sync/search.

## Shared UI Pieces That Matter
- `components/shared/SolarisImageWall.js` is a reusable auto-panning gallery used by Forge and Showcase; its favorite/share/video/prompt actions are part of branch behavior.
- `components/music/SolarisMusicDock.js` is global and merges scene-generated music with uploaded library tracks.
- `components/story/StorySceneCard.js` owns scene-level illustrate, animate, and soundtrack actions.
- `components/shared/CharacterLoraSelector.js` handles the character -> LoRA profile cascade and default-profile selection.

## Contracts To Respect
- Backend contracts are inherited from `codex/dev`. Do not invent branch-local API payloads.
- Story payloads still depend on `{ session, messages, scenes }` with top-level arrays.
- New API calls should go through `frontend/src/services/**`, not direct `fetch` calls inside pages.
- New styles should stay within the Solaris visual system and use the `sol-` class prefix.
- Preserve runtime-config loading from `/config.json`; do not hardcode stack URLs into page code.
- Preserve session cache keys used by Forge:
  - `whisk_images_cache`
  - `whisk_videos_cache`
- Preserve the global music track shape used by `MusicContext` and `SolarisMusicDock`:
  - `key`
  - `url`
  - `title`
  - `source`
  - `mood`
  - `energy`
  - `tempoBpm`
  - `tags`
  - `updatedAt`

## Validation
- Required for frontend changes:
`npm --prefix frontend run build`
- Recommended local preview:
`npm --prefix cdk run idea:ui-local -- --stage=design-fusion`
- Deploy when needed:
`npm --prefix cdk run idea:deploy -- --stage=design-fusion`

## Working Style
- Keep diffs localized and reversible.
- Prefer editing the smallest page, component, or hook that owns the behavior.
- If a change appears to require backend edits, stop and move that work to `codex/dev` first.
