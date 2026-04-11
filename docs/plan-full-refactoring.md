# Whisk Studio — Full Refactoring Plan

> **Created:** 2026-04-05
> **Scope:** Backend (`codex/dev`) + Frontend (`codex/design-sakura/code`) + Documentation + Testing
> **Principles:** KISS / DRY / SOLID, 500-line file cap, meaningful test coverage, LLM+human documentation
> **Decisions locked:** Express Router migration YES, build-deps stays flat, all 5 phases

---

## Context

The codebase has grown organically to 16,663 backend lines (43 source files) and a large frontend with zero tests. Seven backend files and 11+ frontend files exceed 500 lines. Test coverage is ~5% backend and 0% frontend. No ESLint/Prettier configuration exists. Documentation covers architecture but lacks API specs, testing guides, and frontend architecture docs.

**Key constraints:**
- `codex/dev` = backend + shared infra (the only backend, 73 endpoints)
- `codex/design-sakura/code` = frontend only (scope guard: may only touch `frontend/**`)
- Design variants point at dev's API/Cognito
- Backend tests use Node built-in `node:test` (no Jest)
- Frontend uses react-scripts (includes Jest internally)
- The project is live — changes must be incremental and safe

---

## Current Oversized Files

### Backend (must split — all over 500 lines)
| File | Lines | Endpoints/Functions |
|------|-------|---------------------|
| `backend/routes/story-illustration-route.js` | 2,494 | 11 endpoints: illustration, animation, music, library |
| `backend/routes/operations-routes.js` | 1,223 | 12 endpoints: director ops, config, masonry, jobs |
| `backend/routes/media-routes.js` | 872 | 13 endpoints: image/video CRUD |
| `backend/routes/story-session-routes.js` | 749 | 8 endpoints: presets, characters, session CRUD |
| `backend/lib/scene-context.js` | 706 | 3 AI factory functions |
| `backend/routes/lora-routes.js` | 704 | 7 endpoints: catalog + profiles |

### Frontend (must split — all over 500 lines)
| File | Lines | Concern |
|------|-------|---------|
| `frontend/src/index.css` | 1,660 | Entire design system + 10 themes |
| `frontend/src/pages/whisk/hooks/useImageStudio.js` | 1,339 | Image gen across 4 providers |
| `frontend/src/pages/story/useStoryStudio.js` | 1,244 | Story session orchestration |
| `frontend/src/pages/Whisk.js` | 1,035 | Page with inline sub-components |
| `frontend/src/pages/Director.js` | 817 | Page with inline sub-components |
| `frontend/src/pages/Story.js` | 692 | Page with inline sub-components |
| `frontend/src/pages/LoraManagement.js` | 685 | Single-file page |
| `frontend/src/pages/story/StoryIllustrationsPanel.js` | 656 | Panel with 2 inline components |
| `frontend/src/pages/story/story-scenes.css` | 623 | Scene + illustration styles |

---

## Phase 0 — Tooling Foundation (Zero Behavior Changes)

### 0A. ESLint + Prettier for Backend
- Create `backend/.eslintrc.json` (extend `eslint:recommended`, env node, ecmaVersion 2022)
- Create `backend/.prettierrc.json` (printWidth 100, trailingComma "es5")
- Update `backend/package.json`: add devDeps (`eslint`, `prettier`, `eslint-config-prettier`), update `lint` script
- **Verify:** `npm --prefix backend run lint` exits 0; `node -e "require('./backend/index')"` passes

### 0B. ESLint + Prettier for Frontend
- Update `frontend/.eslintrc.json` to add `plugin:react-hooks/recommended`
- Create `frontend/.prettierrc.json` matching backend config
- Update `frontend/package.json`: add `prettier` devDep, add `lint`/`format` scripts
- **Verify:** `npm --prefix frontend run lint` exits 0; `npm --prefix frontend run build` passes

