# Fusion — Solaris shell with Pixnovel-rich capabilities (design-fusion)

## Objective
- Validate a warm, light-first Solaris shell while keeping the full Whisk feature set available.
- Test whether grouped navigation and a calmer visual system improve usability without changing backend contracts.

## Design References
- Primary visual benchmark: editorial light-first creative dashboards with warm neutrals and strong hierarchy.
- Secondary visual benchmark: Solaris-style grouped navigation plus feature depth borrowed from the richer design branches.

## Scope
- In scope:
  - full authenticated React frontend on `codex/design-fusion/code`
  - grouped navigation and renamed information architecture
  - Forge page that unifies Whisk images and videos
  - story, sound, director, LoRA, and shared-library workflows
  - real Cognito auth and runtime config loading
- Out of scope:
  - backend contract rewrites from this branch
  - cross-idea registry edits from this branch
  - turning `main` into a Solaris UI branch

## Delivery Tracks
- Plan track: preserve backend contracts while remapping the frontend information architecture.
- Build track: implement Solaris shell, grouped nav, and shared component library in `frontend/src/**`.
- Integration/QA track: deploy `design-fusion`, run sanity and UI smoke, and keep `STATUS.md` aligned with the live stack.

## Functionalities
- Primary routes:
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
- Legacy redirects preserved:
  - `/whisk -> /forge`
  - `/videos -> /forge?tab=videos`
  - `/story -> /storyboard`
  - `/shared -> /showcase`
  - `/lora -> /director/lora`
  - `/music-library -> /director/sounds`
- Feature coverage:
  - real image generation, video browsing, story scenes, music library, director operations, LoRA management, character flows, and community gallery

## Architecture Touchpoints
- Backend:
  - consumes the shared API contracts from `main`
- Frontend:
  - `frontend/src/App.js`
  - `frontend/src/index.css`
  - `frontend/src/contexts/{ConfigContext,AuthContext,MusicContext}.js`
  - `frontend/src/pages/**`
  - `frontend/src/services/**`
- CDK:
  - current live stage is deployed as `StaticWebAWSAIStack-design-fusion`
- AI scripts/notebooks:
  - no branch-local changes

## Contract Notes
- API changes:
  - none should originate from this branch without first landing in `main`
- Runtime config changes:
  - this branch expects `/config.json` and uses `ConfigContext` as the runtime config entrypoint
- Data model/storage changes:
  - none branch-local; storage semantics come from the shared backend

## Handoff Notes For Sub-Agents
- Current priority:
  - keep Solaris UX work isolated while preserving backend compatibility
- Known blockers:
  - large page modules and hook files make regressions easy if route remaps drift
- Next smallest shippable increment:
  - tighten branch-local docs and preserve the grouped route contract for future frontend work
