# Branches And Worktrees Diagram

As of 2026-03-19, this is the active Git/worktree topology used for current development.

## Mermaid Diagram

```mermaid
flowchart LR
  subgraph BR["Branch Topology"]
    MAIN["main"]
    DEV["codex/dev<br/>full-stack baseline"]
    DFUS["codex/design-fusion/code<br/>Solaris overlay"]
    DPIX["codex/design-pixnovel/code<br/>Pixnovel overlay"]
    MAIN --> DEV
    DEV --> DFUS
    DEV --> DPIX
  end

  subgraph WT["Checked-Out Worktrees"]
    WTDEV["/Users/adrienlamoureux/Documents/code/static-web-aws-ai"]
    WTFUS["/Users/adrienlamoureux/Documents/code/wt/design-fusion/code"]
    WTPIX["/Users/adrienlamoureux/Documents/code/wt/design-pixnovel/code"]
  end

  subgraph LIVE["Live Deployed Stacks"]
    STDEV["dev<br/>d2l9b1xmucsb19.cloudfront.net"]
    STFUS["design-fusion<br/>d3ei9r5awjyzzr.cloudfront.net"]
    STPIX["design-pixnovel<br/>d21j30h6jj4n2k.cloudfront.net"]
  end

  DEV -. checked out in .-> WTDEV
  DFUS -. checked out in .-> WTFUS
  DPIX -. checked out in .-> WTPIX

  WTDEV -. deploys .-> STDEV
  WTFUS -. deploys .-> STFUS
  WTPIX -. deploys .-> STPIX
```

## Notes
- A branch is history; a worktree is a filesystem checkout.
- All worktrees share the same Git object database.
- Each worktree has one active branch and independent uncommitted changes.
- `codex/dev` owns backend, CDK, shared docs, and contract changes.
- The checked-out UI worktrees are frontend overlays that should keep their changes branch-local.
