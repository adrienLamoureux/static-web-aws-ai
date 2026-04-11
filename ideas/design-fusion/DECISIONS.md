# Decisions - design-fusion

## Entries
- Date: 2026-03-17
- Decision: Build `design-fusion` as a Solaris-style frontend overlay with grouped route names instead of the raw shared route labels.
- Context: The idea is meant to make the full product feel calmer and more curated without reducing capability.
- Alternatives considered: keeping the original `/whisk`, `/story`, `/shared`, and `/music-library` labels as first-class navigation items.
- Consequences: legacy redirects must be preserved as hard compatibility contracts.

- Date: 2026-03-17
- Decision: Keep real runtime config loading, real Cognito auth, and the full feature set in the branch instead of making it a visual mock.
- Context: This branch is intended to be a serious usable overlay, not a static design concept.
- Alternatives considered: a static prototype or a partial shell over placeholder pages.
- Consequences: service-layer and auth regressions are real risks here, so frontend work must stay aligned with shared backend contracts.

- Date: 2026-03-19
- Decision: Track the current live deployment as a dedicated `design-fusion` full stack with its own API and Cognito outputs.
- Context: earlier deploys pointed the branch at other backends, but the latest live deployment now resolves to `https://luu3x0m826.execute-api.us-east-1.amazonaws.com/prod/`.
- Alternatives considered: leaving the documentation in its earlier “uses dev API” state.
- Consequences: future agents must treat the current live stack as isolated until the deployment model changes again.
