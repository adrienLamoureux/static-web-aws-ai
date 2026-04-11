# Kinetic — dark spatial canvas (design-kinetic)

## Objective
- Explore a darker, more spatially dramatic frontend shell while keeping the shared Whisk product surface.
- Validate whether a high-contrast canvas can improve focus for generation-heavy workflows.

## Design References
- Primary visual benchmark: dark spatial control rooms and cinematic tool canvases.
- Secondary visual benchmark: dense creative workspaces with stronger panel separation.

## Scope
- In scope:
  - isolated stage deployment
  - future dedicated frontend shell exploration
- Out of scope:
  - backend divergence
  - provider/runtime changes

## Delivery Tracks
- Plan track: initial scaffold only.
- Build track: no active code worktree is currently checked out.
- Integration/QA track: the initial scaffold deployment is live.

## Functionalities
- The stage is live and ready for future frontend iteration.
- Until a code worktree exists, it should be treated as a scaffolded idea environment rather than an actively differentiated UX branch.

## Architecture Touchpoints
- Backend: shared contracts from `codex/dev`
- Frontend: no active dedicated worktree at the moment
- CDK: `StaticWebAWSAIStack-design-kinetic`
- AI scripts/notebooks: no stage-specific changes

## Contract Notes
- API changes: none stage-specific
- Runtime config changes: none stage-specific
- Data model/storage changes: none stage-specific

## Handoff Notes For Sub-Agents
- Current priority:
  - create a dedicated `code` worktree before any Kinetic-specific implementation
- Known blockers:
  - stage exists, but the branch-local UI codebase does not
- Next smallest shippable increment:
  - define the intended shell/routing direction and spin up `codex/design-kinetic/code`
