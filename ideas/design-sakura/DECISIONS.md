# Decisions - design-sakura

Use short ADR-style entries.

## Template
- Date:
- Decision:
- Context:
- Alternatives considered:
- Consequences:

## Entries
- Date: 2026-03-23T16:03:06.473Z
- Decision: Initialize idea environment.
- Context: Start tracking technical choices from the first prototype iteration.
- Alternatives considered: Ad-hoc notes in chat only.
- Consequences: Decisions are now searchable and transferable across sub-agent threads.

---

- Date: 2026-03-25
- Decision: Use Live2D (pixi-live2d-display + Cubism Core) for the companion character instead of SVG or sprite sheets.
- Context: An earlier SVG chibi walker was shipped but judged aesthetically insufficient. Sprite sheets were considered but lack the anime-style expressiveness. Live2D provides proper physics, hair sway, and full anime rendering.
- Alternatives considered: (1) CSS/SVG chibi — too low-fidelity; (2) Pixel art sprite sheet — too retro, limited expressiveness; (3) AI-generated walking PNG — hard to animate, inconsistent quality; (4) Lottie — no good source for anime characters.
- Consequences: +162KB to JS bundle (pixi.js@6 + pixi-live2d-display), Live2D Cubism Core loaded in `<head>`, canvas rendered via PixiJS on a fixed overlay.

---

- Date: 2026-03-25
- Decision: Use Hiyori Momose (free sample model, `hiyori_free_t08`, Cubism 3) as the initial companion character.
- Context: Free, well-structured sample model from Live2D Inc. with physics, 8 motion groups, and LipSync parameter support. Sufficient to prove out the system before sourcing a more distinctive model.
- Alternatives considered: Other free models (Mao, Rice, Mark) — less expressive or less anime-stylized.
- Consequences: No expression files (.exp3.json) in the free tier — emotion-based face changes deferred. Model is licensed under Live2D Free Material License Agreement (commercial use allowed for General/Small-Scale users).

---

- Date: 2026-03-25
- Decision: Backend companion route lives in `codex/dev`, not in design branches.
- Context: Design branches are frontend-only (scope guard). The companion chat endpoint (`POST /api/companion/chat`) uses Bedrock Haiku and belongs with other backend routes.
- Alternatives considered: Duplicating the route in each design branch — rejected, violates scope guard and creates drift.
- Consequences: Design-sakura's companion dialog falls back gracefully ("whispers something inaudible") until the sakura stack Lambda is updated from dev via a backend merge/redeploy.

---

- Date: 2026-03-25
- Decision: Use manual `aws s3 sync` + CloudFront invalidation for Live2D asset deployment instead of CDK `BucketDeployment`.
- Context: The CDK custom resource Lambda (`DeployWebsite`) repeatedly timed out when uploading Live2D assets (3MB+). Root cause is likely the Lambda's default memory/timeout settings combined with the large binary files (moc3, texture PNG).
- Alternatives considered: Increasing CDK `memorySize`/`ephemeralStorageSize` on the `BucketDeployment` construct — viable but requires CDK stack changes in `codex/dev`.
- Consequences: Live2D assets must be manually synced after any CDK deploy that changes them. CDK handles Lambda code + HTML/JS; S3 sync handles Live2D assets.
