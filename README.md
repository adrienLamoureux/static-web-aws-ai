# Design-Pixnovel

This worktree is the flagship Pixnovel frontend overlay branch.

## Branch Summary
- Branch: `codex/design-pixnovel/code`
- Worktree: `/Users/adrienlamoureux/Documents/code/wt/design-pixnovel/code`
- Live frontend: `https://d21j30h6jj4n2k.cloudfront.net`
- Live API: `https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/`

## What Lives Here
- Full authenticated React frontend
- Pixnovel shell, theme system, and cinematic hero
- Quick-generate panel and shared operations rails
- Director, story, music, LoRA, image, video, and gallery flows
- Branch-local docs for future agents

## What Does Not Live Here
- Backend contract work
- Shared registry maintenance
- Generic repo-wide documentation

## Read This First
1. `AGENTS.md`
2. `frontend/REQUIREMENTS.md`
3. `frontend/src/App.js`
4. `frontend/src/config/pixnovelShellConfig.js`

## Validation

```bash
npm --prefix frontend run build
npm --prefix cdk run idea:ui-local -- --stage=design-pixnovel
```

Deploy when needed:

```bash
npm --prefix cdk run idea:deploy -- --stage=design-pixnovel
```
