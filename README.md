# Static Web AWS AI

Whisk Studio is an AWS-hosted AI creation platform with image, video, story, music, LoRA, and director workflows. This repository now operates as one full-stack baseline branch plus multiple UI overlay branches.

## Current Development Model

| Branch | Role | Frontend Reality |
|--------|------|------------------|
| `codex/dev` | Source of truth for backend, CDK, contracts, registries, and shared docs | Intentionally minimal placeholder UI |
| `codex/design-fusion/code` | Solaris overlay branch | Full React app with grouped navigation and warm light-first shell |
| `codex/design-pixnovel/code` | Pixnovel overlay branch | Full React app with cinematic shell, quick-generate panel, and director-first layout |

The important consequence is that `codex/dev` should stay functionality-first and contract-focused. Rich UX work belongs in the design worktrees.

## Product Capabilities
- Authenticated creative workspace for images, videos, stories, soundtracks, and LoRA profiles
- Shared image/video library with favorites and sharing flows
- Director operations for configuration, queue visibility, session pinning, and masonry asset management
- Story sessions with scene illustrations, animation, and per-scene music
- Multi-provider AI integrations through Bedrock, Replicate, CivitAI, and Gradio/HuggingFace

## Architecture At A Glance
1. CloudFront serves the React bundle and a generated `/config.json`.
2. The frontend resolves `apiBaseUrl` and Cognito settings from `/config.json`, with localhost env fallbacks.
3. Design branches authenticate through Cognito Hosted UI + PKCE. The `codex/dev` placeholder frontend uses a fake session token only for baseline route coverage.
4. API Gateway invokes the Lambda-wrapped Express backend.
5. Express routes persist metadata in DynamoDB and media in S3.
6. Backend routes call Bedrock, Replicate, CivitAI, and Gradio providers when needed.

See `docs/architecture.md` for the current branch/worktree topology, route groups, storage keys, and deployment modes.

## Repository Layout
- `backend/`: Express API, route modules, auth, data access helpers, provider integrations
- `frontend/`: placeholder frontend on `codex/dev`; full React apps on design branches
- `cdk/`: infrastructure stacks plus `idea:*` helper scripts
- `ideas/`: per-idea context (`README`, `DECISIONS`, `RUNBOOK`, `STATUS`, `IMPROVEMENTS`, sometimes `cdk-outputs.json`)
- `docs/`: shared architecture and workflow diagrams
- `ai/`: optional research scripts/notebooks only
- `IDEAS.md`: top-level registry of deployed idea stacks
- `IMPROVEMENTS.md`: shared rollout log across ideas
- `AGENTS.md`: collaboration rules for future agents
- `REQUIREMENTS.md`: branch-specific requirements for `codex/dev`

## Backend Contract Summary
- Route registration lives in `backend/routes/index.js`.
- There are 15 registered route modules exposing 73 HTTP endpoints.
- Major domains:
  - prompt helper
  - media management and sharing
  - image generation and status
  - video generation and status
  - story sessions, messaging, illustration, animation, and music
  - director operations
  - LoRA catalog and profile management
  - character CRUD
- Critical invariant:
  - `POST /story/sessions`
  - `GET /story/sessions/:id`
  both return `{ session, messages, scenes }` with `messages` and `scenes` at top level, not nested inside `session`.

## Storage Model Summary
- DynamoDB uses a single table with `pk` / `sk`.
- User partition root: `USER#<cognito-sub>`.
- Story session root: `SESSION#<sessionId>`.
- Story message keys: `SESSION#<sessionId>#MSG#<timestamp>`.
- Story scene keys: `SESSION#<sessionId>#SCENE#<sceneId>`.
- S3 user isolation uses the prefix `users/<cognito-sub>/`.

## Deployment Modes
- Full stack:
  - `cdk/lib/static-web-aws-ai-stack.ts`
  - creates CloudFront, S3, API Gateway, Lambda, Cognito, DynamoDB
- UI-only overlay:
  - `cdk/lib/ui-stack.ts`
  - creates only the website bucket/distribution and a per-design Cognito app client
  - deploy with `npm --prefix cdk run idea:deploy -- --stage=<idea-id> --backend-stage=<backend-id>`

## Active Worktrees And Live Stacks

| Branch | Worktree | CloudFront | API |
|--------|----------|------------|-----|
| `codex/dev` | `/Users/adrienlamoureux/Documents/code/static-web-aws-ai` | `https://d2l9b1xmucsb19.cloudfront.net` | `https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/` |
| `codex/design-fusion/code` | `/Users/adrienlamoureux/Documents/code/wt/design-fusion/code` | `https://d3ei9r5awjyzzr.cloudfront.net` | `https://luu3x0m826.execute-api.us-east-1.amazonaws.com/prod/` |
| `codex/design-pixnovel/code` | `/Users/adrienlamoureux/Documents/code/wt/design-pixnovel/code` | `https://d21j30h6jj4n2k.cloudfront.net` | `https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/` |

Shared test credentials across the live stacks: `test@test.com` / `Test1234567@`

## Local Development

Install dependencies:

```bash
npm --prefix frontend install
npm --prefix backend install
npm --prefix cdk install
```

Run the placeholder frontend on `codex/dev`:

```bash
npm --prefix frontend start
```

Run any frontend against hosted stack config:

```bash
npm --prefix cdk run idea:ui-local -- --stage=<idea-id>
```

Useful flags:
- `--port=<port>`
- `--print-env`
- `--open`

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

Post-deploy validation is mandatory:
- `idea:deploy`, `idea:deploy-many`, and `idea:rollout` run sanity + UI smoke automatically
- the deploy runner rejects `--skip-ui-smoke`

## Validation Rules
- Backend touched: `node -e "require('./backend/index')"`
- Frontend touched: `npm --prefix frontend run build`
- CDK touched: `npm --prefix cdk run build`
- Backend or CDK changes are not considered complete until the relevant stage deploy succeeds and both sanity and UI smoke pass

## Documentation Map
- `AGENTS.md`: collaboration rules and branch boundaries
- `REQUIREMENTS.md`: `codex/dev` operating constraints and frozen contracts
- `docs/architecture.md`: current architecture, route map, branch/worktree model
- `docs/branches-worktrees-diagram.md`: visual topology
- `ideas/dev/README.md`: baseline branch/stack intent
- `ideas/design-fusion/README.md`: Solaris overlay summary
- `ideas/design-pixnovel/README.md`: Pixnovel overlay summary
- `frontend/REQUIREMENTS.md` inside each UI worktree: branch-local frontend guidance

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
- Unauthorized after login:
  - check that the deployed `config.json` points to the matching API and Cognito pool
  - hard refresh and sign in again
  - clear the `whisk_auth_tokens` session storage key if token state is stale
- Placeholder auth confusion on `codex/dev`:
  - the baseline frontend does not execute the real Cognito flow
  - use a design worktree or a deployed idea stack when validating actual auth UX
- Slow stack updates:
  - `BucketDeployment` and CloudFront invalidation can take several minutes
- Seeding issues:
  - use `--source-stack=<stack-name>` when the source stack name does not follow stage naming
