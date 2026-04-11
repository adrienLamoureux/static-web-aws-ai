# Codex Collaboration Instructions

> Last updated: 2026-03-19

## Core Engineering Rules
- Follow `SOLID`, `DRY`, and `KISS`.
- Do not add hardcoded values.
- Do not add magic numbers.
- Externalize secrets and environment-specific values to env/config (`process.env`, `frontend/public/config.json`, `.env`).
- Reuse existing constant/config modules before creating new literals.

## Repo Reality
- `codex/dev` is the source-of-truth branch for backend, CDK, shared contracts, registries, and cross-branch documentation.
- The `codex/dev` frontend is intentionally a minimal placeholder shell used for deploy validation and baseline route coverage.
- Rich user-facing React experiences live in design overlay worktrees, not in `codex/dev`.
- Future agents should read `REQUIREMENTS.md` and `docs/architecture.md` before changing contracts.

## Stack Map
- Backend API: Node.js + Express in `backend/`, Lambda adapter in `backend/lambda.js`.
- Backend composition root: `backend/lib/build-deps.js` (manual DI, no framework).
- Backend routes: `backend/routes/index.js` registers 15 route modules exposing 73 HTTP endpoints.
- Backend domain/helpers: `backend/lib/*.js` plus `backend/lib/story-state/`.
- Backend config: `backend/config/models.js`, `backend/config/story-seed-data.js`, `backend/config/lora.js`.
- Frontend baseline on `codex/dev`: `frontend/src/App.js`, `frontend/src/index.js`, `frontend/src/index.css`, `frontend/src/services/runtime-config.js`.
- Design overlay frontends: branch-local React apps under `frontend/src/` in the UI worktrees.
- Infra: AWS CDK 2.x in `cdk/`, with both full-stack and UI-only deployment modes.
- AI scripts: Python notebooks/scripts in `ai/` only; they are not part of runtime execution paths.

## Active Worktrees and Branches

| Worktree Path | Branch | Role |
|---------------|--------|------|
| `/Users/adrienlamoureux/Documents/code/static-web-aws-ai` | `codex/dev` | Full-stack integration branch |
| `/Users/adrienlamoureux/Documents/code/wt/design-fusion/code` | `codex/design-fusion/code` | Solaris UI overlay branch |
| `/Users/adrienlamoureux/Documents/code/wt/design-pixnovel/code` | `codex/design-pixnovel/code` | Pixnovel UI overlay branch |

Additional idea directories exist for `design-atelier`, `design-kinetic`, and `design-solaris`, but they do not currently have active `code` worktrees checked out.

## Live Idea Stacks

| Idea ID | Status | CloudFront | API |
|---------|--------|------------|-----|
| `dev` | LIVE | `d2l9b1xmucsb19.cloudfront.net` | `k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/` |
| `design-fusion` | LIVE | `d3ei9r5awjyzzr.cloudfront.net` | `luu3x0m826.execute-api.us-east-1.amazonaws.com/prod/` |
| `design-pixnovel` | LIVE | `d21j30h6jj4n2k.cloudfront.net` | `5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/` |
| `design-atelier` | LIVE | `d3mv9zsmbqsn48.cloudfront.net` | `6g0ug8ef7l.execute-api.us-east-1.amazonaws.com/prod/` |
| `design-kinetic` | LIVE | `d1ulh0ke4fvnqg.cloudfront.net` | `ebd594ulg4.execute-api.us-east-1.amazonaws.com/prod/` |
| `design-solaris` | LIVE | `d17qd3rx45vcxl.cloudfront.net` | `u3a3qlhk2h.execute-api.us-east-1.amazonaws.com/prod/` |

Shared test credentials for the live stacks: `test@test.com` / `Test1234567@`

## Read Order For Agents
1. `AGENTS.md`
2. `REQUIREMENTS.md`
3. `docs/architecture.md`
4. Relevant `ideas/<idea-id>/*.md`
5. Branch-local `frontend/REQUIREMENTS.md` when working inside a UI overlay worktree

## Branch Scope Contract
- `codex/dev` may change `backend/**`, `cdk/**`, `ideas/**`, shared docs, and the minimal baseline frontend.
- `codex/dev` must keep frontend styling minimal and functionality-first. Do not build rich themed UX here.
- Design branches (`codex/design-*/code`) are frontend overlay branches rebased on top of `codex/dev`.
- Design branches may change only:
  - `frontend/**`
  - optional stack wiring in `cdk/lib/static-web-aws-ai-stack.ts`, `cdk/lib/ui-stack.ts`, or `cdk/scripts/idea-env.js`
  - branch-local context docs that exist to help future agents on that specific design branch (`AGENTS.md`, `README.md`, `frontend/REQUIREMENTS.md`)
- Do not commit backend route/lib changes, shared idea registry edits, or generic cross-repo architecture rewrites on design branches.
- Before pushing a design branch, verify scope with:
`git diff --name-only codex/dev..codex/<design-branch>`

## Parallel Workflow Policy
- Use single-thread execution for small changes that touch one area.
- Use `planner -> workers -> integrator` for medium/large tasks.
- Run each worker in a separate Git worktree and branch.
- Branch naming: `codex/<idea-id>-<slice>`.
- Freeze contracts before workers start.
- Default long-lived working branch: `codex/dev`.
- Human workflow: open PR from `codex/dev` to `main` and merge manually.
- When creating worktrees, branch from `codex/dev` unless a task explicitly requires another base.
- Standard worktree layout:
  - `../wt/<idea-id>/plan`
  - `../wt/<idea-id>/code`
  - `../wt/<idea-id>/integrate`
- Standard branch layout:
  - `codex/<idea-id>/plan`
  - `codex/<idea-id>/code`
  - `codex/<idea-id>/integrate`
- Bootstrap commands:
`git worktree add ../wt/<idea-id>/plan -b codex/<idea-id>/plan codex/dev`
`git worktree add ../wt/<idea-id>/code -b codex/<idea-id>/code codex/dev`
`git worktree add ../wt/<idea-id>/integrate -b codex/<idea-id>/integrate codex/dev`
- Worktree responsibilities:
  - `plan`: freeze contracts, split slices, update `ideas/<idea-id>/README.md` and `DECISIONS.md`
  - `code`: implement isolated slices only, no cross-slice refactors
  - `integrate`: merge validated slices, run gates, deploy/seed, update `STATUS.md`
- Merge order:
`codex/<idea-id>/plan -> codex/<idea-id>/code -> codex/<idea-id>/integrate -> main`

## Cognito Ownership — CRITICAL

**Cognito is provisioned exclusively by `codex/dev`.** Design variant stacks (UI-only) NEVER get their own Cognito user pool.

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
Run from repo root:

- Backend touched:
`node -e "require('./backend/index')"`

- Frontend touched:
`npm --prefix frontend run build`

- CDK touched:
`npm --prefix cdk run build`

- Cross-layer changes:
run all applicable commands above before finalizing

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
