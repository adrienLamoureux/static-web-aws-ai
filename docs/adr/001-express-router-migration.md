# ADR 001 — Express Router Migration

**Status:** Accepted
**Date:** 2026-04-06

---

## Context

Originally, backend route modules were plain functions with the signature `(app, deps) => void`. Each module received the shared Express `app` instance and directly called `app.get()`, `app.post()`, etc., mutating the shared object. This pattern worked initially but created several problems:

- No namespace isolation — all routes were registered on the same flat `app`, making path collisions easy to miss.
- Hard to test — mocking `app.get` meant replacing the global Express instance.
- `index.js` had no single view of the mount structure; routes were scattered across 15+ files with no consistent registration pattern.

As the route count grew toward 73+ endpoints across 15 modules, drift between modules became costly.

---

## Decision

Migrate route modules to use the **Express Router** pattern:

- Each module exports a factory function: `module.exports = function register<Domain>Routes(deps) { ... return router; }`
- `index.js` calls `app.use("/mount-prefix", module(deps))` for all Router-based modules.
- Modules that have not yet been migrated still use the legacy `(app, deps)` signature; `index.js` handles both patterns during the transition.

---

## Consequences

**Positive:**
- Better Single Responsibility Principle (SRP) — each module is self-contained.
- Namespace isolation via `app.use("/story", storyRouter)` — story routes cannot accidentally shadow other routes.
- Easier unit testing — a Router instance can be mounted on a minimal Express app without loading all routes.
- `index.js` is now the canonical mount map, readable at a glance.

**Negative / Trade-offs:**
- Some modules (`core-prompt.js`, `operations-routes.js`, `character-routes.js`, `companion-route.js`, etc.) still use the legacy `(app, deps)` pattern and will need migration in a future pass.
- Changing the mount prefix in `index.js` silently breaks any client that has hard-coded the old path.

**Migration path:** New modules must use the Router pattern. Legacy modules should be migrated opportunistically when they are edited for other reasons.