### 0C. File-Length Enforcement Script
- Create `scripts/check-file-length.sh` — fail if any `.js`/`.css` file in `backend/` or `frontend/src/` exceeds 500 lines
- Add `check:length` script to `backend/package.json`
- **Verify:** Script fails now (expected), passes after Phases 1+2

---

## Phase 1 — Backend Route Decomposition (codex/dev)

**Architectural decision:** Migrate to Express Router. Each module returns a Router instead of mutating the shared `app`. `routes/index.js` becomes the mount point. Migration is incremental (one module at a time).

```javascript
// Before: module.exports = (app, deps) => { app.get("/foo", handler); }
// After:  module.exports = (deps) => { const router = Router(); router.get("/", handler); return router; }
// Mount:  app.use("/foo", registerFoo(deps));
```

### 1A. Split `story-illustration-route.js` (2,494 → 6 files)

| New File | ~Lines | Responsibility |
|----------|--------|----------------|
| `routes/story/illustration-helpers.js` | 250 | Constants, env parsing, shared utils (parseIntegerEnv, resolveStoryIllustrationSize, isOpeningSceneItem, signSceneVideoUrl, signSceneMusicUrl, buildStorySceneVideoKey, buildStorySceneMusicKey, buildDataUrl) |
| `routes/story/music-helpers.js` | 300 | Music constants, STORY_MUSIC_DEFAULT_INPUT, parseMusicTags, normalizeTrackForSearch, mapMusicTrackResponse, buildLoopFriendlyMusicPrompt, buildSceneMusicPayload, inferAudioExtension, resolveAudioContentType, recommendation engine (tokenizeSearchText, countTokenOverlap, buildSceneRecommendationProfile, rankRecommendedTracks, clampRecommendationScore) |
| `routes/story/illustration-routes.js` | 480 | POST /story/sessions/:id/illustrations |
| `routes/story/animation-routes.js` | 280 | POST + GET /story/sessions/:id/scenes/:sceneId/animation |
| `routes/story/music-routes.js` | 480 | POST + GET scene music, POST music/favorite, music/recommend, music/select |
| `routes/story/music-library-routes.js` | 350 | GET /story/music-library, POST upload-url, POST upload |

**Mount in `routes/index.js`:**
```javascript
app.use("/story", registerStoryIllustrationRoutes(deps));
app.use("/story", registerStoryAnimationRoutes(deps));
app.use("/story", registerStoryMusicRoutes(deps));
app.use("/story", registerStoryMusicLibraryRoutes(deps));
```

**Verify:** All 11 original endpoints respond identically; `node -e "require('./backend/index')"` passes

### 1B. Split `operations-routes.js` (1,223 → 3 files)

| New File | ~Lines | Responsibility |
|----------|--------|----------------|
| `routes/ops/ops-helpers.js` | 350 | Constants, mapJobItem, buildFallbackQueue, normalizeStatus, inferProviderFromKey, formatEtaLabel, sortByNewest, resolveImageModelLabel, resolveVideoModelLabel, normalizeAppTheme, isMasonryImageKey, `buildDirectorOptions` |
| `routes/ops/director-routes.js` | 350 | GET/POST director config, GET/POST app config, GET director overview |
| `routes/ops/dashboard-routes.js` | 250 | GET dashboard, masonry CRUD, job prioritize, story session pin, sound normalize |

**Critical:** `buildDirectorOptions` export must remain accessible (used by `backend/test/lora-support.test.js` at line 308: `registerOperationsRoutes.buildDirectorOptions`)

### 1C. Split `media-routes.js` (872 → 2 files)

| New File | ~Lines | Responsibility |
|----------|--------|----------------|
| `routes/media/user-media-routes.js` | 450 | POST image-upload-url, POST video-ready, POST images/delete, GET images, POST videos/delete, POST videos/share, GET videos, GET video-url, POST images/share |
| `routes/media/shared-media-routes.js` | 350 | GET shared/images, GET shared/images/favorites, POST shared/images/favorites, GET shared/videos |

