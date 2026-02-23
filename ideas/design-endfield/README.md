# Arknights Endfield inspired (design-endfield)

## Objective
- Explore a premium "gacha game launcher" aesthetic while preserving product functionality.
- Validate whether cinematic presentation and richer motion improve perceived product quality.

## Design References
- Primary visual benchmark: https://endfield.gryphline.com/en-us?shortlink=0c7c5qur&c=pc_attribution&pid=PC&af_xp=custom&source_caller=ui#home
- Secondary visual benchmark: baseline stack (`design-main`) for functional parity.

## Scope
- In scope:
- Out of scope:
- In scope: immersive hero layout, stronger visual depth, high-contrast panels, richer transitions.
- In scope: themed typography, iconography, and media card language inspired by the reference.
- Out of scope: changing core story/media backend behavior specific to this theme.

## Delivery Tracks
- Plan track: define tokenized visual system (spacing, typography, color, motion) before large UI edits.
- Build track: implement landing shell and story page re-skin with reusable theme variables.
- Integration/QA track: verify full user flow parity with baseline and capture visual regressions.

## Functionalities
- Preserve auth, story session lifecycle, image pipeline, and music library actions.
- Support larger media surfaces and optional animated section reveals without blocking core actions.
- Ensure shared feature rollouts can be toggled on/off per idea when requested.

## Architecture Touchpoints
- Backend: shared API contracts; no theme-specific route divergence.
- Frontend: custom styling layer and page composition under existing React app.
- CDK: isolated stack `StaticWebAWSAIStack-design-endfield`.
- AI scripts/notebooks: optional content-curation helpers only.

## Contract Notes
- API changes: only if needed by all ideas; otherwise keep frontend-only adaptation.
- Runtime config changes: add non-breaking theme flags if needed.
- Data model/storage changes: none planned for design-only experimentation.

## Handoff Notes For Sub-Agents
- Current priority: deploy independent stack and seed realistic media assets.
- Known blockers: none tracked yet.
- Next smallest shippable increment: deliver themed homepage shell with preserved navigation flow.
