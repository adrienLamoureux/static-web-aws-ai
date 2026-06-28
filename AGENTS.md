# Codex Collaboration Instructions

> Last updated: 2026-06-27

## Core Engineering Rules
- Follow `SOLID`, `DRY`, and `KISS`.
- Do not add hardcoded values.
- Do not add magic numbers.
- Externalize secrets and environment-specific values to env/config (`process.env`, `frontend/public/config.json`, `.env`).
- Reuse existing constant/config modules before creating new literals.

## Repo Reality
- `main` is the single source-of-truth branch for the full stack: backend, frontend (Sakura Bloom design), CDK, shared contracts, registries, and documentation.
- The Sakura frontend (Live2D companion, bottom HUD, 10 themes) is the primary UI — it lives in `frontend/src/` on `main`.
- Future agents should read `docs/architecture.md` before changing contracts.

## Stack Map
- Backend API: Node.js + Express in `backend/`, Lambda adapter in `backend/lambda.js`.
- Backend composition root: `backend/lib/build-deps.js` (manual DI, no framework).
- Backend routes: `backend/routes/index.js` registers 29 route modules exposing 73+ HTTP endpoints.
- Backend domain/helpers: `backend/lib/*.js` plus `backend/lib/story-state/` and `backend/lib/agent-tools/`.
- Backend config: `backend/config/models.js`, `backend/config/story-seed-data.js`, `backend/config/lora.js`.
- Frontend: `frontend/src/` — full Sakura Bloom React app (Live2D companion, `skr-` CSS system, 10 themes, bottom HUD).
- Three UI modes via `ModeContext` (localStorage `skr-mode`): `dashboard` | `agent` | `companion`.
  Agent mode = Bedrock Converse + a 9-tool fleet (`backend/lib/agent-tools.js`); companion mode refuses admin ops.
- Infra: AWS CDK 2.x in `cdk/`, with both full-stack and UI-only deployment modes.
- AI scripts: Python notebooks/scripts in `ai/` only; they are not part of runtime execution paths.
- For the dense agent reference (paths, DynamoDB SK namespaces, invariants), see `docs/ai-context.md`.

## Active Branch

`main` is the only active development branch. All backend, frontend, and CDK changes go here.

Other design variant branches (`codex/design-fusion/code`, `codex/design-pixnovel/code`) remain alive as UI-only overlays pointing at the `main` backend — they are not under active development.

## Live Idea Stacks

See `IDEAS.md` for the authoritative auto-maintained registry of all deployed stacks (CloudFront URLs, API endpoints, statuses).

Shared test credentials for the live stacks: `test@test.com` / `Test1234567@`

## Read Order For Agents
1. `AGENTS.md` (this file — rules + repo reality)
2. `docs/ai-context.md` (dense map: paths, data model, invariants) → `docs/architecture.md` (detail + diagrams)
3. Relevant `ideas/<idea-id>/*.md`

Doc navigation hub: `docs/README.md` (audience × depth index).

## Cognito Ownership — CRITICAL

**Cognito is provisioned exclusively by the `dev` stack (deployed from `main`).** UI-only overlay stacks NEVER get their own Cognito user pool.

- The one and only user pool is `us-east-1_KGfmw3Ykn` (dev stack).
- The one and only admin group is `admin` inside that pool.
- All users for all design variants must be created in `us-east-1_KGfmw3Ykn`.
- Each design variant gets its own **app client** inside the dev pool — not its own pool.
- **TRAP**: A variant's browser login URL may still show an old domain (e.g. `whiskstudio-alx-design-sakura-*`) if its `config.json` was never migrated from a legacy full-stack deploy. That URL belongs to a stale pool — do NOT create users there.
- To verify which pool a variant is using: `aws s3 cp s3://<websiteBucket>/config.json -` and check `cognito.userPoolId`. It must always be `us-east-1_KGfmw3Ykn`.
- If it isn't, migrate: create a new app client in the dev pool for the variant's CloudFront callback URL, rewrite `config.json` in S3, invalidate CloudFront.

## Idea Environment Policy
- Every prototype uses a unique idea ID and a dedicated stack name `StaticWebAWSAIStack-<idea-id>`.
- Each idea folder must keep `README.md`, `DECISIONS.md`, `RUNBOOK.md`, `STATUS.md`, and `IMPROVEMENTS.md`.
- Keep `/IDEAS.md` updated as the top-level registry.
- Keep `/IMPROVEMENTS.md` updated for shared rollouts.
- CDK supports two deploy modes:
  - full stack: `StaticWebAWSAIStack` via `cdk/lib/static-web-aws-ai-stack.ts`
  - UI-only overlay: `UiOnlyStack` via `cdk/lib/ui-stack.ts`, driven by `idea:deploy -- --backend-stage=<stage>`
