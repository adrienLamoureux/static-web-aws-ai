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
  - PixAI-style hero with anime-inspired portrait treatment.
  - PixAI-style animated masonry stream with bottom-to-top image motion.
  - NovelAI-style generation control menu and render queue side rail.
  - Responsive behavior for desktop/tablet/mobile.
- Out of scope:
  - Backend model routing changes.
  - New API contracts.
  - New auth flows.

## Delivery Tracks
- Plan track: reference extraction + hybrid layout contract.
- Build track: frontend shell/theme implementation in `frontend/src/App.js` and `frontend/src/themes/pixnovel.css`.
- Integration/QA track: isolated `design-pixnovel` stack deploy + sanity + UI smoke + seed content.

## Functionalities
- Existing routes remain unchanged (`/`, `/story`, `/music-library`, `/about`).
- Existing Whisk/Story/Music/About features remain intact in the center stage panel.
- New generator menu mirrors advanced image-generation UX patterns.
- New hero/nav/feed surfaces provide visual differentiation for this idea branch.
- Hero now includes an animated three-column image stream with independent scroll speeds and offsets.
- Masonry stream is hidden on small mobile viewports to preserve readability and performance.
- Nested panels are intentionally de-boxed to a more unified surface style with subtle dividers.
- Major shell containers (hero, generator rail, main stage, feed rail) now share one canvas with separator lines instead of standalone card boxes.
- Main workspace is now full-width/full-height and visually merged with page background to avoid disconnected “floating pad” effect.
- Standalone app header is removed; navigation and sign-out controls now live in the top row of the PixNovel hero panel.
- Ambient gradients and masonry tinting are shifted to cooler blue/violet tones to avoid warm/yellow cast.

## Architecture Touchpoints
- Backend: no runtime behavior change.
- Frontend: new shell composition and theme import.
- CDK: new isolated stage deployment (`StaticWebAWSAIStack-design-pixnovel`).
- AI scripts/notebooks: no change.

## Contract Notes
- API changes: none.
- Runtime config changes: none.
- Data model/storage changes: none.

## Handoff Notes For Sub-Agents
- Current priority: evaluate UX quality and readability on live stack.
- Known blockers: generation controls are currently visual-only (not wired to generation settings); masonry images are external prototype URLs.
- Next smallest shippable increment: replace external masonry sources with first-party media from seeded stack assets and bind control panel values to generation payload fields.
