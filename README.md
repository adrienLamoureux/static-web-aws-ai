# Whisk Studio

Whisk Studio is an AWS-hosted AI creation platform with image, video, story, music, LoRA, and director workflows. The entire stack — backend, frontend (Sakura Bloom), and CDK infrastructure — lives on a single `main` branch.

## Product Capabilities
- Authenticated creative workspace for images, videos, stories, soundtracks, and LoRA profiles
- Three conversational modes (one backend): **Dashboard** (forms), **Agent** (chat that calls a
  9-tool fleet via Bedrock Converse), **Companion** (full-viewport, character-driven, refuses admin ops)
- Shared image/video library with favorites and sharing flows
- Director operations for configuration, queue visibility, session pinning, and masonry asset management
- Story sessions with scene illustrations, animation, and per-scene music
- Multi-provider AI integrations through Bedrock, Replicate, CivitAI, and Gradio/HuggingFace
- Live2D companion (Hiyori) with contextual AI chat, emotion reactions, proactive prompts, and TTS

## Architecture At A Glance
1. CloudFront serves the Sakura Bloom React bundle and a generated `/config.json`.
2. The frontend resolves `apiBaseUrl` and Cognito settings from `/config.json` at startup.
3. All design variants authenticate through Cognito Hosted UI + PKCE.
4. API Gateway invokes the Lambda-wrapped Express backend.
5. Express routes persist metadata in DynamoDB and media in S3.
6. Backend routes call Bedrock, Replicate, CivitAI, and Gradio providers when needed.

See `docs/architecture.md` for the full route map, storage keys, and deployment modes.

## Repository Layout
- `backend/`: Express API, 29 route modules, auth, data access helpers, provider integrations
- `frontend/`: Sakura Bloom React app — Live2D companion, `skr-` CSS system, 10 themes, bottom HUD
- `cdk/`: infrastructure stacks plus `idea:*` helper scripts
- `ideas/`: per-idea context (`README`, `DECISIONS`, `RUNBOOK`, `STATUS`, `IMPROVEMENTS`, sometimes `cdk-outputs.json`)
- `docs/`: architecture, API spec, ADRs, and workflow docs
- `ai/`: optional research scripts/notebooks only (no runtime dependency)
- `IDEAS.md`: top-level registry of deployed idea stacks
- `AGENTS.md`: collaboration rules for future agents

## Backend Contract Summary
- Route registration: `backend/routes/index.js`
- 29 registered route modules exposing 73+ HTTP endpoints
- Major domains: prompt helper, media management and sharing, image generation, video generation, story sessions/illustration/animation/music, LoRA catalog and profiles, characters, companion (Hiyori), **agent mode** (turn/suggest/sessions/admin), director operations
- Critical invariant: `POST /story/sessions` and `GET /story/sessions/:id` both return `{ session, messages, scenes }` with `messages` and `scenes` at top level, not nested inside `session`

## Storage Model Summary
- DynamoDB single table with `pk` / `sk`
- User partition root: `USER#<cognito-sub>`
- Story session root: `SESSION#<sessionId>`
- Story message keys: `SESSION#<sessionId>#MSG#<timestamp>`
- Story scene keys: `SESSION#<sessionId>#SCENE#<sceneId>`
- S3 user isolation: `users/<cognito-sub>/`

## Deployment Modes

**Full stack** (backend + Sakura frontend + CDK — all from `main`):
```bash
npm --prefix cdk run idea:deploy -- --stage=dev
```

**UI-only design overlay** (separate CloudFront + Cognito app client, shares `dev` backend):
```bash
npm --prefix cdk run idea:deploy -- --stage=<idea-id> --backend-stage=dev
```

Never deploy a design variant without `--backend-stage=dev` — it would create a rogue full stack.

Post-deploy validation is mandatory: `idea:deploy` runs sanity + UI smoke checks automatically.

## Live Stacks

