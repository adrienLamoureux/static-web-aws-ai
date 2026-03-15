# Branches And Worktrees Diagram

As of 2026-03-15, this is the active Git/worktree topology used for parallel idea development.

## Mermaid Diagram

```mermaid
flowchart LR
  subgraph BR["Branch Topology (commit history)"]
    MAIN["main"]
    DEV["codex/dev"]
    DPIX["codex/design-pixnovel/code"]
    DLEG["codex/design-pixnovel-legacy/code"]
    PAUR["codex/palette-aurora/code"]
    PBRE["codex/palette-breeze-light/code"]
    PEMB["codex/palette-ember/code"]
    PLIL["codex/palette-lilac-light/code"]
    PNOI["codex/palette-nocturne/code"]
    MAIN --> DEV
    DEV --> DPIX
    DEV --> DLEG
    DEV --> PAUR
    DEV --> PBRE
    DEV --> PEMB
    DEV --> PLIL
    DEV --> PNOI
  end

  subgraph WT["Worktree Mapping (filesystem checkouts)"]
    WTDEV["/Users/adrienlamoureux/Documents/code/static-web-aws-ai"]
    WTPIX["/Users/adrienlamoureux/Documents/code/wt/design-pixnovel/code"]
    WTLEG["/Users/adrienlamoureux/Documents/code/wt/design-pixnovel-legacy/code"]
    WTAUR["/Users/adrienlamoureux/Documents/code/wt/palette-aurora/code"]
    WTBRE["/Users/adrienlamoureux/Documents/code/wt/palette-breeze-light/code"]
    WTEMB["/Users/adrienlamoureux/Documents/code/wt/palette-ember/code"]
    WTLIL["/Users/adrienlamoureux/Documents/code/wt/palette-lilac-light/code"]
    WTNOI["/Users/adrienlamoureux/Documents/code/wt/palette-nocturne/code"]
  end

  DEV -. checked out in .-> WTDEV
  DPIX -. checked out in .-> WTPIX
  DLEG -. checked out in .-> WTLEG
  PAUR -. checked out in .-> WTAUR
  PBRE -. checked out in .-> WTBRE
  PEMB -. checked out in .-> WTEMB
  PLIL -. checked out in .-> WTLIL
  PNOI -. checked out in .-> WTNOI
```

## How To Read It

- A branch is history; a worktree is a folder checkout.
- All worktrees share the same `.git` object database.
- Each worktree has one active branch and independent uncommitted changes.
- Promote changes between branches with merge/rebase/cherry-pick.