### 1D. Split `story-session-routes.js` (749 → 2 files)

| New File | ~Lines | Responsibility |
|----------|--------|----------------|
| `routes/story/seed-routes.js` | 100 | GET /story/presets, GET /story/characters (public) |
| `routes/story/session-routes.js` | 480 | GET/POST/DELETE sessions, GET/DELETE sessions/:id, PATCH sessions/:id/lora |

**Depends on:** 1A (creates the `routes/story/` subdirectory)

### 1E. Split `lora-routes.js` (704 → 2 files)

| New File | ~Lines | Responsibility |
|----------|--------|----------------|
| `routes/lora/catalog-routes.js` | 200 | POST catalog/sync/civitai, GET catalog |
| `routes/lora/profile-routes.js` | 350 | GET/POST/PUT/DELETE profiles |

**Critical:** Exported helpers must remain importable for `lora-support.test.js`:
`extractCivitaiStatusCodeFromError`, `collectCatalogBaseModels`, `withBaseModelHint`, `normalizeModelIdList`, `extractModelIdFromCivitaiUrl`, `resolveRequestedModelIds`

### 1F. Split `scene-context.js` (706 → 4 files + barrel)

| New File | ~Lines | Responsibility |
|----------|--------|----------------|
| `lib/scene-context/shared.js` | 180 | parsePromptPairResponse, character priority constants, CHARACTER_NAME_STOPWORDS |
| `lib/scene-context/scene-context.js` | 170 | createAiCraftSceneContext |
| `lib/scene-context/illustration-prompts.js` | 170 | createAiCraftIllustrationPrompts |
| `lib/scene-context/music-direction.js` | 200 | createAiCraftMusicDirection |
| `lib/scene-context.js` (barrel) | 20 | Re-exports all three factories (preserves existing import paths) |

Follows the proven `lib/story-state.js` barrel pattern already in the codebase (51 lines, re-exports from 5 sub-modules).

### 1G. `build-deps.js` — NO CHANGE (Decision: Keep Flat)

The flat deps bag stays as-is. Restructuring risks breaking all 16 route modules simultaneously for marginal gain. KISS wins.

---

## Phase 2 — Frontend Decomposition (codex/design-sakura/code)

> **Scope guard:** Only `frontend/**` may be touched on this branch.

### 2A. Split `useImageStudio.js` (1,339 → 6 files)

| New File (under `pages/whisk/hooks/`) | ~Lines | Responsibility |
|----------------------------------------|--------|----------------|
| `useImageStudio.js` (slimmed) | 300 | Orchestration — composes sub-hooks, exposes unified API |
| `useImageModels.js` | 200 | Model options resolution (replicate, civitai, bedrock, gradio), size/scheduler derivation |
| `usePromptBuilder.js` | 250 | Prompt helper selections, character preset loading, AI prompt generation |
| `useCivitaiLora.js` | 200 | CivitAI runtime LoRA management (add/remove/strength/persist) |
| `useImageGeneration.js` | 300 | Generation dispatch + polling for 4 providers, status management |
| `image-studio-constants.js` | 80 | Constants (DEFAULT_IMAGE_SOURCE, model fallbacks, etc.) |

**Pattern note:** Existing `useVideoGeneration.js` (352 lines), `useWhiskImages.js`, `useWhiskVideos.js` already demonstrate smaller focused hooks composed by a parent. Follow same pattern.

### 2B. Split `Whisk.js` (1,035 → 5 files)

| New File | ~Lines | Responsibility |
|----------|--------|----------------|
| `pages/Whisk.js` (slimmed) | 300 | Page shell, modal routing, composition of panels |
| `pages/whisk/PromptHelperPanel.js` | 120 | Extracted from inline function (lines ~47-153) |
| `pages/whisk/CivitaiLoraPanel.js` | 130 | Extracted from inline function (lines ~155-273) |
| `pages/whisk/useWhiskInit.js` | 200 | LoRA data loading, director config fetching, capability resolution |
| `pages/whisk/whisk-utils.js` | 50 | toLoraSupportMap, buildSupportedModels helpers |

