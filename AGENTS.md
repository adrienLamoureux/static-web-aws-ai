# Codex Collaboration Instructions

## Core Engineering Rules
- Follow `SOLID`, `DRY`, and `KISS`.
- Do not add hardcoded values.
- Do not add magic numbers.
- Externalize secrets and environment-specific values to env/config (`process.env`, `frontend/public/config.json`, `.env`).
- Reuse existing constant/config modules before creating new literals.

## Stack Map
- Backend API: Node.js + Express in `backend/`, Lambda adapter in `backend/lambda.js`.
- Backend composition root: `backend/lib/build-deps.js`.
- Backend routes: `backend/routes/*.js`.
- Backend domain/helpers: `backend/lib/*.js`.
- Frontend app: React (CRA) in `frontend/src/`.
- Frontend API access: `frontend/src/services/*.js` (single source for HTTP calls).
- Frontend story domain: `frontend/src/pages/story/*`.
- Infra: AWS CDK TypeScript in `cdk/`.
- AI scripts: Python notebooks/scripts in `ai/` (isolated from runtime app paths).

## Parallel Workflow Policy
- Use single-thread execution for small changes that touch one area.
- Use `planner -> workers -> integrator` for medium/large tasks.
- Run each worker in a separate Git worktree and branch.
- Branch naming: `codex/<ticket>-<slice>`.
- Freeze contracts before workers start.

## Planner Required Output
1. Problem statement and non-goals.
2. Frozen contracts (API payloads, function signatures, shared object shapes).
3. Slice ownership by path.
4. Validation gates per slice.
5. Merge order and integration risks.

## Worker Rules
- Edit only owned files and contract-approved interfaces.
- Keep diffs minimal and reversible.
- If an API contract changes in backend routes, include or coordinate matching updates in `frontend/src/services/`.
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

- Cross-layer changes (backend + frontend contract or backend + cdk):
run all applicable commands above before finalizing.

## Slice Templates For This Repo
- `backend-api`: `backend/routes/**`, `backend/lib/**`, optional `backend/config/**`.
- `frontend-ui`: `frontend/src/pages/**`, `frontend/src/components/**`, related css.
- `frontend-service`: `frontend/src/services/**`, API payload/response normalization.
- `infra-cdk`: `cdk/lib/**`, `cdk/bin/**`.
- `ai-research`: `ai/scripts/**`, `ai/notebooks/**`.

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
