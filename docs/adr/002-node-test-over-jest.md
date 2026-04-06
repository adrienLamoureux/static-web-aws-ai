# ADR 002 — Node.js Built-in Test Runner Over Jest

**Status:** Accepted
**Date:** 2026-04-06

---

## Context

The backend is a plain-JS Node.js project. When introducing automated tests, we had two main options:

1. **Jest** — widely used, rich ecosystem, `jest.mock`, snapshot testing, watch mode.
2. **`node:test` + `node:assert/strict`** — built into Node 22, zero extra dependencies, TAP output, sufficient for unit testing.

Jest adds ~200–300 devDependency packages, requires Babel or `--experimental-vm-modules` for ESM, and has its own module resolution quirks that can conflict with the DI pattern used throughout the backend.

The backend test surface is primarily unit tests against small pure functions and DI-injected route handlers. We do not need snapshot testing, React rendering, or JSDOM.

---

## Decision

Use the **Node.js built-in test runner** (`node:test`) with `node:assert/strict` for all backend tests.

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
```

Run with:
```sh
npm --prefix backend test
```

Coverage via:
```sh
node --experimental-test-coverage --test backend/**/*.test.js
```

---

## Consequences

**Positive:**
- Zero new devDependencies for the test framework itself.
- No Babel configuration needed.
- Works seamlessly with the CommonJS modules used throughout the backend.
- Compatible with Node 20+ and Node 22 LTS.

**Negative / Trade-offs:**
- Less ergonomic than Jest (no `jest.fn()`, no `toMatchSnapshot()`).
- Watch mode is not built-in (use `nodemon` or `--watch` flag in Node 22+).
- Some engineers may be less familiar with `node:test` syntax.
- Mocking requires manual dependency injection rather than `jest.mock` — this is actually a design improvement but requires discipline.