**Depends on:** 2A (useImageStudio already split)

### 2C. Split `useStoryStudio.js` (1,244 → 5 files)

| New File (under `pages/story/`) | ~Lines | Responsibility |
|---------------------------------|--------|----------------|
| `useStoryStudio.js` (slimmed) | 250 | Orchestration: session state, compose sub-hooks |
| `useStorySession.js` | 300 | Session CRUD (create, load, delete, refresh), message sending |
| `useStoryIllustration.js` | 250 | triggerIllustration, handleForceIllustration, scene generation status |
| `useStoryMedia.js` | 300 | Animation triggering/polling, music triggering/polling |
| `useStoryMusicLibrary.js` | 200 | Music library refresh, save, recommendation, library track selection |

### 2D. Split `Story.js` (692) and `Director.js` (817)

**Story.js → 3 files:**
- `pages/Story.js` (~300) — page shell
- `pages/story/StorySessionList.js` (~150) — session list sidebar
- `pages/story/StoryComposer.js` (~200) — message input + controls

**Director.js → 5 files:**
- `pages/Director.js` (~250) — page shell
- `pages/director/StorySessions.js` (~80) — already inline function at line ~202
- `pages/director/JobQueue.js` (~80) — already inline function at line ~255
- `pages/director/MasonrySection.js` (~120) — already inline function at line ~312
- `pages/director/CharactersSection.js` (~200) — already inline function at line ~433

**Depends on:** 2C for Story.js

### 2E. Split `LoraManagement.js` (685 → 3 files)
- `pages/LoraManagement.js` (~250) — page shell + state
- `pages/lora/LoraCatalogView.js` (~200)
- `pages/lora/LoraProfileEditor.js` (~200)

### 2F. Split `StoryIllustrationsPanel.js` (656 → 3 files)
- `pages/story/StoryIllustrationsPanel.js` (~250) — exported panel
- `pages/story/StoryMusicTrackInline.js` (~200) — extracted inline component (line ~53)
- `pages/story/ReaderIllustrations.js` (~200) — extracted inline component (line ~389)

### 2G. Split `index.css` (1,660 → 11 files)

| New File (under `frontend/src/styles/`) | ~Lines | Content |
|------------------------------------------|--------|---------|
| `tokens.css` | 80 | `:root` custom properties (--skr-bg, --skr-accent, etc.) |
| `reset.css` | 20 | CSS reset |
| `layout.css` | 150 | Shell, top bar, main content, bottom HUD, page header |
| `components.css` | 300 | Cards, buttons, form controls, tabs, chips, grids, masonry, modals, lightbox |
| `login.css` | 80 | Login page, loading screen, auth callback |
| `animations.css` | 50 | Companion keyframes (skr-blink, skr-thinking-dot, skr-bubble-in, etc.) |
| `theme-switcher.css` | 100 | Theme switcher component styles |
| `themes/dark-themes.css` | 300 | 9 dark theme `[data-theme="X"]` blocks + backdrop overrides |
| `themes/light-themes.css` | 250 | All light mode `[data-brightness="light"]` overrides |
| `responsive.css` | 200 | Media queries |
| `index.css` (barrel) | 20 | `@import "./styles/tokens.css"` etc. — order matters! |

**Tailwind decision:** Keep the custom `skr-` CSS system (coherent and well-namespaced). Use Tailwind only for utility classes in new components. Do NOT force a migration.

**Risk:** CSS cascade order matters. The `@import` chain must preserve the same ordering.

### 2H. Split `story-scenes.css` (623 → 2 files)
- `pages/story/story-scenes.css` (~300) — scene card, scene grid
- `pages/story/story-illustrations.css` (~300) — illustration-specific styles

**Depends on:** 2G (CSS organization pattern established)

---

