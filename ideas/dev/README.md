# dev (main branch)

## Objective
- Provide the full-stack source-of-truth branch for backend, frontend (Sakura Bloom), infrastructure, idea registries, and shared documentation.
- Deploy a production-grade React frontend with Live2D companion, 10 themes, and bottom HUD alongside the full backend.

## Design References
- Primary UI: Sakura Bloom — deep indigo + pink palette, 10 themes, glassmorphism surfaces.
- Design overlay variants (`design-fusion`, `design-pixnovel`, etc.) consume the backend contracts from this branch via UI-only stacks.

## Scope
- In scope:
  - backend routes, helpers, auth, storage, and provider integrations
  - CDK stacks, deployment helpers, idea registry updates
  - shared docs and documentation
  - Sakura Bloom frontend (`frontend/src/`)
- Out of scope:
  - UI-only design variant changes (belong in their respective idea worktrees)

## Delivery Tracks
- Plan track: freeze shared backend/runtime contracts before parallel UI work starts.
- Build track: backend, frontend, and CDK changes land here.
- Integration/QA track: deploy `dev`, run sanity and UI smoke, then document the result in `STATUS.md`.

## Functionalities
- All backend product capabilities:
  - image generation
  - video generation
  - story sessions and scene media
  - music library flows
  - LoRA catalog and profile management
  - character CRUD
  - director operations
- Full Sakura Bloom frontend exposing: `/` (Home), `/atelier` (Forge), `/chronicle` (Story), `/sanctum` (Director), `/lora`, `/music-library`, `/about`, `/login`, `/auth/callback`

## Architecture Touchpoints
- Backend:
  - `backend/routes/index.js`
  - `backend/lib/build-deps.js`
  - `backend/lib/auth.js`
  - `backend/lib/keys.js`
- Frontend:
  - `frontend/src/App.js`
  - `frontend/src/services/runtime-config.js`
  - `frontend/src/contexts/`
- CDK:
  - `cdk/bin/static-web-aws-ai-stack.ts`
  - `cdk/lib/static-web-aws-ai-stack.ts`
  - `cdk/lib/ui-stack.ts`
  - `cdk/scripts/idea-env.js`

## Contract Notes
- API changes:
  - all shared backend contract changes must land here before design variant overlays consume them
- Runtime config changes:
  - preserve the deployed `config.json` shape (`apiBaseUrl`, `cognito.domain`, `cognito.clientId`, `cognito.userPoolId`, `cognito.region`)
- Data model/storage changes:
  - preserve DynamoDB `USER#<sub>` partitioning and S3 `users/<sub>/` isolation

## Handoff Notes For Sub-Agents
- Current priority:
  - preserve backend and deployment correctness while improving documentation quality
- Known blockers:
  - `Whisk.js` (488 lines) and `Story.js` (441 lines) are near the 500-line limit — watch for further growth
  - low automated test coverage on some route groups
- Next smallest shippable increment:
  - keep shared docs and idea status files aligned with the deployed state before large new feature work begins
