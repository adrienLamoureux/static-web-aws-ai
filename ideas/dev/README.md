# dev (codex/dev baseline)

## Objective
- Provide the full-stack source-of-truth branch for backend, infrastructure, idea registries, and shared documentation.
- Keep a deployable but intentionally minimal placeholder frontend for baseline route coverage and smoke validation.

## Design References
- Primary benchmark: functionality-first integration branch, not a flagship visual reference.
- Secondary benchmark: design worktrees consume the contracts from this branch and provide the real UX.

## Scope
- In scope:
  - backend routes, helpers, auth, storage, and provider integrations
  - CDK stacks, deployment helpers, idea registry updates
  - shared docs and branch coordination material
  - placeholder frontend routes required for deploy validation
- Out of scope:
  - rich themed frontend work
  - design-system exploration
  - branch-local UX experiments that belong on UI overlays

## Delivery Tracks
- Plan track: freeze shared backend/runtime contracts before parallel UI work starts.
- Build track: backend and CDK changes land here first.
- Integration/QA track: deploy `dev`, run sanity and UI smoke, then document the result in `STATUS.md`.

## Functionalities
- All backend product capabilities are owned here:
  - image generation
  - video generation
  - story sessions and scene media
  - music library flows
  - LoRA catalog and profile management
  - character CRUD
  - director operations
- The frontend on this branch exposes placeholder surfaces for `/`, `/shared`, `/whisk`, `/lora`, `/videos`, `/director`, `/story`, `/music-library`, `/about`, `/login`, and `/auth/callback`.

## Architecture Touchpoints
- Backend:
  - `backend/routes/index.js`
  - `backend/lib/build-deps.js`
  - `backend/lib/auth.js`
  - `backend/lib/keys.js`
- Frontend:
  - `frontend/src/App.js`
  - `frontend/src/services/runtime-config.js`
- CDK:
  - `cdk/bin/static-web-aws-ai-stack.ts`
  - `cdk/lib/static-web-aws-ai-stack.ts`
  - `cdk/lib/ui-stack.ts`
  - `cdk/scripts/idea-env.js`
- AI scripts/notebooks:
  - optional only, no runtime dependency

## Contract Notes
- API changes:
  - all shared backend contract changes must land here before design branches consume them
- Runtime config changes:
  - preserve the deployed `config.json` shape (`apiBaseUrl`, `cognito.domain`, `cognito.clientId`, `cognito.userPoolId`, `cognito.region`)
- Data model/storage changes:
  - preserve DynamoDB `USER#<sub>` partitioning and S3 `users/<sub>/` isolation

## Handoff Notes For Sub-Agents
- Current priority:
  - preserve backend and deployment correctness while improving documentation quality
- Known blockers:
  - low automated test coverage
  - contract drift risk across active UI overlays
- Next smallest shippable increment:
  - keep shared docs and idea status files aligned with the deployed state before large new feature work begins
