# ADR 006 — Branch Consolidation

**Status**: Accepted
**Date**: 2026-04-11

---

## Context

The project used a three-branch model:

- **`main`** — outdated full-stack baseline, no commits since 2026-02-xx
- **`codex/dev`** (80 commits ahead of main) — backend, CDK, docs, and a minimal frontend stub
- **`codex/design-sakura/code`** (43 commits ahead of main) — full Sakura Bloom frontend, Live2D companion, CSS design system; backend was stale (still carried the old monolithic structure)

This model was designed to allow parallel design exploration without polluting the backend branch. It served its purpose during the initial design phase but created ongoing friction:

1. **Cognitive overhead** — developers needed to track which branch contained which truth
2. **Cross-stack changes were error-prone** — a feature touching backend + frontend required coordination across branches and worktrees
3. **Documentation drift** — docs on `codex/dev` described overlays that weren't present, and vice-versa
4. **Worktree management** — a second checkout at `wt/design-sakura/code` was required for any frontend work
5. **Two deploy commands** — backend from `codex/dev`, sakura frontend via `aws s3 sync` from the worktree
6. **Increasing merge risk** — as the branches diverged further (382 files of diff), a future consolidation would only get harder

The project had also stabilized: Sakura Bloom was the clear primary UI; no other design variant was in active development; the backend on `codex/dev` was the sole backend for all variants.

---

## Decision

Consolidate `codex/dev` (backend) and `codex/design-sakura/code` (frontend) into `main` using a sequential merge strategy:

1. Fast-forward merge `codex/dev` → `main` (conflict-free — `main` was the fork point)
2. Merge `codex/design-sakura/code` → `main` with deterministic conflict resolution:
   - Backend conflicts → `codex/dev` wins
   - Frontend conflicts → `codex/design-sakura/code` wins
   - CDK conflicts → `codex/dev` wins
   - Docs/ideas conflicts → `codex/dev` wins

Both old branches are archived (`archive/codex-dev`, `archive/design-sakura-code`) and tagged for rollback.

`UiOnlyStack` is preserved unchanged to support UI-only overlay deployments for `design-fusion`, `design-pixnovel`, and other variants.

---

## Consequences

**Positive:**
- `main` is the single source of truth for the entire full stack
- One `npm --prefix cdk run idea:deploy -- --stage=dev` deploys backend + frontend together
- No more worktrees required for routine development
- New features touching frontend + backend ship from the same branch
- Documentation is self-consistent

**Neutral:**
- `UiOnlyStack` remains for other design variants — they continue to work unchanged
- Live2D assets continue to be synced out-of-band via `idea-env.js` (no change to the mechanism)
- Other design variant branches (`codex/design-fusion/code`, `codex/design-pixnovel/code`) remain as-is, pointing at the `dev` backend API

**Trade-off:**
- The explicit branch-level scope enforcement (only `frontend/**` in design branches) is gone; this is replaced by code review and `scripts/check-variant-scope.sh` for any future UI-only variant branches
- Frontend work is no longer isolated from backend changes in PRs; reviewers must apply judgment

---

## Rollback

If needed, the state before consolidation is preserved:
```sh
git checkout archive/main-pre-consolidation    # original main tip
git checkout archive/codex-dev-pre-consolidation      # codex/dev tip before merge
git checkout archive/design-sakura-pre-consolidation  # design-sakura tip before merge
```
