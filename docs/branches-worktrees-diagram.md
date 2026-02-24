# Branches And Worktrees Diagram

As of 2026-02-24, this is the active Git/worktree topology used for parallel idea development.

## Mermaid Diagram

```mermaid
flowchart LR
  subgraph BR["Branch Topology (commit history)"]
    MAIN["main"]
    DEV["codex/dev"]
    DMAIN["codex/design-main/code"]
    DEND["codex/design-endfield/code"]
    DMOE["codex/design-moescape/code"]
    MAIN --> DEV
    DEV --> DMAIN
    DEV --> DEND
    DEV --> DMOE
  end

  subgraph WT["Worktree Mapping (filesystem checkouts)"]
    WTDEV["/Users/adrienlamoureux/Documents/code/static-web-aws-ai"]
    WTM["/Users/adrienlamoureux/Documents/code/wt/design-main/code"]
    WTE["/Users/adrienlamoureux/Documents/code/wt/design-endfield/code"]
    WTO["/Users/adrienlamoureux/Documents/code/wt/design-moescape/code"]
  end

  DEV -. checked out in .-> WTDEV
  DMAIN -. checked out in .-> WTM
  DEND -. checked out in .-> WTE
  DMOE -. checked out in .-> WTO
```

## How To Read It

- A branch is history; a worktree is a folder checkout.
- All worktrees share the same `.git` object database.
- Each worktree has one active branch and independent uncommitted changes.
- Promote changes between branches with merge/rebase/cherry-pick.
