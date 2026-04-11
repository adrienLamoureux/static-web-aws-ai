# Branch Consolidation Plan: Multi-Branch to Single `main`

> Created: 2026-04-10 | Status: Ready for execution

## Context

The project currently uses 3 branches that diverged from the same `main` tip (`50f84fb`):
- **`codex/dev`** (80 commits ahead): Backend source of truth — Express routes, CDK, docs, tests
- **`codex/design-sakura/code`** (43 commits ahead): Frontend source of truth — Sakura UI, Live2D, CSS system, hooks, tests
- **`main`**: Outdated, no commits since fork

This adds cognitive overhead, requires worktree management, and makes cross-stack changes error-prone. The goal is to unify backend + frontend on `main` for simpler development and deployment.

**End state**: `main` has everything. One `npm --prefix cdk run idea:deploy -- --stage=dev` deploys backend + frontend. Live2D assets continue to sync separately (already handled by `idea-env.js`). No more worktrees needed.

**Worktrees**:
- `/Users/adrienlamoureux/Documents/code/static-web-aws-ai` → `codex/dev`
- `/Users/adrienlamoureux/Documents/code/wt/design-sakura/code` → `codex/design-sakura/code`

---

## Phase 0: Pre-Flight Safety

1. Push all branches to remote:
   ```sh
   git push origin codex/dev
   cd /Users/adrienlamoureux/Documents/code/wt/design-sakura/code && git push origin codex/design-sakura/code
   cd /Users/adrienlamoureux/Documents/code/static-web-aws-ai
   ```

2. Create safety tags:
   ```sh
   git tag archive/codex-dev-pre-consolidation codex/dev
   git tag archive/design-sakura-pre-consolidation codex/design-sakura/code
   git tag archive/main-pre-consolidation main
   git push origin --tags
   ```

3. Verify merge base:
   ```sh
   git merge-base codex/dev codex/design-sakura/code
   # Must output: 50f84fb (or the full SHA)
   ```

4. Save current deployed state for rollback reference:
   ```sh
   cat ideas/dev/cdk-outputs.json
   ```

---

## Phase 1: Merge `codex/dev` into `main`

Conflict-free — `main` is the exact fork point, so this is a clean fast-forward.

```sh
git checkout main
git merge codex/dev --no-ff -m "merge: consolidate codex/dev backend into main"
```

Verify: `git diff codex/dev..main` should show nothing (trees identical).

---

## Phase 2: Merge `codex/design-sakura/code` into `main`

```sh
git merge codex/design-sakura/code --no-ff -m "merge: consolidate design-sakura frontend into main"
```

This will produce conflicts. Resolve them deterministically:

### Backend conflicts — take `main` (= codex/dev) version

```sh
# Route index (modified on both sides)
git checkout main -- backend/routes/index.js
```

For **modify/delete conflicts** (files codex/dev deleted, sakura still has old versions): accept the deletion. The codex/dev refactored backend is authoritative. These include old monolithic files like `backend/routes/story-illustration-route.js`, `backend/routes/story-session-routes.js`, `backend/routes/media-routes.js`, etc.

```sh
# For each modify/delete conflict where codex/dev deleted the file:
git rm <conflicted-backend-file>
```

### CDK conflicts — take `main` (= codex/dev) version

```sh
git checkout main -- \
  cdk/bin/static-web-aws-ai-stack.ts \
  cdk/lib/stage.ts \
  cdk/lib/static-web-aws-ai-stack.ts \
  cdk/lib/ui-stack.ts \
  cdk/package-lock.json \
  cdk/package.json \
  cdk/scripts/sanity-check.mjs \
  cdk/scripts/ui-smoke.mjs
```

### Frontend conflicts — take `codex/design-sakura/code` version