## Phase 3 — Testing Strategy

### 3A. Backend Test Infrastructure
- Create `backend/test/helpers/mock-deps.js` — factory producing a mock `deps` object with all required properties stubbed (DRY foundation for all route tests)
- Create `backend/test/helpers/mock-app.js` — creates a real Express app with `express.json()` and wires a single route module for integration-style testing
- Keep using `node:test` + `node:assert/strict` (established convention, no Jest on backend)
- Optional: add `supertest` as devDependency for ergonomic HTTP assertions
- Test file naming: `backend/test/<module-name>.test.js`

### 3B. Backend Route Unit Tests (Priority Order)

| Test File | Target | ~Tests | Priority |
|-----------|--------|--------|----------|
| `test/story-illustration.test.js` | illustration helpers + POST endpoint | 15 | P0 |
| `test/story-session.test.js` | session CRUD + message | 10 | P0 |
| `test/media-routes.test.js` | image/video CRUD | 10 | P1 |
| `test/operations.test.js` | ops helpers + dashboard | 8 | P1 |
| `test/companion.test.js` | companion chat + memory | 6 | P1 |
| `test/scene-context.test.js` | AI prompt builders (pure functions) | 8 | P2 |
| `test/story-prompt.test.js` | prompt normalization (pure functions) | 6 | P2 |
| `test/keys.test.js` | key builders (pure functions) | 5 | P2 |

**Test strategy per file:**
1. **Pure function tests:** Extract helpers, test inputs → outputs. Highest ROI.
2. **Handler tests:** Mock deps, call handler with mock req/res, assert status + body shape.
3. **Error path tests:** Verify 400/401/404/500 responses for invalid inputs.

**Coverage target:** ~40% line coverage (up from ~5%)

### 3C. Frontend Test Infrastructure
- Add `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` as devDeps
- Create `frontend/src/setupTests.js` — import `@testing-library/jest-dom`
- Use `renderHook` from `@testing-library/react` for hook tests
- Mock API calls with `jest.mock('../services/apiClient')`

### 3D. Frontend Tests (Priority Order)

| Test File | Target | ~Tests | Priority |
|-----------|--------|--------|----------|
| `hooks/useImageStudio.test.js` | image generation hook | 10 | P0 |
| `hooks/useStoryStudio.test.js` | story orchestration hook | 8 | P0 |
| `services/apiClient.test.js` | fetchJson/postJson | 6 | P1 |
| `pages/Whisk.test.js` | Whisk page render + interaction | 5 | P1 |
| `pages/Story.test.js` | Story page render | 5 | P1 |
| `components/CompanionChat.test.js` | chat rendering | 4 | P2 |
| `contexts/AuthContext.test.js` | auth state management | 4 | P2 |

**Coverage target:** ~30%

### 3E. E2E Sanity Tests (Playwright)
Extend existing `cdk/scripts/ui-smoke.mjs` into a minimal e2e suite:
1. Login flow completes (Cognito hosted UI → callback → authenticated state)
2. Image generation submits and returns a polling result
3. Story session lifecycle (create → send message → see response → delete)
4. Director dashboard loads with data
5. Music library lists tracks

Create `e2e/sanity.spec.js` + `e2e/playwright.config.js`

**Verify:** `npx playwright test` passes against a deployed stack

---

## Phase 4 — DRY / Code Quality Cleanup

### 4A. Extract `lib/route-guards.js`
Shared validation replacing repeated boilerplate in every route handler:
```javascript
const requireEnv = (res, name, value) => { if (!value) { res.status(500).json({ message: `${name} is not set` }); return false; } return true; };
const requireAuth = (res, userId) => { if (!userId) { res.status(401).json({ message: "Unauthorized" }); return false; } return true; };
```
**Files affected:** All route files that repeat these patterns.

### 4B. Consolidate S3 Signing
Add `signS3Url(s3Client, getSignedUrl, bucket, key)` to `lib/s3-utils.js` — replaces `signSceneVideoUrl`, `signSceneMusicUrl`, `signMusicTrackUrl` and similar near-identical functions.

