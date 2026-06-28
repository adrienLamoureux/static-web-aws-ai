# AI Context — Whisk Studio (detailed agent reference)

> Dense, token-efficient map for an agent doing real work in this repo. Facts only;
> narrative lives in [`architecture.md`](./architecture.md), endpoint shapes in
> [`api-spec.md`](./api-spec.md). Verify against code before asserting — paths drift.
> Snapshot: 2026-06-27, commit `5ad6183`. Brief version: [`/AGENTS.md`](../AGENTS.md).

## Orientation
- One product, one `main` branch: backend (Express/JS) + frontend (React/Sakura Bloom) + CDK (TS).
- Fully serverless on AWS. Read order: this file → `architecture.md` → relevant `ideas/<id>/*.md`.
- Tests: backend **358** (`npm --prefix backend test`), frontend **129** (`npm --prefix frontend run test:ci`).

## Stack map (paths)
| Area | Path | Notes |
|------|------|-------|
| Lambda entry | `backend/lambda.js` | wraps Express app |
| Composition root | `backend/lib/build-deps.js` | flat `deps` object, manual DI (ADR-004) |
| Route hub | `backend/routes/index.js` | mounts **29** Router modules, 73+ endpoints |
| Domain/helpers | `backend/lib/*.js`, `backend/lib/story-state/`, `backend/lib/agent-tools/` | |
| Backend config | `backend/config/{models,story-seed-data,lora}.js` | no hardcoded literals in routes |
| Frontend | `frontend/src/` | CRA, `skr-` CSS, 10 themes |
| CDK | `cdk/lib/static-web-aws-ai-stack.ts` (full) · `cdk/lib/ui-stack.ts` (UI-only) | |
| Deploy CLI | `cdk/scripts/idea-env.js` | `idea:*` npm scripts |

## DI rules (backend)
- Every route module exports a fn returning an Express `Router`; never mutate `app` directly.
- Wire new shared utilities in `build-deps.js`, pass via `deps`. Don't `require()` deps at the
  top of route files — **only 3 sanctioned exceptions**: `civitai-client`, `director-config`,
  `lora-utils`. Do not add more.

## DynamoDB single-table (`pk = USER#{sub}`, sort key `sk`)
| SK namespace | Holds |
|--------------|-------|
| `IMG#` / `VID#` / `JOB#` | user media + generation jobs (`users/<sub>/` in S3) |
| `SESSION#{id}` (+ `#MSG#`, `#SCENE#`) | story sessions |
| `COMPANION#{modelId}` (+ `#MSG#`) | long-lived companion memory |
| `AGENT#{sessionId}` (+ `#MSG#`) | agent memory; compaction > 30 turns |
| `AGENT#STATE` | cross-session prefs `{lastStyle,lastAspect,lastLora,theme}` — **enum-validated read+write** |
| `AGENT#RATE` | token bucket |
| `AGENT#COST` | token totals + 200k/day cap |
| `AGENT#IMG_COUNT` | 50/day image cap (independent rollover) |
| `AGENT#SESSION#{id}` | named session metadata; the id IS the memory namespace |
| `CONFIG#AGENT` | admin Bedrock model override (60s cache, default Haiku 4.5) |
| `PRESET#{STORY,CHARACTER,PROMPT_HELPER}` | seed content |

## Modes (frontend)
`ModeContext` (localStorage `skr-mode`) ∈ `dashboard` | `agent` | `companion`; swaps the whole shell.
`AgentContext` owns turn stream, serial submit queue, intent confirm/abort, slash commands, voice,
TTS, `activeSessionId` (localStorage `skr-agent-session`). Companion mode refuses admin ops by design.

## Agent tool fleet (9) — `backend/lib/agent-tools.js` + `agent-tools/*`
- server-dispatch (get a 2nd ≤120-tok closing turn): `generate_image`, `recall_favorites`,
  `browse_gallery`, `view_my_creations`.
- client-action: `set_theme`. static (no LLM): `what_can_you_do`.
- intent/confirm (user approves before write): `continue_story`, `illustrate_scene`, `generate_music`.
- `generate_image` fast-path: Replicate within `Prefer: wait=5` → writes IMG row + returns signed URL.

## Invariants & gotchas (these bite)
- `GET/POST /story/sessions[/:id]` return `{ session, messages, scenes }` with **messages/scenes
  TOP-LEVEL**, not nested; session id is `session.id` (not `sessionId`); messages have no `sceneId`
  (match chronologically). See [`api-spec.md`](./api-spec.md).
- `auth.js` resolves `isAdmin` from `cognito:groups` in all 3 claim paths; the `admin` cohort flag
  depends on it.
- User media served only via expiring S3 signed URLs; ops are scoped to `users/{sub}/`.
- Cognito is ONE pool `us-east-1_KGfmw3Ykn`; variants get an app client, never their own pool.

## Conventions
- `skr-` CSS prefix; tokens in `src/styles/tokens.css`; no inline theming; import API via
  `src/services/apiClient.js` (no raw `fetch` in components).
- 500-line cap on `.js`/`.css` (`scripts/check-file-length.sh`). Backend tests: `node:test` (ADR-002).
- `frontend/src/styles/` is Prettier-ignored (compact single-line CSS).

## CI gates (`.github/workflows/ci.yml`) — all must pass before push
Per side: `npm run lint` (0 errors; warnings OK) · `npm run format:check` (`prettier --check`,
**hard gate**) · tests. Plus `scripts/check-file-length.sh`. Running tests alone is NOT sufficient.
Fix formatting with `npm run format`; if reflow trips the 500-line cap, split the file (don't re-compact).

## Deploy (one command; full stack from `main`)
`npm --prefix cdk run idea:deploy -- --stage=dev` — builds both halves, CDK deploy, Live2D `s3 sync`,
then sanity (6) + Playwright UI smoke (10). UI-only variant: add `--backend-stage=dev` (**never omit**,
or it spins a rogue full stack). Deploy auto-edits `IDEAS.md` + `ideas/dev/STATUS.md` — commit them.
Full deploy modes + Cognito SSOT detail: [`architecture.md`](./architecture.md) §4, §6.
