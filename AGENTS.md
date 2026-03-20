# Design-Pixnovel Agent Guide

> Last updated: 2026-03-19
> Branch: `codex/design-pixnovel/code`
> Worktree: `/Users/adrienlamoureux/Documents/code/wt/design-pixnovel/code`
> Live stack: `https://d21j30h6jj4n2k.cloudfront.net`
> Live API: `https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/`

## Scope
- Edit only `frontend/**` plus this branch-local doc set:
  - `AGENTS.md`
  - `README.md`
  - `frontend/REQUIREMENTS.md`
- Do not edit backend or shared registries from this branch.

## Read Order
1. `frontend/REQUIREMENTS.md`
2. `frontend/src/App.js`
3. `frontend/src/config/pixnovelShellConfig.js`
4. the page or hook you are about to touch

## Branch Reality
- This is the flagship rich frontend overlay.
- Auth is real Cognito PKCE via `AuthContext`.
- App-level shell orchestration, route mapping, theme state, quick-generate flow, and global music dock all live in `frontend/src/App.js`.
- Theme and shell tokens live in `frontend/src/themes/pixnovel.css`.

## Routes You Must Preserve
- `/`
- `/shared`
- `/whisk`
- `/lora`
- `/videos`
- `/story`
- `/director`
- `/music-library`
- `/about`
- `/login`
- `/auth/callback`

## Contracts To Respect
- Backend contracts come from `codex/dev`.
- Keep route metadata centralized in `frontend/src/config/pixnovelShellConfig.js`.
- Keep quick-generate using the shared service layer, not ad-hoc API shapes.
- Preserve the current motion policy: only the masonry vertical stream should animate.
- Story payload handling still depends on top-level `session`, `messages`, and `scenes`.

## Validation
- Required:
`npm --prefix frontend run build`
- Recommended:
`npm --prefix cdk run idea:ui-local -- --stage=design-pixnovel`
- Deploy when needed:
`npm --prefix cdk run idea:deploy -- --stage=design-pixnovel`

## Working Style
- Keep UX changes deliberate and theme-consistent.
- Prefer updating central config constants before duplicating literals in pages.
- If a task requires backend changes, move that work to `codex/dev` first.