### 4C. Extract `lib/error-handler.js`
```javascript
const handleRouteError = (res, label, error) => {
  console.error(`${label} error:`, { message: error?.message || String(error) });
  res.status(500).json({ message: `Failed to ${label}`, error: error?.message || String(error) });
};
```
Replaces repeated catch block pattern across all routes.

### 4D. Consolidate Frontend Constants
Move `FALLBACK_REPLICATE_IMAGE_MODELS` and `FALLBACK_CIVITAI_IMAGE_MODELS` from inline definitions to shared `frontend/src/constants/image-models.js`.

---

## Phase 5 — Documentation (LLM + Human Optimized)

### Documentation Philosophy
"Top of the art" for a project consumed by both humans and LLM agents:
1. **LLM-friendly:** Clear headings, code fences, explicit file paths, frozen contract shapes. Agents parse markdown headings as navigation.
2. **Human-friendly:** Decision rationale, diagrams, quickstart, onboarding flow.
3. **Machine-verifiable:** Links from docs to actual file paths that exist.
4. **Living:** Docs updated as part of the same PR that changes behavior.

### 5A. Architecture Documentation Refresh
Update `docs/architecture.md`:
- Updated route file table (new subdirectory structure)
- Dependency flow diagram (build-deps → route modules → lib modules)
- Data flow for key operations (illustration generation, story session lifecycle)
- Mermaid diagrams for request lifecycle, component hierarchy, module dependency graph

### 5B. API Specification (`docs/api-spec.md`)
For each of 73 endpoints:
- Method + path
- Auth level (public / user / admin)
- Request body shape (TypeScript-style interface notation)
- Response body shape
- Error responses
- Example curl

Replaces the current `docs/api-access.md` endpoint inventory with a full contract specification.

### 5C. Frontend Architecture (`frontend/ARCHITECTURE.md`)
- Component tree with responsibilities
- Hook dependency graph
- Context providers and what state they manage
- CSS design system reference (`skr-` prefix conventions, token names)
- Theme system documentation (10 themes + light mode)

### 5D. Testing Guide (`docs/testing.md`)
- How to run backend tests (`npm --prefix backend test`)
- How to run frontend tests (`npm --prefix frontend test -- --watchAll=false`)
- How to run e2e tests (`npx playwright test`)
- How to write a new backend test (mock-deps pattern)
- How to write a new frontend test (RTL pattern)
- Coverage targets and how to check

### 5E. Contributing Guide (`CONTRIBUTING.md`)
- Branch scope rules (extracted from AGENTS.md into human-friendly format)
- Code style (ESLint + Prettier)
- File length limit enforcement (500-line cap)
- PR checklist
- Quality gates

Update `AGENTS.md` to reference `CONTRIBUTING.md` for shared rules.
Update `README.md` to add quickstart, link to architecture/contributing/API spec.

### 5F. ADRs (Architecture Decision Records)
- `docs/adr/001-express-router-migration.md`
- `docs/adr/002-node-test-over-jest.md`
- `docs/adr/003-css-design-system-over-tailwind.md`
- `docs/adr/004-flat-deps-vs-namespaced.md`
- `docs/adr/005-file-length-limit.md`

Each ADR follows: Title, Status, Context, Decision, Consequences.

---

## Phase Dependency Graph

