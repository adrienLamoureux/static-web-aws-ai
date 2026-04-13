# Solaris — warm light-first creative workspace (design-solaris)

## Objective
- Explore a warm, light-first shell that emphasizes calm navigation and readable surfaces.
- Serve as a distinct design direction that can diverge visually without changing the backend contract.

## Design References
- Primary visual benchmark: warm editorial creative workspaces.
- Secondary visual benchmark: restrained, high-legibility control surfaces.

## Scope
- In scope:
  - isolated stage deployment
  - future dedicated Solaris frontend variant
- Out of scope:
  - backend divergence
  - provider/runtime changes

## Delivery Tracks
- Plan track: initial scaffold only.
- Build track: no active code worktree is currently checked out.
- Integration/QA track: the scaffold deployment is live.

## Functionalities
- The stage is live and available for future Solaris-specific UI exploration.
- Until a dedicated code worktree exists, this idea should be treated as a prepared environment rather than an actively evolving overlay branch.

## Architecture Touchpoints
- Backend: shared contracts from `main`
- Frontend: no active dedicated worktree at the moment
- CDK: `StaticWebAWSAIStack-design-solaris`
- AI scripts/notebooks: no stage-specific changes

## Contract Notes
- API changes: none stage-specific
- Runtime config changes: none stage-specific
- Data model/storage changes: none stage-specific

## Handoff Notes For Sub-Agents
- Current priority:
  - create a dedicated design-solaris UI worktree before implementation resumes
- Known blockers:
  - stage exists, but no active overlay branch is checked out
- Next smallest shippable increment:
  - freeze the Solaris layout contract and stand up the missing code worktree
