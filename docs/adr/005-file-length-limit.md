# ADR 005 — 500-Line File Length Limit

**Status:** Accepted
**Date:** 2026-04-06

---

## Context

`backend/routes/story/illustration-routes.js` grew to **2,494 lines**. This is the largest single source file in the project and has become effectively un-reviewable in a PR. Similarly, `backend/routes/operations-routes.js` and a handful of frontend page components have been trending upward in line count.

Long files indicate that a module is doing too much — it violates SRP, makes code review expensive, increases merge conflict frequency, and makes it harder to locate specific logic.

We needed a rule that is:
1. Clear and mechanical (not subjective)
2. Enforceable in CI
3. Aggressive enough to prevent future growth without being so strict it requires splitting trivial files

---

## Decision

**Enforce a 500-line maximum on all non-test source files**, checked by `scripts/check-file-length.sh`.

The script scans `backend/`, `frontend/src/`, and `cdk/lib/` for files exceeding 500 lines. It exits with code 1 if any are found, causing CI to fail.

Run manually:
```sh
bash scripts/check-file-length.sh
```

### Exemptions
- Test files (`*.test.js`, `*.spec.js`) — tests can be longer due to many small independent assertions.
- Auto-generated files (CDK output JSON, bundled assets) — excluded by path pattern.
- Exemptions must be documented in the PR description.

---

## Consequences

**Positive:**
- Forces decomposition — long files must be split into focused modules.
- Easier code review — reviewers can read an entire file in one screen session.
- Reduces merge conflict surface — smaller files are changed by fewer PRs simultaneously.
- Mechanical enforcement means no subjective debate per PR.

**Negative / Trade-offs:**
- Some files that are legitimately large (e.g., `illustration-routes.js`) require significant upfront refactoring to comply.
- Splitting a file purely to meet the limit can result in many small files with awkward module boundaries.
- Test files may still grow unchecked (by design exemption).

**Migration:** `illustration-routes.js` (2,494 lines) is the highest priority file for decomposition. It should be split into `illustration-routes.js` (orchestration), `illustration-helpers.js` (utilities), and possibly additional sub-modules for image-provider-specific logic. Until the split is complete, it is tracked as a known gap in `docs/architecture.md`.
