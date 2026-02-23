# Current design baseline (design-main)

## Objective
- Keep a clean baseline that mirrors current `main` product behavior and visual style.
- Use this stack as the control group for cross-idea feature parity and regression checks.

## Design References
- Primary visual benchmark: current app design from the `main` branch.
- Secondary visual benchmark: latest production-like baseline stack.

## Scope
- In scope:
- Out of scope:
- In scope: maintain existing layout, typography, component hierarchy, and interaction patterns.
- In scope: accept feature improvements that are not design-experiment specific.
- Out of scope: exploratory redesign motifs from Endfield or Moescape variants.

## Delivery Tracks
- Plan track: define acceptance criteria as "no UX drift unless explicitly requested".
- Build track: implement functional improvements first, design changes only when approved.
- Integration/QA track: compare API behavior and story flows against other idea stacks.

## Functionalities
- Story generation, image generation/upload, and music selection flows stay functionally identical to the canonical app.
- Authentication and user-scoped media behavior must remain unchanged.
- Shared improvements (for example delete-audio) are rolled out here first as baseline validation.

## Architecture Touchpoints
- Backend: shared backend routes/services with no idea-specific fork by default.
- Frontend: existing component structure and CSS strategy from the current app.
- CDK: isolated stack `StaticWebAWSAIStack-design-main`.
- AI scripts/notebooks: optional parity experiments only, no production coupling.

## Contract Notes
- API changes: avoid unless required for all idea stacks.
- Runtime config changes: keep same config keys as baseline app.
- Data model/storage changes: maintain compatibility with shared DynamoDB item shapes.

## Handoff Notes For Sub-Agents
- Current priority: keep this stack deployable and seeded as reference.
- Known blockers: none tracked yet.
- Next smallest shippable increment: deploy stack and seed baseline media dataset.