```sh
git checkout codex/design-sakura/code -- \
  frontend/.eslintrc.json \
  frontend/package.json \
  frontend/src/App.js \
  frontend/src/contexts/AuthContext.js \
  frontend/src/index.css \
  frontend/src/pages/AuthCallback.js \
  frontend/src/pages/Story.js \
  frontend/src/pages/StoryMusicLibrary.js \
  frontend/src/pages/Whisk.js \
  frontend/src/pages/story/StoryDirectorIllustrations.js \
  frontend/src/pages/story/StoryIllustrationsPanel.js \
  frontend/src/pages/story/story-scenes.css \
  frontend/src/pages/story/useStoryStudio.js \
  frontend/src/pages/whisk/hooks/useImageStudio.js \
  frontend/src/pages/whisk/hooks/useVideoGeneration.js \
  frontend/src/pages/whisk/hooks/useWhiskImages.js \
  frontend/src/pages/whisk/hooks/useWhiskVideos.js \
  frontend/src/services/apiClient.js \
  frontend/src/services/runtime-config.js \
  frontend/src/services/s3.js \
  frontend/src/services/story.js \
  frontend/src/utils/authTokens.js \
  frontend/src/utils/sessionCache.js
```

For **modify/delete conflicts** where codex/dev deleted frontend files but sakura rewrote them: take sakura's version (sakura is frontend source of truth).

```sh
# For each modify/delete conflict where sakura has the file:
git checkout codex/design-sakura/code -- <conflicted-frontend-file>
```

### Docs/ideas conflicts — take `main` (= codex/dev) version

```sh
git checkout main -- AGENTS.md IDEAS.md IMPROVEMENTS.md
git checkout main -- ideas/
```

### Special files (auto-merged from sakura, verify these):
- `frontend/ARCHITECTURE.md` — keep (216 lines, sakura-only)
- `frontend/THEMES.md` — keep (sakura-only)
- `frontend/public/live2dcubismcore.min.js` — keep (needed by Live2D)
- `frontend/public/index.html` — verify it includes `<script src="%PUBLIC_URL%/live2dcubismcore.min.js"></script>`
- `frontend/public/live2d/**` — all Live2D model assets, keep
- `frontend/public/config.json` — take sakura version (has real dev API values, useful for local dev; CDK overwrites it at deploy time anyway)

### Finalize merge

```sh
git add -A
git commit --no-edit
```

---

## Phase 3: Post-Merge Cleanup

### 3a. Remove sakura from `DESIGN_VARIANT_CLOUDFRONT_DOMAINS`

**File**: `cdk/lib/static-web-aws-ai-stack.ts` (around line 53)

Remove this line:
```ts
"d2lepwk3t4buta.cloudfront.net", // design-sakura
```

Sakura frontend now deploys through the full stack, not a separate UiOnly stack.

### 3b. Clean up stale files

```sh
# Remove deploy lock file from tracking
git rm --cached .cdk-idea-lock 2>/dev/null || true
echo ".cdk-idea-lock" >> .gitignore
```

Check for dead Tailwind config:
```sh
# If no @tailwind or @apply usage found, remove:
grep -r "@tailwind\|@apply" frontend/src/ || echo "No Tailwind usage — safe to remove"
# If safe: rm frontend/tailwind.config.js frontend/postcss.config.js
# And remove tailwindcss from frontend/package.json dependencies
```

### 3c. Regenerate lock files

```sh
npm --prefix frontend install
npm --prefix backend install
```

### 3d. Commit

```sh
git add -A
git commit -m "chore: post-consolidation cleanup — remove sakura variant domain, update gitignore"
```

---

## Phase 4: Documentation Updates

All docs below encode the multi-branch model and need updating to reflect single-branch reality.

### 4a. `AGENTS.md` — Major rewrite
- Remove "Active Worktrees and Branches" table
- Remove "Branch Scope Contract" section
- Simplify "Parallel Workflow Policy" (no worktree-based workflow)
- Update "Live Idea Stacks" table (sakura row -> deployed via full-stack from `main`)
- Keep UiOnlyStack references for fusion/pixnovel variants that still exist
- Remove "Read Order For Agents" reference to branch-local `frontend/REQUIREMENTS.md`

