# Atelier — professional productivity workspace (design-atelier)

## Objective
- Explore a more task-focused, professional creative workspace variant.
- Keep the same backend feature set while testing a calmer, productivity-oriented shell.

## Design References
- Primary visual benchmark: productivity-first creative dashboards.
- Secondary visual benchmark: structured editorial admin/workflow tools.

## Scope
- In scope:
  - isolated stage deployment
  - alternate frontend shell and information architecture
- Out of scope:
  - backend contract divergence
  - new provider integrations

## Delivery Tracks
- Plan track: define the design-system direction and route priorities.
- Build track: no active code worktree is currently checked out.
- Integration/QA track: initial scaffold was deployed successfully.

## Functionalities
- Stage exists as a live scaffold and can host a future dedicated frontend variant.
- Product capabilities remain the shared Whisk feature set until a new UI branch is activated.

## Architecture Touchpoints
- Backend: shared contracts from `main`
- Frontend: no active dedicated worktree at the moment
- CDK: `StaticWebAWSAIStack-design-atelier`
- AI scripts/notebooks: no stage-specific changes

## Contract Notes
- API changes: none stage-specific
- Runtime config changes: none stage-specific
- Data model/storage changes: none stage-specific

## Handoff Notes For Sub-Agents
- Current priority:
  - if work resumes, create a dedicated `code` worktree before UI implementation
- Known blockers:
  - no active overlay branch is checked out for this idea
- Next smallest shippable increment:
  - create a design-atelier UI worktree and freeze the frontend route/layout contract
