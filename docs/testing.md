# Testing Guide

> Last updated: 2026-04-11

---

## Backend Tests

### Run all tests
```sh
npm --prefix backend test
```

### Test runner
Backend tests use the **Node.js built-in test runner** (`node:test`) with `node:assert/strict`. No external test framework is needed. See [ADR 002](./adr/002-node-test-over-jest.md) for the rationale.

### File convention
Test files live in `backend/test/`, named `*.test.js`.
Current: 178 tests across auth, companion, keys, lora-routes, lora-utils, sanctum-admin, scene-context, story-prompt.

### Mock-deps pattern
Each test file imports the module under test and injects a hand-crafted `deps` object (dependency injection). No module-level mocking — this keeps tests deterministic and avoids `jest.mock` syntax.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('example', () => {
  const mockDeps = { dynamoClient: { send: async () => ({}) } };
  const result = myFunction(mockDeps, 'arg');
  assert.equal(result, 'expected');
});
```

### Known pre-existing failures
3 tests in `lora-routes.test.js` fail due to a mock-app limitation (multi-middleware handlers are not captured). These are pre-existing and should not be regressed further.

### Coverage
Add `--experimental-test-coverage` to collect line/function coverage:
```sh
node --experimental-test-coverage --test backend/lib/**/*.test.js
```
Coverage target: **40%** (line coverage of `backend/lib/` and `backend/routes/`).

---

## Frontend Tests

### Run all tests
```sh
npm --prefix frontend run test:ci
```
(Runs Jest in CI mode — no watch, exits with code.)

### Interactive watch mode
```sh
npm --prefix frontend test
```

### Test runner
Frontend tests use **React Testing Library (RTL)** + **Jest**. Test files are named `*.test.js` or `*.test.jsx` and colocated with the component under test.

### Mocking API services
API service modules are mocked at the module level using `jest.mock`:
```js
jest.mock('../services/story', () => ({
  getSessions: jest.fn().mockResolvedValue({ sessions: [] }),
}));
```
This prevents real HTTP calls in unit tests.

### Example: component test
```js
import { render, screen } from '@testing-library/react';
import HomePage from './HomePage';

test('renders page header', () => {
  render(<HomePage />);
  expect(screen.getByText(/Realm/i)).toBeInTheDocument();
});
```

### Coverage
Run with coverage report:
```sh
npm --prefix frontend run test:ci -- --coverage
```
Coverage target: **30%** (statement coverage).

---

## E2E Tests (Playwright)

### Install Playwright (first time)
```sh
export PATH="/opt/homebrew/bin:$PATH"
npx playwright install --with-deps
```

### Run against the deployed dev stack
```sh
E2E_BASE_URL=https://d2l9b1xmucsb19.cloudfront.net npx playwright test --config e2e/playwright.config.js
```

### Tests
Sanity tests live in `e2e/sanity.spec.js`. They run against the **deployed stack** (no local server needed):

| Test | What it checks |
|------|----------------|
| Homepage loads | Page response is 200, body has content |
| Unauthenticated login prompt | No hard errors or crash text |
| API health | `GET /hello/sanity` returns 200 |
| Static assets | CloudFront serves `index.html` + valid `config.json` |
| Music library auth guard | `GET /story/music-library` returns 401 (not 500) |

### Results
JSON results are written to `e2e/results.json` after each run.

---

## Quality Gate Summary

| Gate | Command | Target |
|------|---------|--------|
| Backend lint | `npm --prefix backend run lint` | 0 errors |
| Backend tests | `npm --prefix backend test` | 175/178 pass (3 pre-existing failures) |
| Backend coverage | `node --experimental-test-coverage ...` | ≥ 40% lines |
| Frontend lint | `npm --prefix frontend run lint` | 0 errors |
| Frontend tests | `npm --prefix frontend run test:ci` | all pass |
| Frontend coverage | `npm --prefix frontend run test:ci -- --coverage` | ≥ 30% stmts |
| Frontend build | `npm --prefix frontend run build` | exits 0 |
| E2E sanity | `E2E_BASE_URL=<url> npx playwright test --config e2e/playwright.config.js` | all pass |
| File length | `bash scripts/check-file-length.sh` | no file > 500 lines |
