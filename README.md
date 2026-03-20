# Design-Fusion

This worktree is the Solaris frontend overlay branch for the live `design-fusion` idea stack.

## Branch Summary
- Branch: `codex/design-fusion/code`
- Worktree: `/Users/adrienlamoureux/Documents/code/wt/design-fusion/code`
- Live frontend: `https://d3ei9r5awjyzzr.cloudfront.net`
- Live API: `https://luu3x0m826.execute-api.us-east-1.amazonaws.com/prod/`

## What Lives Here
- Full authenticated React frontend built on `codex/dev` contracts
- Solaris shell, grouped navigation, warm light-first theme, and branch-local CSS system
- Forge image/video studio with prompt helper, LoRA selection, CivitAI quick mode, and gallery actions
- Storyboard with session presets, scene illustration, scene animation, soundtrack generation, and dock playback
- Showcase, Director, Sound Vault, and LoRA Catalog surfaces
- Branch-local docs for future agents

## What Does Not Live Here
- Backend route changes
- Shared contract changes
- Cross-idea registry edits
- Generic repo-wide documentation

## Branch Reality
- Runtime config is loaded from `/config.json`.
- Auth is real Cognito PKCE, not mocked.
- Music playback is global through `MusicContext` and `SolarisMusicDock`.
- The home hero is backed by Director-managed masonry portraits, with bundled fallback images.
- `Director.js` owns overview, queue/session controls, masonry assets, and character CRUD.
- `LoraManagement.js` owns LoRA profile editing and CivitAI catalog sync.

## Read This First
1. `AGENTS.md`
2. `frontend/REQUIREMENTS.md`
3. `frontend/src/App.js`

## Validation

```bash
npm --prefix frontend run build
npm --prefix cdk run idea:ui-local -- --stage=design-fusion
```

Deploy when needed:

```bash
npm --prefix cdk run idea:deploy -- --stage=design-fusion
```