### 4b. `CONTRIBUTING.md` — Update
- Remove "Branch Scope Rules" table
- Remove design-branch-specific deploy instructions
- Update PR checklist (no branch scope checks)
- Update "Frontend style notes" header (apply to `main`, not "design-sakura")

### 4c. `docs/architecture.md` — Rewrite sections 2, 4, 7, 8, 11
- Section 2 (Branch Topology): `main` is the single dev branch
- Section 4 (Deployment Modes): `main` deploys full stack. UI-only still exists for other variants
- Section 7-8: Remove overlay branch comparisons
- Section 11 (Risks): Remove branch drift risk, note consolidation complete

### 4d. `docs/testing.md` — Update E2E URLs
- Replace hardcoded `d2lepwk3t4buta.cloudfront.net` with `d2l9b1xmucsb19.cloudfront.net` (the dev CloudFront, now the primary deployment)

### 4e. `scripts/check-design-pixnovel-scope.sh`
- Rename to `check-variant-scope.sh` and generalize (it already accepts params)
- Or retire if no further variant branches are planned

### 4f. `frontend/ARCHITECTURE.md`
- Remove "design overlay" references, describe as the primary frontend on `main`

### 4g. Create `docs/adr/006-branch-consolidation.md`
- **Status**: Accepted
- **Context**: Three-branch model (main, codex/dev, codex/design-*/code) added cognitive overhead, made cross-stack changes error-prone, required worktree management, and increased merge/rebase risk as branches diverged further
- **Decision**: Consolidate codex/dev (backend) and codex/design-sakura/code (frontend) into main. Preserve UiOnlyStack for future design variants but default to single-branch development
- **Consequences**: Simpler workflow, one branch to maintain, reduced drift risk. Scope enforcement shifts from branch-level to lint/length checks

### 4h. Commit

```sh
git add -A
git commit -m "docs: update all documentation for single-branch model (ADR-006)"
```

---

## Phase 5: Verification

Run all quality gates before deploying:

```sh
# Backend tests (expect: 178 tests, 175 pass, 3 pre-existing failures)
npm --prefix backend test

# Frontend tests (expect: 79 tests, all passing)
npm --prefix frontend run test:ci

# Lint
npm --prefix backend run lint
npm --prefix frontend run lint

# Frontend build
npm --prefix frontend run build

# File length check
bash scripts/check-file-length.sh

# CDK synth dry run
npm --prefix cdk run idea:synth -- --stage=dev
```

Verify key files exist:
```sh
# Backend routes (codex/dev)
ls backend/routes/index.js backend/routes/companion-route.js backend/routes/story/session-routes.js

# Sakura frontend pages
ls frontend/src/pages/HomePage.js frontend/src/pages/Forge.js frontend/src/pages/Director.js

# Live2D assets
ls frontend/public/live2d/hiyori/runtime/hiyori_free_t08.model3.json
ls frontend/public/live2dcubismcore.min.js
```

Verify commit history preserved:
```sh
git log --oneline --graph --all | head -30
# Both merge commits should be visible, with full history from both branches
```

---

## Phase 6: Deploy

```sh
npm --prefix cdk run idea:deploy -- --stage=dev
```

This deploys backend + sakura frontend together. `idea-env.js` handles Live2D sync post-deploy automatically (`aws s3 sync frontend/build/live2d s3://<bucket>/live2d`).

### Post-deploy verification:
- Navigate to `https://d2l9b1xmucsb19.cloudfront.net` — should show Sakura UI (not old template)
- Login with test credentials
- Verify API endpoints respond
- Verify Live2D companion loads
- Run E2E: `E2E_BASE_URL=https://d2l9b1xmucsb19.cloudfront.net npx playwright test --config e2e/playwright.config.js`

