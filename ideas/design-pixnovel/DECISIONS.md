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

- Date: 2026-02-25T09:32:00Z
- Decision: Add PixAI-inspired animated masonry stream in hero with external prototype image URLs.
- Context: The design objective shifted to stronger visual density and obvious bottom-to-top image motion.
- Alternatives considered: Keep CSS-only hero art; wait for internal media API integration first.
- Consequences: Visual impact is improved immediately, but there is dependency/risk on third-party image hosting until replaced with first-party media assets.

- Date: 2026-02-25T09:43:00Z
- Decision: Unify nested UI surfaces by replacing many boxed sub-panels with divider-based grouping.
- Context: Current visual hierarchy felt fragmented due to repeated bordered cards in every subsection.
- Alternatives considered: Keep existing panel/card density; remove all visual separators.
- Consequences: UI reads as one cohesive canvas while preserving structure via subtle separators and lightweight surfaces.

- Date: 2026-02-25T10:07:00Z
- Decision: Apply hard shell unification so top-level sections are no longer independent panels.
- Context: Previous unification pass still looked too boxy in practice.
- Alternatives considered: Incremental border alpha tweaks only.
- Consequences: Hero, generator rail, stage, and feed now appear as a contiguous layout with separator lines, improving visual continuity.

- Date: 2026-02-25T10:25:00Z
- Decision: Remove width-constrained canvas and make main shell full-screen/full-width.
- Context: Remaining visual mismatch came from centered width constraints and separate workspace background.
- Alternatives considered: Keep centered shell and only adjust colors.
- Consequences: Header/main/workspace now read as one continuous page surface and the background mismatch is eliminated.

- Date: 2026-02-25T11:18:00Z
- Decision: Remove standalone app header and embed nav/auth controls in hero top bar; cool down page background palette.
- Context: Layout still felt disconnected and background was perceived as warm.
- Alternatives considered: Keep external header and only tweak panel borders/colors.
- Consequences: First-screen composition is consolidated into a single PixNovel panel and the background now stays in blue/violet range.

- Date: 2026-02-25T11:40:00Z
- Decision: Remove detached hero portrait block and enforce Pixnovel-scoped overrides for warm Story/Music legacy surfaces.
- Context: Even after palette updates, the UI still showed yellow/beige cast because route-level Story/Music CSS retained warm colors and panel states.
- Alternatives considered: Keep portrait and only tune root gradients; rewrite Story/Music component CSS directly.
- Consequences: Hero is visually unified, warm tint is removed at the shell level, and route contracts remain unchanged while keeping overrides isolated to the Pixnovel stage.
