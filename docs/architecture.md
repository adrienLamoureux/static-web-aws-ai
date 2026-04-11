# Architecture Overview

> Last updated: 2026-04-06

This file is the current source of truth for the repo architecture, deployment modes, and branch/worktree model.

## 1. System Layers

| Layer | Primary Files | Notes |
|-------|---------------|------|
| Frontend baseline | `frontend/src/App.js`, `frontend/src/index.js`, `frontend/src/index.css` | Placeholder shell on `codex/dev` only |
| UI overlays | `frontend/src/**` in design worktrees | Full React experiences live here |
| Backend API | `backend/index.js`, `backend/routes/**`, `backend/lib/**` | Express app wrapped for Lambda |
| Runtime config | `frontend/public/config.json` at deploy time, `frontend/src/services/runtime-config.js` | Drives API and Cognito wiring |
| Infrastructure | `cdk/bin/static-web-aws-ai-stack.ts`, `cdk/lib/*.ts`, `cdk/scripts/*.js` | Full-stack and UI-only deploy modes |
| Idea metadata | `IDEAS.md`, `IMPROVEMENTS.md`, `ideas/<idea-id>/**` | Registry, status, decisions, runbooks |

See [`docs/api-access.md`](./api-access.md) for the complete endpoint inventory with public / user / admin access levels.

## 2. Branch And Worktree Topology

### 2.1 `codex/dev`
- Owns backend, CDK, shared docs, and contract changes.
- Frontend is intentionally minimal and should stay that way.
- This is the integration branch future agents should use when changing behavior shared by all ideas.

### 2.2 `codex/design-fusion/code`
- Solaris-style frontend overlay.
- Uses grouped navigation:
  - Home
  - Forge
  - Storyboard
  - Showcase
  - Director
  - Sound Vault
  - LoRA Catalog
- Keeps real Cognito auth, ConfigContext, MusicContext, and the full page set.

### 2.3 `codex/design-pixnovel/code`
- Pixnovel-style frontend overlay.
- Uses a cinematic shell plus quick-generate controls and operations rails.
- App-level shell logic is concentrated in `frontend/src/App.js` and `frontend/src/config/pixnovelShellConfig.js`.

## 3. Request And Runtime Flow
1. CloudFront serves the built frontend and a generated `config.json`.
2. The frontend resolves:
   - `apiBaseUrl`
   - `cognito.domain`
   - `cognito.clientId`
   - `cognito.userPoolId`
   - `cognito.region`
3. Design overlays send the user through Cognito Hosted UI using PKCE.
4. API Gateway invokes the Lambda adapter in `backend/lambda.js`.
5. Express route handlers execute domain logic and call external providers.
6. Metadata is stored in DynamoDB and user media is stored in S3.

Important distinction:
- `codex/dev` frontend uses placeholder session auth for baseline route coverage.
- Design overlays are the real auth UX.

## 4. Deployment Modes

### 4.1 Full Stack
- Stack file: `cdk/lib/static-web-aws-ai-stack.ts`
- Entry point: `cdk/bin/static-web-aws-ai-stack.ts`
- Resources created:
  - S3 website bucket
  - CloudFront distribution
  - API Gateway
  - Lambda
  - Cognito user pool + client + hosted domain
  - DynamoDB media table

### 4.2 UI-Only Overlay
- Stack file: `cdk/lib/ui-stack.ts`
- Activated by `idea:deploy -- --backend-stage=<stage>`
- Reuses:
  - backend API endpoint
  - backend Cognito user pool
  - backend Cognito domain
- Creates:
  - website bucket
  - CloudFront distribution
  - a design-specific Cognito app client

The CDK app chooses between the two modes using the `stackMode` context in `cdk/bin/static-web-aws-ai-stack.ts`.

## 5. Backend Composition

### 5.1 Dependency Wiring
- Composition root: `backend/lib/build-deps.js`
- This is where provider clients, stores, helpers, and middleware are assembled.
- New shared dependencies should be wired here first, then passed into route modules.

### 5.2 Route Registration
- Route registration hub: `backend/routes/index.js`
- All route modules now use the **Express Router** pattern — each module exports a function that returns a `Router`, which `index.js` mounts via `app.use()`.
- Registered route modules: 25 (after subdirectory split)
- Total endpoints: 73+

#### Dependency flow
```
backend/index.js
  └── build-deps.js          (composition root — assembles all deps)
       └── routes/index.js   (registerRoutes — mounts all Routers)
            ├── core-prompt.js
            ├── bedrock-routes.js  /  bedrock-image-video-route.js
            ├── replicate-image-routes.js  /  replicate-image-status-select-routes.js
            ├── replicate-video-routes.js
            ├── civitai-image-routes.js
            ├── gradio-routes.js
            ├── story-message-route.js
            ├── character-routes.js
            ├── companion-route.js
            ├── operations-routes.js
            ├── media/              (user-media, user-video, shared-media)
            ├── story/              (seed, session, session-item, illustration, animation, music, music-library, music-selection)
            └── lora/               (catalog, profile)
```

