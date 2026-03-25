# Sakura Bloom — Maximalist Immersive Anime UI (design-sakura)

## Objective
Maximalist immersive anime UI for Whisk Studio — deep indigo + sakura pink color system, visual novel aesthetic, bottom HUD navigation, ambient music pill, and a Live2D anime companion character that walks across the screen and chats with users via Bedrock AI.

## Design References
- Primary visual benchmark: Visual novel / VTuber stream overlay aesthetic
- Secondary visual benchmark: Frieren: Beyond Journey's End (anime art style, atmospheric depth)

## Scope
- In scope: All `frontend/**` files; `public/live2d/` assets; design system (`skr-` prefix, THEMES.md)
- Out of scope: Backend routes (live in `codex/dev`), CDK stack changes, shared Cognito pool

## Delivery Tracks
- Plan track: DECISIONS.md (ADRs), IMPROVEMENTS.md (feature log)
- Build track: `codex/design-sakura/code` branch, worktree at `/wt/design-sakura/code`
- Integration/QA track: Manual smoke test at https://d2lepwk3t4buta.cloudfront.net

## Functionalities
- 10-theme system (dark/light variants, `skr-` CSS variable prefix) with ThemeSwitcher
- Bottom HUD navigation pill with role-based filtering
- Ambient music pill (top-right, global track picker)
- Live2D companion character (Hiyori Momose, Cubism 3) — walks horizontally, click to chat
- AI companion dialog (speech bubble, Bedrock Haiku, `POST /api/companion/chat`)
- Full app routing: Realm, Atelier, Chronicle, Gallery, Sanctum

## Architecture Touchpoints
- Backend: `codex/dev` — companion route at `backend/routes/companion-route.js`
- Frontend: React 18 / CRA, custom CSS design system, pixi.js@6 + pixi-live2d-display@0.4.0
- CDK: Shared stack template; Live2D assets deployed via manual `aws s3 sync` (CDK Lambda timeout workaround)
- Live2D: Cubism Core loaded in `<head>`, model at `public/live2d/hiyori/runtime/hiyori_free_t08.model3.json`

## Contract Notes
- API changes: `POST /api/companion/chat` → `{ text: string, emotion: string }` (in codex/dev, not yet in sakura Lambda)
- Runtime config changes: none
- Data model/storage changes: none

## Handoff Notes For Sub-Agents
- Current priority: Visual refinement of Hiyori (scale, position, motion speed) — canvas is hidden (`display:none`) until ready
- Known blockers: Companion dialog falls back silently until the sakura Lambda includes the companion route from codex/dev
- Next smallest shippable increment: Un-hide canvas, tune model scale so Hiyori stands clearly above the nav cards without overlapping
