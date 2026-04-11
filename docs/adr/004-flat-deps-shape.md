# ADR 004 — Keep Flat Deps Object in build-deps.js

**Status:** Accepted
**Date:** 2026-04-06

---

## Context

`backend/lib/build-deps.js` is the composition root for the entire backend. It assembles provider clients, DynamoDB utilities, storage helpers, story-engine helpers, auth middleware, and more into a single flat object (`deps`) that is passed into all 25 route modules.

As of this writing the `deps` object has 80+ named properties at the top level. An alternative would be to namespace them:

```js
// Namespaced (alternative)
deps.dynamo.client
deps.dynamo.put
deps.story.buildSessionSk
deps.auth.requireUser
```

This was considered but rejected.

---

## Decision

**Keep the flat `deps` shape.** Do not namespace or restructure the `deps` object.

---

## Rationale

1. **Blast radius** — Changing `deps.dynamoClient` to `deps.dynamo.client` would require updating every destructuring site across 25 route modules. With 80+ properties in active use, the refactor surface is very large and the risk of regression is high.

2. **No existing consumer bugs** — The flat shape has caused no actual runtime errors. The complexity is cosmetic, not functional.

3. **Destructuring ergonomics** — Route modules destructure only the subset they need: `const { dynamoClient, mediaTable } = deps`. Nested namespacing would make these destructures more complex, not less.

4. **DI contract is clear** — Any new dependency added to `build-deps.js` is available to all route modules immediately. The flat shape makes this contract easy to inspect in one file.

---

## Consequences

**Positive:**
- No migration work or regression risk.
- All existing route modules continue to work unchanged.
- New properties can be added to `deps` in one place without touching consumers.

**Negative / Trade-offs:**
- `build-deps.js` is a known "god object" — all 80+ deps at the same depth makes it harder to see groupings.
- Autocomplete on `deps` in IDEs shows a long, ungrouped list.
- If the number of route modules grows significantly (beyond ~40), the flat shape may need revisiting.

**Revisit trigger:** If route module count exceeds 40, or if `build-deps.js` grows beyond 500 lines itself, reconsider namespace grouping with an automated migration script.