```
Phase 0 (Tooling) ← no deps, ship first as a single PR
├── 0A: ESLint backend
├── 0B: ESLint frontend
└── 0C: File length check

Phase 1 (Backend splits) ← depends on 0A
├── 1A: story-illustration-route split (creates routes/story/ dir)
├── 1B: operations-routes split (independent)
├── 1C: media-routes split (independent)
├── 1D: story-session-routes split (depends on 1A for story/ dir)
├── 1E: lora-routes split (independent)
├── 1F: scene-context split (independent)
└── 1G: NO CHANGE — flat deps kept

Phase 2 (Frontend splits) ← depends on 0B, runs on codex/design-sakura/code
├── 2A → 2B (Whisk hooks before Whisk page)
├── 2C → 2D (Story hooks before Story/Director page)
├── 2E: LoraManagement split (independent)
├── 2F: StoryIllustrationsPanel split (independent)
└── 2G → 2H (CSS barrel before sub-CSS)

Phase 3 (Testing) ← depends on Phase 1 + Phase 2
├── 3A → 3B (backend test infra → backend route tests)
├── 3C → 3D (frontend test infra → frontend tests)
└── 3E: E2E sanity (after 1+2 complete, needs deployed stack)

Phase 4 (DRY cleanup) ← depends on Phase 1
├── 4A: route-guards.js
├── 4B: S3 signing consolidation
├── 4C: error-handler.js
└── 4D: frontend constants

Phase 5 (Documentation) ← can start in parallel with Phase 3+4
├── 5A: Architecture refresh (depends on 1)
├── 5B: API specification
├── 5C: Frontend architecture doc (depends on 2)
├── 5D: Testing guide (depends on 3)
├── 5E: Contributing + onboarding
└── 5F: ADRs
```

---

## Verification Strategy

| Layer | Gate Command |
|-------|-------------|
| Backend import | `node -e "require('./backend/index')"` |
| Frontend build | `npm --prefix frontend run build` |
| CDK build | `npm --prefix cdk run build` |
| Backend tests | `npm --prefix backend test` |
| Frontend tests | `npm --prefix frontend test -- --watchAll=false` |
| Post-deploy | `npm --prefix cdk run idea:sanity -- --stage=dev` |
| UI smoke | `npm --prefix cdk run idea:ui-smoke -- --stage=dev` |
| File length | `scripts/check-file-length.sh` |
| Lint | `npm --prefix backend run lint && npm --prefix frontend run lint` |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| CSS cascade order changes after split | Themes break visually | Preserve `@import` order in barrel; test all 10 themes in browser |
| Route split breaks an endpoint | API contract violation | Compare curl outputs before/after for each endpoint |
| `lora-support.test.js` breaks after split | Test regression | Update imports in the same PR as the split |
| build-deps destructuring mismatch | Runtime crash | Run `node -e "require('./backend/index')"` after every split |
| Design branch rebase conflicts | Merge pain | Backend splits don't touch `frontend/`; coordinate timing |
| Test mocks diverge from real deps | Tests pass but code fails | Keep mock-deps factory aligned with build-deps exports |

---

## Execution Recommendations

1. **Phase 0** ships as a single PR — zero risk, no behavior changes.
2. **Phase 1** should be 6 independent PRs (one per sub-phase). Each PR splits one route file, updates `routes/index.js`, and runs the quality gate.
3. **Phase 2** runs on `codex/design-sakura/code` branch. Each sub-phase is an independent PR. CSS split (2G) is riskiest — test all themes after.
4. **Phase 3A and 3C** (test infrastructure) ship early to unblock parallel test writing.
5. **Phase 5** can start immediately — documentation doesn't block code changes.
6. **Phase 1 and 2 can run in parallel** since backend splits don't touch `frontend/` and frontend splits don't touch `backend/`.

---

## Critical Files Reference

| File | Role | Notes |
|------|------|-------|
| `backend/routes/index.js` | Route registration hub | Must be updated for every Phase 1 split |
| `backend/lib/build-deps.js` | DI composition root | Flat export shape must be preserved |
| `backend/test/lora-support.test.js` | Existing test with cross-module imports | Must update imports after 1B and 1E splits |
| `backend/lib/story-state.js` | Barrel re-export precedent | Phase 1F should follow this exact pattern |
| `frontend/src/App.js` | Provider tree + routing | CSS imports change after 2G |
| `frontend/src/index.css` | Design system barrel | Becomes `@import` chain after 2G |