| Idea ID | CloudFront | Notes |
|---------|------------|-------|
| `dev` | `d2l9b1xmucsb19.cloudfront.net` | Full stack — Sakura Bloom frontend |
| `design-fusion` | `d3ei9r5awjyzzr.cloudfront.net` | UI-only overlay, Solaris shell |
| `design-pixnovel` | `d21j30h6jj4n2k.cloudfront.net` | UI-only overlay, PixNovel shell |
| `design-atelier` | `d3mv9zsmbqsn48.cloudfront.net` | UI-only overlay |
| `design-kinetic` | `d1ulh0ke4fvnqg.cloudfront.net` | UI-only overlay |
| `design-solaris` | `d17qd3rx45vcxl.cloudfront.net` | UI-only overlay |

Shared test credentials: `test@test.com` / `Test1234567@`

API: `https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/`
Cognito domain: `whiskstudio-alx-dev-761593662432.auth.us-east-1.amazoncognito.com`

## Local Development

Install dependencies:
```bash
npm --prefix frontend install
npm --prefix backend install
npm --prefix cdk install
```

Run the frontend against the hosted dev stack:
```bash
npm --prefix cdk run idea:ui-local -- --stage=dev
```

Or run without a live stack (uses committed `frontend/public/config.json` as fallback):
```bash
npm --prefix frontend start
```

Useful flags for `idea:ui-local`: `--port=<port>`, `--print-env`, `--open`

Quick backend sanity check:
```bash
node -e "require('./backend/index')"
```

## Infrastructure Commands
```bash
npm --prefix cdk run build
npm --prefix cdk run idea:list
npm --prefix cdk run idea:init -- --stage=<idea-id> --title="<title>"
npm --prefix cdk run idea:deploy -- --stage=<idea-id>
npm --prefix cdk run idea:deploy -- --stage=<idea-id> --backend-stage=<backend-id>
npm --prefix cdk run idea:ui-local -- --stage=<idea-id>
npm --prefix cdk run idea:destroy -- --stage=<idea-id>
```

## Validation Rules
- Backend touched: `node -e "require('./backend/index')"`
- Frontend touched: `npm --prefix frontend run build`
- CDK touched: `npm --prefix cdk run build`
- Backend or CDK changes are not complete until the relevant stage deploy succeeds and both sanity and UI smoke pass

See `CONTRIBUTING.md` for the full quality gate table and PR checklist.

## Documentation Map
Start at **[`docs/README.md`](docs/README.md)** — the index that organises everything by audience
(human / AI) × depth (brief / detailed). Key entries:
- `docs/architecture.md`: detailed human reference — system layers, **diagrams**, data model, deployment modes
- `docs/state-of-the-art.md`: interview-framed deep dive — cost model, security, roadmap, the "why"
- `docs/ai-context.md`: dense agent reference — paths, DynamoDB namespaces, invariants
- `AGENTS.md`: collaboration rules and repo reality (AI brief)
- `CONTRIBUTING.md`: code style, quality gates, PR checklist
- `docs/api-spec.md`: full API contract (73+ endpoints, request/response shapes)
- `docs/testing.md`: how to run and write all test layers
- `docs/adr/`: architecture decision records (001–007)
- `frontend/ARCHITECTURE.md`: component tree, hook graph, CSS system

## Common Configuration
- `ADMIN_EMAIL`
- `SECONDARY_ADMIN_EMAIL`
- `ADMIN_TEMP_PASSWORD`
- `COGNITO_DOMAIN_PREFIX` or `COGNITO_DOMAIN_PREFIX_BASE`
- `FRONTEND_API_URL_OVERRIDE`
- `REPLICATE_API_TOKEN`
- `HUGGING_FACE_TOKEN`
- `BEDROCK_*`

Keep secrets in env or secret stores, never in committed files.

## Troubleshooting
- **Unauthorized after login**: check that the deployed `config.json` points to the matching API and Cognito pool; hard refresh and sign in again; clear the `whisk_auth_tokens` session storage key if token state is stale
- **Slow stack updates**: `BucketDeployment` and CloudFront invalidation can take several minutes
- **Seeding issues**: use `--source-stack=<stack-name>` when the source stack name does not follow stage naming
- **Design variant shows old API**: the variant's S3 `config.json` may still reference an old endpoint; redeploy with `--stage=<id> --backend-stage=dev` to regenerate it