### Destroy sakura UiOnly stack (only after verification passes):
```sh
npm --prefix cdk run idea:destroy -- --stage=design-sakura
```
This removes the separate S3 bucket, CloudFront distribution (`d2lepwk3t4buta.cloudfront.net`), and Cognito app client (`1h4063jlsj1cht24u1t1p32tq3`) for design-sakura.

---

## Phase 7: Archive Branches & Clean Up Worktrees

```sh
# Push consolidated main
git push origin main

# Remove sakura worktree
git worktree remove /Users/adrienlamoureux/Documents/code/wt/design-sakura/code

# Switch primary worktree to main
git checkout main

# Archive old branches (rename, don't delete yet)
git branch -m codex/dev archive/codex-dev
git branch -m codex/design-sakura/code archive/design-sakura-code
git push origin archive/codex-dev archive/design-sakura-code
```

Delete archived branches from remote after 30 days of stability.

---

## Phase 8: Update Memory

Update `MEMORY.md` to reflect:
- `main` is the single development branch (no more codex/dev or design branches for sakura)
- Deployment model: single `idea:deploy --stage=dev` from `main`
- design-sakura UiOnly stack destroyed
- Remove worktree references for sakura
- Keep UiOnlyStack references for fusion/pixnovel (still valid)
- Update test counts and known gaps

---

## Critical Files Reference

| File | Action | Source of Truth |
|------|--------|-----------------|
| `cdk/lib/static-web-aws-ai-stack.ts` | Remove sakura from variant domains (line ~53) | codex/dev |
| `cdk/lib/ui-stack.ts` | Keep as-is (for other variants) | codex/dev |
| `cdk/scripts/idea-env.js` | No code changes needed | codex/dev |
| `backend/**` (all) | From codex/dev | codex/dev |
| `frontend/**` (all) | From design-sakura | design-sakura |
| `AGENTS.md` | Major rewrite of branch/worktree sections | codex/dev baseline, then update |
| `CONTRIBUTING.md` | Update branch scope sections | codex/dev baseline, then update |
| `docs/architecture.md` | Rewrite sections 2, 4, 7, 8, 11 | codex/dev baseline, then update |
| `docs/testing.md` | Update E2E example URLs | codex/dev baseline, then update |
| `docs/adr/006-branch-consolidation.md` | New file | Create |
| `frontend/ARCHITECTURE.md` | Update overlay references | design-sakura baseline, then update |
| `scripts/check-design-pixnovel-scope.sh` | Rename/generalize or retire | codex/dev |

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Merge breaks deployed backend | Safety tags allow instant rollback: `git checkout archive/main-pre-consolidation` |
| CDK stack drift | Run `idea:diff` before deploy to preview changes; abort if unexpected replacements |
| Live2D assets not synced | `idea-env.js` handles this automatically in `deployStage()` |
| Frontend build fails | `npm install` in Phase 3 regenerates lock files from sakura's `package.json` |
| Other variants (fusion, pixnovel) break | They use UiOnlyStack -> dev backend (unchanged). Their CloudFront domains stay in variant list |
| Cognito callback URL mismatch | Only sakura domain removed from variant list; its stack is destroyed so no users need it |
| Stack name change destroys resources | Stack name is NOT changed — kept as `StaticWebAWSAIStack-dev` |

## Merge Strategy Rationale

**Why sequential merge (not rebase or cherry-pick):**
- 123 commits across two branches — cherry-pick loses merge history and duplicates commits
- Rebasing 43 sakura commits onto an 80-commit-ahead main risks silent semantic conflicts
- Sequential merge preserves full history from both branches with clear merge commits
- `--no-ff` ensures explicit merge commits for auditability

**Conflict resolution is deterministic:** backend = codex/dev, frontend = sakura, CDK = codex/dev, docs = codex/dev. No judgment calls needed during merge.
