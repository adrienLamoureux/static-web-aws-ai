# Contributing to Whisk Studio

> Last updated: 2026-04-11

---

## Branch Model

`main` is the single development branch. Backend, frontend, and CDK all live here together.

To work on a feature or fix:
1. Branch from `main`: `git checkout -b codex/<idea-id>-<slice> main`
2. Implement your changes
3. Open a PR back to `main`

Other design variant branches (`codex/design-fusion/code`, `codex/design-pixnovel/code`) are UI-only overlays pointing at the `dev` backend — do not use them for new development.

---

## Code Style

### Linting
```sh
npm --prefix backend run lint
npm --prefix frontend run lint
npm --prefix cdk run lint     # if CDK is touched
```
All lint checks must pass with **0 errors** before a PR is opened.

### Formatting
```sh
npm --prefix backend run format
npm --prefix frontend run format
```
ESLint + Prettier are the enforced formatters. Do not submit PRs with unformatted code.

### Backend style notes
- Plain JS (no TypeScript in `backend/`)
- Use dependency injection — all new shared utilities must be wired in `backend/lib/build-deps.js`
- Each route module returns an Express `Router`; do not mutate `app` directly
- Do not bypass DI by requiring modules at the top of route files (three known exceptions: `civitai-client`, `director-config`, `lora-utils` — do not add more)

### Frontend style notes
- Use the `skr-` CSS class prefix for new components
- Add new CSS custom properties to `src/styles/tokens.css` under the `:root` block
- Do not use inline styles for theming — use CSS custom properties only
- Import API helpers from `src/services/apiClient.js`; do not `fetch()` directly in components

---

## 500-Line File Limit

No file may exceed 500 lines. This is enforced by:
```sh
bash scripts/check-file-length.sh
```
This script fails with a non-zero exit code if any non-test source file exceeds the limit. When a file grows beyond 500 lines, split it:
- Extract helpers into a `*-helpers.js` sibling file
- Move sub-domain logic into a sub-module (`routes/story/`, `routes/lora/`, etc.)
- Test files may be granted exemptions if necessary (document in PR description)

---

## PR Checklist

Before opening a pull request, verify all of the following pass:

- [ ] `npm --prefix backend run lint` exits 0
- [ ] `npm --prefix frontend run lint` exits 0
- [ ] `npm --prefix backend test` — all tests pass
- [ ] `npm --prefix frontend run test:ci` — all tests pass
- [ ] `bash scripts/check-file-length.sh` — no file over 500 lines
- [ ] `node -e "require('./backend/index')"` — backend loads without errors (if backend touched)
- [ ] `npm --prefix frontend run build` — build succeeds (if frontend touched)
- [ ] `npm --prefix cdk run build` — CDK compiles (if CDK touched)

---

## Quality Gates Table

| Gate | Script | Pass Condition |
|------|--------|----------------|
| Backend lint | `npm --prefix backend run lint` | 0 errors |
| Backend import gate | `node -e "require('./backend/index')"` | no throw |
| Backend tests | `npm --prefix backend test` | all pass |
| Frontend lint | `npm --prefix frontend run lint` | 0 errors |
| Frontend build | `npm --prefix frontend run build` | exits 0 |
| Frontend tests | `npm --prefix frontend run test:ci` | all pass |
| File length | `bash scripts/check-file-length.sh` | exits 0 |
| CDK build | `npm --prefix cdk run build` | exits 0 (if CDK touched) |
| E2E sanity | `E2E_BASE_URL=<url> npx playwright test --config e2e/playwright.config.js` | all pass (post-deploy) |

---

## Deployment Notes

Full-stack deploy (backend + Sakura frontend together from `main`):
```sh
npm --prefix cdk run idea:deploy -- --stage=dev
```

UI-only design variant deploy (for fusion, pixnovel, etc.):
```sh
npm --prefix cdk run idea:deploy -- --stage=<design-id> --backend-stage=dev
```

Always pass `--backend-stage=dev` for design variants. Omitting it deploys a full stack unintentionally.

Post-deploy, run E2E sanity tests and verify in the browser before closing the deploy ticket.

---

## Commit Messages

Follow conventional commits format:
```
<type>(<scope>): <summary>

<optional body>
```
Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`
Scope: `backend`, `frontend`, `cdk`, `e2e`, `docs`

Examples:
```
feat(backend): add /api/companion/initiative endpoint
fix(frontend): correct HUD z-index on mobile viewport
docs: update architecture.md with route subdirectory structure
```
