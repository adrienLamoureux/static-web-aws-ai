# Decisions - dev

## Entries
- Date: 2026-03-18
- Decision: Treat `codex/dev` as the full-stack source-of-truth branch and keep the frontend intentionally minimal.
- Context: The repo now supports multiple rich UI overlays in parallel. The baseline branch must remain stable for backend/CDK work and cross-branch contract management.
- Alternatives considered: letting `codex/dev` grow into another full UX branch.
- Consequences: design work must stay in overlay branches, while shared contracts and infrastructure changes land here first.

- Date: 2026-03-18
- Decision: Support both full-stack and UI-only deployment modes in CDK.
- Context: Some ideas need isolated backend resources; others only need a new frontend shell over an existing backend.
- Alternatives considered: full-stack-only deployments for every idea.
- Consequences: `idea:deploy -- --backend-stage=<stage>` is available, and future agents must understand whether a stage is currently full-stack or UI-only before changing stack wiring.

- Date: 2026-03-19
- Decision: Preserve the story session response shape as a frozen cross-branch contract.
- Context: both active UI worktrees depend on `{ session, messages, scenes }` with top-level arrays and chronological scene/message pairing.
- Alternatives considered: nesting `messages` and `scenes` under `session` or attaching `sceneId` directly to every message.
- Consequences: backend changes touching story payloads require deliberate coordination across all design overlays.
