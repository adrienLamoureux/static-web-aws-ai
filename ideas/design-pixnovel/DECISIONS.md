# Decisions - design-pixnovel

Use short ADR-style entries.

## Entries
- Date: 2026-02-24T22:49:34Z
- Decision: Initialize isolated idea stage `design-pixnovel` from the `design-moescape` branch baseline.
- Context: A new visual concept was needed without risking regressions in existing live idea stacks.
- Alternatives considered: Implement directly in `design-moescape`; implement in `codex/dev`.
- Consequences: Fast bootstrap from a proven variant, with independent deploy/seed lifecycle.

- Date: 2026-02-24T22:52:00Z
- Decision: Keep route/API contracts unchanged and redesign only the shell/theming layer.
- Context: Goal was radical UI experimentation with minimal behavioral risk.
- Alternatives considered: Route-level rewrites and feature-level component splits.
- Consequences: Existing functionality remains stable while visual language changes significantly.

- Date: 2026-02-24T22:54:00Z
- Decision: Use a CSS-based anime-inspired hero portrait rather than external third-party artwork assets.
- Context: PixAI hero feel was required, but direct asset reuse introduces licensing and dependency risk.
- Alternatives considered: Hotlink external images; vendor downloaded assets into repo.
- Consequences: Theme remains self-contained and deployable without external image dependencies.

- Date: 2026-02-24T23:00:07Z
- Decision: Deploy and validate via `idea:deploy` + automatic sanity/UI smoke before seeding.
- Context: Project policy requires runtime changes to be validated post-deploy.
- Alternatives considered: Local build-only validation.
- Consequences: Live stack has automated verification and a reproducible deployment record.
