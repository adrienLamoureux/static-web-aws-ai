# Requirements — codex/dev

> Last updated: 2026-03-19
> Branch: `codex/dev`
> Worktree: `/Users/adrienlamoureux/Documents/code/static-web-aws-ai`
> Scope: backend, infrastructure, shared contracts, idea registries, and minimal baseline frontend

## 1. Mission Of This Branch
- `codex/dev` owns the backend API, CDK stacks, deployment tooling, shared architecture docs, and cross-branch contracts.
- `codex/dev` is intentionally not the flagship frontend UX branch.
- The local frontend on this branch must remain a deployable placeholder, not a second rich product shell.
- If a design branch needs a backend or contract change, land it here first and then update the UI overlays that consume it.

## 2. Non-Negotiable Branch Boundary
- Safe to edit here:
  - `backend/**`
  - `cdk/**`
  - `ideas/**`
  - shared docs (`*.md`, `docs/**`)
  - placeholder frontend files in `frontend/src/**`
- Do not turn `codex/dev` into a rich themed frontend branch.
- Do not move branch-specific UX decisions from `design-fusion` or `design-pixnovel` back into this branch unless they are becoming the shared baseline.

## 3. Frozen Contracts Future Agents Must Preserve

### 3.1 Runtime Config Shape
CDK publishes `/config.json` with:

```json
{
  "apiBaseUrl": "https://...",
  "cognito": {
    "domain": "https://...",
    "clientId": "...",
    "userPoolId": "...",
    "region": "us-east-1"
  }
}
```

Localhost may override with:
- `REACT_APP_API_URL`
- `REACT_APP_COGNITO_DOMAIN`
- `REACT_APP_COGNITO_CLIENT_ID`
- `REACT_APP_COGNITO_USER_POOL_ID`
- `REACT_APP_COGNITO_REGION`

### 3.2 Auth Behavior
- `backend/lib/auth.js` enforces auth on every route except `/` and `/health`.
- Primary auth source: API Gateway Cognito authorizer claims.
- Unsigned JWT fallback is allowed only when `ALLOW_UNSIGNED_JWT_FALLBACK=true` and `NODE_ENV !== "production"`.
- Authenticated request identity must resolve to:

```json
{ "sub": "<cognito-sub>", "email": "<email>" }
```

### 3.3 Story Session API Shape
`POST /story/sessions` and `GET /story/sessions/:id` must preserve:

```json
{
  "session": {},
  "messages": [],
  "scenes": []
}
```

Notes:
- `messages` and `scenes` are top-level arrays.
- story messages do not carry `sceneId`.
- UI overlays match scenes to assistant messages chronologically.

### 3.4 Storage Keys
- DynamoDB user partition: `USER#<sub>`
- Story session root: `SESSION#<sessionId>`
- Story message sort key: `SESSION#<sessionId>#MSG#<timestamp>`
- Story scene sort key: `SESSION#<sessionId>#SCENE#<sceneId>`
- S3 user isolation: `users/<sub>/`

### 3.5 Route Registration
- New route modules must be registered in `backend/routes/index.js`.
- New shared dependencies must be added in `backend/lib/build-deps.js`.

## 4. Architecture Surfaces In This Branch

### 4.1 Backend
- Registered route modules: 15
- Total endpoints: 73
- Route groups:
  - core prompt and health
  - media library and sharing
  - Bedrock image/video
  - Replicate image/video
  - CivitAI image
  - Gradio image
  - story sessions
  - story messaging
  - story illustration, animation, and music
  - director operations
  - LoRA catalog and profiles
  - characters

### 4.2 Infrastructure
- Full-stack stack: `cdk/lib/static-web-aws-ai-stack.ts`
- UI-only stack: `cdk/lib/ui-stack.ts`
- CDK entrypoint: `cdk/bin/static-web-aws-ai-stack.ts`
- Deployment automation:
  - `cdk/scripts/idea-env.js`
  - `cdk/scripts/sanity-check.mjs`
  - `cdk/scripts/ui-smoke.mjs`
  - `cdk/scripts/seed-idea-content.js`

### 4.3 Frontend Baseline
- `codex/dev` frontend is only:
  - `frontend/src/App.js`
  - `frontend/src/index.js`
  - `frontend/src/index.css`
  - `frontend/src/services/runtime-config.js`
- It provides placeholder auth and minimal route surfaces for deployment smoke coverage.
- Do not treat this branch as the reference implementation for real frontend behavior.

### 4.4 Design Overlays Depending On These Contracts
- `codex/design-fusion/code`
  - Solaris shell
  - grouped navigation
  - real Cognito auth
  - full story/music/director flows
- `codex/design-pixnovel/code`
  - Pixnovel shell
  - quick-generate workflow
  - director-first right/left rail layout
  - real Cognito auth

## 5. Active Deployment Snapshot

| Idea | CloudFront | API |
|------|------------|-----|
| `dev` | `https://d2l9b1xmucsb19.cloudfront.net` | `https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/` |
| `design-fusion` | `https://d3ei9r5awjyzzr.cloudfront.net` | `https://luu3x0m826.execute-api.us-east-1.amazonaws.com/prod/` |
| `design-pixnovel` | `https://d21j30h6jj4n2k.cloudfront.net` | `https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/` |

Shared test credentials: `test@test.com` / `Test1234567@`

## 6. Validation Requirements
- Backend touched:
`node -e "require('./backend/index')"`
- Frontend touched:
`npm --prefix frontend run build`
- CDK touched:
`npm --prefix cdk run build`
- Backend or CDK touched:
`npm --prefix cdk run idea:deploy -- --stage=dev`
- Deploy completion requires:
  - `[idea-sanity]` passed
  - `[idea-ui-smoke]` passed

If deploy is blocked, report the blocker. Do not mark the change complete.

## 7. Read-First Files
1. `AGENTS.md`
2. `docs/architecture.md`
3. `backend/routes/index.js`
4. `backend/lib/build-deps.js`
5. `backend/lib/auth.js`
6. `backend/lib/keys.js`
7. `cdk/bin/static-web-aws-ai-stack.ts`
8. `cdk/lib/static-web-aws-ai-stack.ts`
9. `cdk/lib/ui-stack.ts`
10. `cdk/scripts/idea-env.js`

## 8. Current Constraints And Debt
- Backend test coverage is still very low:
  - `backend/test/auth.test.js`
  - `backend/test/lora-support.test.js`
- There is no OpenAPI spec.
- Several large frontend modules live only in design branches, so contract drift is a real risk.
- `backend/routes/story-illustration-route.js` remains a large high-risk module.
- `ideas/dev` and `ideas/design-fusion` required documentation refresh because their committed docs had fallen behind the deployed state.

## 9. Agent Checklist
- Confirm whether the task belongs on `codex/dev` or a design branch before editing.
- Preserve the story response shape.
- Preserve runtime config shape.
- Update idea docs and registry entries when deploy reality changes.
- Run the required gates for every touched layer.