- Standard commands:
`npm --prefix cdk run idea:list`
`npm --prefix cdk run idea:init -- --stage=<idea-id> --title="<title>"`
`npm --prefix cdk run idea:deploy -- --stage=<idea-id> [--owner="<owner>"] [--ttl-days=<days>] [--backend-stage=<stage>]`
`npm --prefix cdk run idea:ui-local -- --stage=<idea-id> [--port=<port>] [--print-env] [--open]`
`npm --prefix cdk run idea:seed -- --target-stage=<idea-id> [--source-stage=<source-stage>] [--source-stack=<stack-name>]`
`npm --prefix cdk run idea:destroy -- --stage=<idea-id>`
`npm --prefix cdk run idea:diff -- --stage=<idea-id>`
`npm --prefix cdk run idea:synth -- --stage=<idea-id>`
`npm --prefix cdk run idea:rollout -- --improvement="<name>" [--exclude=idea-x] [--owner="<owner>"] [--ttl-days=<days>]`
`npm --prefix cdk run idea:deploy-many -- --all --improvement="<name>" [--owner="<owner>"] [--ttl-days=<days>]`
- Post-deploy UI smoke is mandatory and enforced by the deploy runner.
- Completion policy:
  - frontend-only: run `idea:ui-local` for the target stage and `npm --prefix frontend run build`
  - backend or cdk touched: deploy the target stage and confirm both `idea:sanity` and `idea:ui-smoke`

## Parallel Workflow Policy
- Use single-thread execution for small changes that touch one area.
- Use `planner -> workers -> integrator` for medium/large tasks.
- Run each worker in a separate Git worktree and branch from `main`.
- Branch naming: `codex/<idea-id>-<slice>`.
- Freeze contracts before workers start.
- Default long-lived working branch: `main`.
- Human workflow: open PR from feature branch to `main` and merge manually.
- When creating worktrees, branch from `main`.
- Standard worktree layout:
  - `../wt/<idea-id>/plan`
  - `../wt/<idea-id>/code`
  - `../wt/<idea-id>/integrate`
- Standard branch layout:
  - `codex/<idea-id>/plan`
  - `codex/<idea-id>/code`
  - `codex/<idea-id>/integrate`
- Bootstrap commands:
`git worktree add ../wt/<idea-id>/plan -b codex/<idea-id>/plan main`
`git worktree add ../wt/<idea-id>/code -b codex/<idea-id>/code main`
`git worktree add ../wt/<idea-id>/integrate -b codex/<idea-id>/integrate main`
- Worktree responsibilities:
  - `plan`: freeze contracts, split slices, update `ideas/<idea-id>/README.md` and `DECISIONS.md`
  - `code`: implement isolated slices only, no cross-slice refactors
  - `integrate`: merge validated slices, run gates, deploy/seed, update `STATUS.md`
- Merge order:
`codex/<idea-id>/plan -> codex/<idea-id>/code -> codex/<idea-id>/integrate -> main`

## Planner Required Output
1. Problem statement and non-goals.
2. Frozen contracts (API payloads, function signatures, shared object shapes).
3. Slice ownership by path.
4. Validation gates per slice.
5. Merge order and integration risks.

## Worker Rules
- Edit only owned files and contract-approved interfaces.
- Keep diffs minimal and reversible.
- If a backend route contract changes, coordinate matching updates in any affected frontend services.
- Do not change auth behavior in `backend/lib/auth.js` unless explicitly required.
- Raise blockers with concrete file references and contract impact.

## Integrator Rules
- Merge slices in planner order.
- Detect and resolve contract drift before cleanup refactors.
- Run relevant quality gates.
- Report regressions and behavior risks first, then summary.

## Quality Gates

See `CONTRIBUTING.md` for the full quality-gate table and PR checklist. Quick reference:
- Backend touched: `node -e "require('./backend/index')"`
- Frontend touched: `npm --prefix frontend run build`
- CDK touched: `npm --prefix cdk run build`
- All tests: `npm --prefix backend test` and `npm --prefix frontend run test:ci`

## Slice Templates For This Repo
- `backend-api`: `backend/routes/**`, `backend/lib/**`, optional `backend/config/**`
- `frontend-ui`: `frontend/src/**`
- `infra-cdk`: `cdk/lib/**`, `cdk/bin/**`, `cdk/scripts/**`
- `docs-and-ops`: `*.md`, `docs/**`, `ideas/**`
- `ai-research`: `ai/scripts/**`, `ai/notebooks/**`

## Investigation-First Mode
For bugs and unclear behavior, start read-only:
1. Reproduction steps.
2. Top 3 hypotheses ranked by likelihood.
3. Evidence with file references.
4. Smallest validation experiment.

Only after that, implement the minimal safe fix and re-run gates.

## Prompt Templates
Planner:
"Decompose this ticket into independent slices for backend/frontend/cdk as needed. Freeze contracts, define ownership by file paths, and list validation gates and merge order."

Worker:
"Implement only slice <X> in the assigned paths. Respect frozen contracts. Keep changes minimal, avoid hardcoded values/magic numbers, and run slice gates."

Integrator:
"Integrate all completed slices, check for contract drift, run all required gates, and report regressions/risks before final summary."

Investigation:
"Investigate in read-only mode first. Return reproduction, ranked hypotheses, evidence with file references, and the smallest validation experiment. No code changes yet."
