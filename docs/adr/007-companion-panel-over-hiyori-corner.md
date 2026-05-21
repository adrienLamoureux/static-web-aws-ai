# ADR 007 — Reuse `CompanionPanel` Instead of a Dedicated `HiyoriCorner` in Agent Mode

**Status**: Accepted
**Date**: 2026-04-26

---

## Context

The original Agent-mode v0 ship plan (`docs/proposals/agent-mode-v0.md`) called for a new component, `HiyoriCorner`, mounted inside `AgentStage`:

> **HiyoriCorner**: 160px bottom-left, reuses CompanionCanvas

The intent was a dedicated stage-anchored Live2D presence — Hiyori "in the room" with the user during the agent loop, separate from the global `CompanionPanel` that shows in Dashboard mode.

During implementation we hit two pressures:

1. **Duplication risk.** `CompanionPanel` already does the heavy lifting: Pixi engine boot, model load, idle/breathing animations, blink loop, motion dispatch on `CompanionContext` events, full-screen mode. `HiyoriCorner` would have re-implemented most of that or wrapped `CompanionCanvas` directly with bespoke layout — either way another path to maintain.
2. **Dual-presence confusion.** With both `CompanionPanel` (global) and `HiyoriCorner` (stage-local) mounted simultaneously on `/atelier` in agent mode, two Hiyoris would render. Hiding one based on mode added conditional logic to a component that's otherwise route-agnostic, and risked motion dispatch landing on the wrong instance.

The existing `CompanionPanel` already:
- Subscribes to `CompanionActions.GENERATION_START / DONE / ERROR` events that the agent loop dispatches.
- Plays appropriate Live2D motions on those events for free.
- Renders fixed-position bottom-right, which doesn't collide with the agent's vertical scroll.

---

## Decision

Skip `HiyoriCorner` for v0 and post-v0. The existing global `CompanionPanel` continues to render in agent mode, anchored bottom-right. The agent loop dispatches `CompanionActions.GENERATION_START` / `GENERATION_DONE` / `GENERATION_ERROR` exactly the way the dashboard does — Hiyori reacts identically in both modes.

`AgentStage`'s top-level comment documents the choice:
```js
// The Hiyori Live2D corner is intentionally NOT mounted here — the existing
// CompanionPanel still renders globally and handles her presence + reactions.
// See ADR-007.
```

---

## Consequences

**Positive**
- Zero duplication of Live2D boot logic.
- Hiyori's reactions are unified across modes — same motion set, same idle behavior, no fork.
- One less component, one less CSS scope, one less mounting decision per route.
- Memory + GPU footprint stays at one Live2D instance per page.

**Negative**
- The corner is bottom-right, not bottom-left as the plan originally specified. The vertical manga scroll above her is still legible, but the visual composition is "her over there, scroll over here" rather than "her standing next to the panels." A future iteration could move `CompanionPanel` to bottom-left in agent mode via a CSS toggle without re-introducing duplication.
- We lose a *symbolic* design distinction between "co-creator presence" (agent) and "ambient companion" (dashboard). For now we accept that the user feels Hiyori's involvement through her motions and the agent's first-person voice; we'll revisit if user testing shows the distinction matters.

---

## Reversibility

Reversible. Re-introducing `HiyoriCorner` as a stage-anchored variant is straightforward:
1. Conditionally hide `CompanionPanel` when `mode === "agent"` and pathname is `/atelier`.
2. Mount a new `HiyoriCorner` from `AgentStage` that wraps `CompanionCanvas` with corner-specific framing.
3. Continue dispatching the same `CompanionActions` events.

The cost is mostly code (one extra component + a CSS scope), not architecture. We chose the lower-risk path now and parked the upgrade for v1 if it earns its keep.
