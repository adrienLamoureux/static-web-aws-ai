# PixAI NovelAI Hybrid Design (design-pixnovel)

## Objective
- Prototype a strong PixAI/NovelAI-inspired interface while preserving current product behavior.
- Validate whether a cinematic hero + dense generator control panel improves perceived quality and usability.

## Design References
- Primary visual benchmark: PixAI realtime landing style (hero impact, animated visual atmosphere).
- Secondary visual benchmark: NovelAI image generation workspace (dense control menu and production cockpit framing).

## Scope
- In scope:
  - New hybrid shell layout for authenticated pages.
  - PixAI-style hero with animated masonry atmosphere and integrated top navigation/auth controls.
  - PixAI-style animated masonry stream with bottom-to-top image motion.
  - NovelAI-style generation control menu and render queue side rail.
  - Director control-plane workflows for generation, video, story, and sound operations.
  - New backend operations APIs for Director defaults and operational actions.
  - Responsive behavior for desktop/tablet/mobile.
- Out of scope:
  - New provider integrations.
  - Core model routing rewrites.
  - New auth flows.

## Delivery Tracks
- Plan track: reference extraction + hybrid layout contract.
- Build track: frontend shell/theme implementation in `frontend/src/App.js` and `frontend/src/themes/pixnovel.css`.
- Build track: director orchestration UI in `frontend/src/pages/Director.js` + `frontend/src/pages/director.css`.
- Build track: operational API routes in `backend/routes/operations-routes.js` and defaults config in `backend/lib/director-config.js`.
- Integration/QA track: isolated `design-pixnovel` stack deploy + sanity + UI smoke + seed content.

## Functionalities
- Active authenticated routes in this idea are: `/`, `/shared`, `/whisk`, `/lora`, `/videos`, `/director`, `/story`, `/music-library`, `/about`.
- Existing Whisk/Story/Music/About features remain intact in the center stage panel.
- Video browsing/preview/delete now lives on the dedicated `/videos` page instead of being embedded in the Generator page.
- New `/director` page acts as a global command center to orchestrate generation, video pipeline, story control, soundtrack governance, and release quality gates.
- Director Generation Ops includes configurable defaults (model/scheduler/size/negative prompt), active/failed queues, and job prioritization actions.
- Director Video Pipeline includes configurable video defaults and prioritization controls for active/failed video jobs.
- Director Story Control includes session visibility with pin/unpin control.
- Director Sound Governance includes default metadata controls and batch normalization for missing track metadata.
- New generator menu mirrors advanced image-generation UX patterns.
- New hero/nav/feed surfaces provide visual differentiation for this idea branch.
- Hero now includes an animated three-column image stream with independent scroll speeds and offsets.
- Masonry stream is hidden on small mobile viewports to preserve readability and performance.
- Nested panels are intentionally de-boxed to a more unified surface style with subtle dividers.
- Major shell containers (hero, generator rail, main stage, feed rail) now share one canvas with separator lines instead of standalone card boxes.
- Main workspace is now full-width/full-height and visually merged with page background to avoid disconnected “floating pad” effect.
- Standalone app header is removed; navigation and sign-out controls now live in the top row of the PixNovel hero panel.
- Detached hero portrait panel is removed to keep one continuous full-width hero surface.
- Ambient gradients and masonry tinting are shifted to cooler blue/violet tones to avoid warm/yellow cast.
- Modal/dialog surfaces (Whisk generation modal and auth cards) now use dedicated high-contrast styling with dark backdrops and mostly white text for readability.
- Whisk hero/status/video copy uses brighter near-white text and darker status pills for stronger readability on the dark shell.
- Core Whisk CTA/status elements (`.whisk-wall-more`, `.whisk-tile-plus`) are now explicitly high-contrast for readability on image-heavy backgrounds.
- Masonry image pipeline is color-calibrated to reduce purple shifts and preserve source hues.
- Motion policy for Pixnovel is now strict: all animation/transition behavior is removed from active Pixnovel paths, except masonry vertical image scrolling.
- Whisk image wall now uses portrait-first side-by-side cards with a blurred underlay + sharp foreground frame to match NovelAI-style gallery density.
- Whisk image wall now supports an oblique-slice variant: zero-gap portrait cards touching edge-to-edge with diagonal separators and compact caption strips.
- Left-side quick panel now sends actual image-generation requests and builds hidden positive/negative prompts in JS before calling existing API routes.
- Right-side operations rail is live-backed by `/ops/dashboard` for queue + signals.

## Architecture Touchpoints
- Backend: adds Director control-plane API routes and centralized default-config normalization helpers.
- Frontend: new shell composition and theme import.
- CDK: new isolated stage deployment (`StaticWebAWSAIStack-design-pixnovel`).
- AI scripts/notebooks: no change.

## Contract Notes
- API changes:
  - `GET /ops/director/overview`
  - `GET /ops/director/config`
  - `POST /ops/director/config`
  - `POST /ops/director/jobs/prioritize`
  - `POST /ops/director/story/sessions/pin`
  - `POST /ops/director/sound/normalize`
- Runtime config changes:
  - API defaults are now resolved through `backend/lib/director-config.js` (env-aware fallbacks) instead of hardcoded route literals.
- Data model/storage changes:
  - Adds `CFG#director/config` record per user in the media table.
  - Adds `directorPinned` updates on session root records.
  - Adds normalized sound metadata fields when backfilling tracks (`mood`, `energy`, `tags`, `directorNormalizedAt`).

## Handoff Notes For Sub-Agents
- Current priority: evaluate UX quality and readability on live stack.
- Known blockers: hero masonry still uses external prototype image URLs and should be migrated to first-party hosted media; videos page does not yet include queue/status filters.
- Next smallest shippable increment: migrate masonry assets to stack-hosted media and add filters/sorting to `/videos` for larger libraries.