| Route File | Domain | Mount Prefix |
|------------|--------|--------------|
| `core-prompt.js` | health, hello, prompt helper | `/` |
| `media/user-media-routes.js` | user image list/upload/share/delete | `/` |
| `media/user-video-routes.js` | user video list/stream/share/delete | `/` |
| `media/shared-media-routes.js` | public shared images and videos | `/` |
| `bedrock-routes.js` | Bedrock prompt helper | `/` |
| `bedrock-image-video-route.js` | Nova Reel image-to-video | `/` |
| `replicate-image-routes.js` | Replicate image generation | `/` |
| `replicate-image-status-select-routes.js` | Replicate image polling + selection | `/` |
| `replicate-video-routes.js` | Replicate video generation + polling | `/` |
| `civitai-image-routes.js` | CivitAI generation + polling | `/` |
| `gradio-routes.js` | Gradio image generation | `/` |
| `story/seed-routes.js` | story presets and characters | `/story` |
| `story/session-routes.js` | session CRUD | `/story` |
| `story/session-item-routes.js` | per-session item ops | `/story` |
| `story-message-route.js` | story messaging | `/` |
| `story/illustration-routes.js` | scene illustrations | `/story` |
| `story/animation-routes.js` | scene animation | `/story` |
| `story/music-routes.js` | scene music generation | `/story` |
| `story/music-library-routes.js` | music library CRUD | `/story` |
| `story/music-selection-routes.js` | assign library track to scene | `/story` |
| `operations-routes.js` | director ops, masonry, jobs | `/` |
| `lora/catalog-routes.js` | LoRA catalog | `/` |
| `lora/profile-routes.js` | LoRA profiles | `/` |
| `character-routes.js` | character CRUD | `/` |
| `companion-route.js` | companion AI chat + memory | `/` |

### 5.3 Design-Sakura Frontend (Active Overlay)
The design-sakura variant is the most feature-complete overlay:
- Live2D companion (Hiyori) rendered via `pixi-live2d-display@0.4.0` + `pixi.js@6`
- Bottom HUD navigation (Realm / Atelier / Chronicle / Sanctum)
- 10 themes (sakura, moonrise, bamboo, ember, void, glacier, dusk, aurora, crimson, storm) with dark/light brightness variants
- Companion memory via DynamoDB, proactive companion via AI-generated messages

See [`frontend/ARCHITECTURE.md`](../wt/design-sakura/code/frontend/ARCHITECTURE.md) in the design-sakura worktree for component and CSS design system details.

### 5.4 Critical Backend Contracts
- Auth middleware: `backend/lib/auth.js`
- Storage keys: `backend/lib/keys.js`
- Story seed data and prompt-helper options: `backend/config/story-seed-data.js`
- Model/provider definitions: `backend/config/models.js`
- Companion memory: `backend/lib/companion-memory.js`

## 6. Data And Storage Model

### 6.1 DynamoDB
- Table key shape:
  - partition key: `pk`
  - sort key: `sk`
- User partition root: `USER#<sub>`
- Story preset namespace: `PRESET#STORY`
- Story character namespace: `PRESET#CHARACTER`
- Prompt helper namespace: `PRESET#PROMPT_HELPER`

### 6.2 S3
- User-owned media prefix: `users/<sub>/`
- Authorization helpers enforce that a user can only operate on keys under their own prefix.

## 7. Frontend Comparison

| Concern | `codex/dev` | `design-sakura` | `design-fusion` | `design-pixnovel` |
|---------|-------------|-----------------|-----------------|-------------------|
| Auth | placeholder session tokens | real Cognito via ConfigContext + AuthContext | real Cognito via ConfigContext + AuthContext | real Cognito via App runtime config + AuthContext |
| Runtime config | `runtime-config.js` only | `ConfigContext` loads `/config.json` | `ConfigContext` loads `/config.json` | App loads `/config.json` and merges env fallbacks |
| Music state | none | `MusicContext` + `SakuraMusicBar` | `MusicContext` + `SolarisMusicDock` | `GlobalNowPlayingDock` managed at App level |
| Navigation | simple placeholder links | bottom HUD (Realm / Atelier / Chronicle / Sanctum) | grouped Solaris nav + legacy redirects | pane map from `PIXNOVEL_PANE_META` |
| CSS system | minimal neutral placeholder | `skr-` prefix system with 10 themes + dark/light variants | monolithic Solaris CSS in `frontend/src/index.css` | theme CSS in `frontend/src/themes/pixnovel.css` plus supporting styles |
| Companion | none | Live2D Hiyori + chat panel + memory | none | none |

## 8. Design Overlay Invariants

### 8.1 Design-Fusion
- Preserve `sol-` CSS namespace.
- Preserve route remaps:
  - `/whisk -> /forge`
  - `/videos -> /forge?tab=videos`
  - `/story -> /storyboard`
  - `/shared -> /showcase`
  - `/lora -> /director/lora`
  - `/music-library -> /director/sounds`
- Read `frontend/REQUIREMENTS.md` in that worktree before editing.

### 8.2 Design-Pixnovel
- Preserve pane metadata in `frontend/src/config/pixnovelShellConfig.js`.
- Preserve quick-generate flow in `frontend/src/App.js`.
- Preserve the “only masonry scroll animates” motion policy.
- Read `frontend/REQUIREMENTS.md` in that worktree before editing.

## 9. Idea Metadata Model
- `IDEAS.md` is the top-level registry.
- `IMPROVEMENTS.md` tracks cross-idea rollouts.
- Each `ideas/<idea-id>/` folder should contain:
  - `README.md`
  - `DECISIONS.md`
  - `RUNBOOK.md`
  - `STATUS.md`
  - `IMPROVEMENTS.md`
  - optional `cdk-outputs.json`

## 10. Validation And Completion Rules
- Backend touched:
`node -e "require('./backend/index')"`
- Frontend touched:
`npm --prefix frontend run build`
- CDK touched:
`npm --prefix cdk run build`
- Backend/CDK changes are only complete after deploy + sanity + UI smoke.

## 11. Current Risks
- Backend test coverage is still minimal (~5% of source files).
- Route contracts are consumed by multiple overlay branches, so silent drift is expensive.
- `story/illustration-routes.js` is still very large (2,494 lines) and needs decomposition.
- `design-fusion` and `design-pixnovel` config.json may still point to their own old APIs rather than `dev` — migrate on next deploy.
- Some idea docs lagged behind live deployments until the 2026-03-19 documentation refresh.
