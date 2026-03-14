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
- Branch naming: `codex/<idea-id>-<slice>`.
- Freeze contracts before workers start.
- Default long-lived working branch: `codex/dev`.
- Agents may edit `codex/dev` directly.
- Human workflow: open PR from `codex/dev` to `main` and merge manually.
- Branch scope contract:
  - `codex/dev` is the full-stack integration branch (backend, frontend, services, cdk, docs, idea registries/status).
  - `codex/dev` keeps frontend styling minimal and functionality-first; avoid adding rich theme/page CSS here.
  - `codex/design-pixnovel/code` is a UI variant overlay branch, rebased on top of `codex/dev`.
- `codex/design-pixnovel/code` may change only `frontend/**` and optional TTL-only stack wiring in `cdk/lib/static-web-aws-ai-stack.ts` or `cdk/scripts/idea-env.js`.
- Do not commit backend route/lib changes, idea docs/registry edits, or generic architecture docs on `codex/design-pixnovel/code`.
- Before pushing `codex/design-pixnovel/code`, verify scope with:
`git diff --name-only codex/dev..codex/design-pixnovel/code`
- Optional guard command (fails on disallowed paths):
`npm --prefix cdk run idea:scope-check`
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
`git worktree add ../wt/<idea-id>/plan -b codex/<idea-id>/plan`
`git worktree add ../wt/<idea-id>/code -b codex/<idea-id>/code`
`git worktree add ../wt/<idea-id>/integrate -b codex/<idea-id>/integrate`
- Worktree responsibilities:
  - `plan`: freeze contracts, split slices, update `ideas/<idea-id>/README.md` + `DECISIONS.md`.
  - `code`: implement isolated slices only, no cross-slice refactors.
  - `integrate`: merge validated slices, run gates, deploy/seed, update `STATUS.md`.
- Merge order:
`codex/<idea-id>/plan -> codex/<idea-id>/code -> codex/<idea-id>/integrate -> main`
- Cleanup command after merge:
`git worktree remove ../wt/<idea-id>/plan && git worktree remove ../wt/<idea-id>/code && git worktree remove ../wt/<idea-id>/integrate`
- Active code worktrees for current design variants:
`/Users/adrienlamoureux/Documents/code/static-web-aws-ai` -> `codex/dev`
`/Users/adrienlamoureux/Documents/code/wt/design-pixnovel/code` -> `codex/design-pixnovel/code` (selected; blush-light)
`/Users/adrienlamoureux/Documents/code/wt/design-pixnovel-legacy/code` -> `codex/design-pixnovel-legacy/code` (legacy)
`/Users/adrienlamoureux/Documents/code/wt/palette-aurora/code` -> `codex/palette-aurora/code`
`/Users/adrienlamoureux/Documents/code/wt/palette-breeze-light/code` -> `codex/palette-breeze-light/code`
`/Users/adrienlamoureux/Documents/code/wt/palette-ember/code` -> `codex/palette-ember/code`
`/Users/adrienlamoureux/Documents/code/wt/palette-lilac-light/code` -> `codex/palette-lilac-light/code`
`/Users/adrienlamoureux/Documents/code/wt/palette-nocturne/code` -> `codex/palette-nocturne/code`

## Idea Environment Policy
- Every parallel prototype must have a unique idea ID (`<idea-id>`).
- Every idea ID maps to one isolated full stack (`StaticWebAWSAIStack-<idea-id>`).
- Use one folder per idea under `ideas/<idea-id>/` with:
  - `README.md` (functional scope and behavior)
  - `DECISIONS.md` (architecture decisions)
  - `RUNBOOK.md` (deploy/destroy operations)
  - `STATUS.md` (latest URLs, blockers, activity log)
  - `IMPROVEMENTS.md` (shared improvement rollouts applied to this idea)
- Keep `/IDEAS.md` updated as the top-level registry.
- Keep `/IMPROVEMENTS.md` updated for cross-idea rollouts.
- Use CDK helper commands so docs and registry are updated consistently:
`npm --prefix cdk run idea:init -- --stage=<idea-id> --title="<title>"`
`npm --prefix cdk run idea:deploy -- --stage=<idea-id> [--owner="<owner>"] [--ttl-days=<days>]`
`npm --prefix cdk run idea:seed -- --target-stage=<idea-id> [--source-stage=<source-stage>] [--source-stack=<stack-name>] [--seed-user-email=<email>] [--seed-user-password=<password>]`
`npm --prefix cdk run idea:destroy -- --stage=<idea-id>`
`npm --prefix cdk run idea:diff -- --stage=<idea-id>`
`npm --prefix cdk run idea:synth -- --stage=<idea-id>`
`npm --prefix cdk run idea:ui-local -- --stage=<idea-id> [--port=<port>] [--print-env] [--open]`
- Batch operations for “same improvement, selected ideas”:
`npm --prefix cdk run idea:list`
`npm --prefix cdk run idea:rollout -- --improvement="<name>" [--exclude=idea-x] [--owner="<owner>"] [--ttl-days=<days>]`
`npm --prefix cdk run idea:deploy-many -- --all --improvement="<name>" [--owner="<owner>"] [--ttl-days=<days>]`
`npm --prefix cdk run idea:deploy-many -- --stages=idea-a,idea-b --improvement="<name>" [--owner="<owner>"] [--ttl-days=<days>]`
`npm --prefix cdk run idea:deploy-many -- --all --exclude=idea-legacy --improvement="<name>" [--owner="<owner>"] [--ttl-days=<days>]`
`npm --prefix cdk run idea:diff-many -- --all`
`npm --prefix cdk run idea:synth-many -- --all`
`npm --prefix cdk run idea:seed-many -- --all [--exclude=idea-x] [--source-stage=<source-stage>] [--source-stack=<stack-name>]`
- For autonomous rollouts across all ideas, prefer `idea:rollout` (build once + deploy all + write logs).
- Post-deploy UI smoke is mandatory for `idea:deploy`, `idea:deploy-many`, and `idea:rollout` (the runner enforces this and rejects `--skip-ui-smoke`).
- For frontend-only changes (files only under `frontend/`), do not deploy immediately; run local preview against hosted stack config with `npm --prefix cdk run idea:ui-local -- --stage=<idea-id>` and validate with `npm --prefix frontend run build`.
- For backend/cdk changes (or any frontend change coupled with backend/cdk contract changes), deploy that idea with `npm --prefix cdk run idea:deploy -- --stage=<idea-id> --improvement="<label>"`.
- A task is complete when:
  - frontend-only: local preview started via `idea:ui-local` + frontend build pass.
  - backend/cdk touched: deploy succeeds and both `[idea-sanity]` and `[idea-ui-smoke]` report pass.
- If deploy cannot be run, stop and report the blocker instead of marking the change complete.
- After every deploy/destroy, update `README.md` and `DECISIONS.md` if scope or architecture changed.
- For deploy-many commands, always provide `--improvement`, and prefer `--dry-run` first when targeting many stacks.
- For seeded demo content, seed from one source stage (default `sandbox`) into target idea stacks after deploy.

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
