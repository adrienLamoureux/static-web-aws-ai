# Runbook - design-atelier

## Context
- Idea ID: `design-atelier`
- Stack ID: `StaticWebAWSAIStack-design-atelier`
- Idea directory: `ideas/design-atelier`

## One-Time Setup
1. Ensure dependencies are installed for `frontend/` and `cdk/`.
2. Initialize context docs:
`npm --prefix cdk run idea:init -- --stage=design-atelier --title="Atelier — professional productivity workspace"`
3. Optional environment for seeded admin users:
- `ADMIN_EMAIL`
- `SECONDARY_ADMIN_EMAIL`
- `ADMIN_TEMP_PASSWORD`

## Deploy
1. Build + deploy full stack:
`npm --prefix cdk run idea:deploy -- --stage=design-atelier`
2. Optional deploy without rebuilding frontend:
`npm --prefix cdk run idea:deploy -- --stage=design-atelier --skip-build`
3. Optional ownership/lifecycle tags:
`npm --prefix cdk run idea:deploy -- --stage=design-atelier --owner="adrien" --ttl-days=14`

## Seed Default Content
1. Seed this idea from the baseline source stage (`sandbox` by default):
`npm --prefix cdk run idea:seed -- --target-stage=design-atelier --source-stage=sandbox`
2. Seed this idea from an explicit source stack name:
`npm --prefix cdk run idea:seed -- --target-stage=design-atelier --source-stack=StaticWebAWSAIStack`
3. Seed with explicit user credentials:
`npm --prefix cdk run idea:seed -- --target-stage=design-atelier --source-stage=sandbox --seed-user-email="seed+design-atelier@example.com" --seed-user-password="<strong-password>"`
4. Seed all known ideas at once:
`npm --prefix cdk run idea:seed-many -- --all --source-stage=sandbox`
5. Dry-run before write operations:
`npm --prefix cdk run idea:seed-many -- --all --source-stage=sandbox --dry-run`

## Shared Improvement Rollouts
1. Autonomous rollout to all ideas (recommended):
`npm --prefix cdk run idea:rollout -- --improvement="improvement-name"`
2. Autonomous rollout to all ideas except a subset:
`npm --prefix cdk run idea:rollout -- --improvement="improvement-name" --exclude=idea-legacy`
3. Roll out one improvement to a subset:
`npm --prefix cdk run idea:deploy-many -- --stages=design-atelier,other-idea --improvement="improvement-name"`
4. Roll out one improvement to every known idea stack:
`npm --prefix cdk run idea:deploy-many -- --all --improvement="improvement-name"`
5. Dry-run targeting before rollout:
`npm --prefix cdk run idea:rollout -- --improvement="improvement-name" --dry-run`
6. Optional ownership/lifecycle tags during rollout:
`npm --prefix cdk run idea:rollout -- --improvement="improvement-name" --owner="adrien" --ttl-days=14`

## Inspect
1. Synthesize:
`npm --prefix cdk run idea:synth -- --stage=design-atelier`
2. Diff:
`npm --prefix cdk run idea:diff -- --stage=design-atelier`

## Destroy
1. Destroy full stack:
`npm --prefix cdk run idea:destroy -- --stage=design-atelier`

## Required Writeback
- Update `README.md` for scope/functionality drift.
- Log architecture decisions in `DECISIONS.md`.
- Confirm latest outcomes in `STATUS.md`.
- Record rollout details in `IMPROVEMENTS.md`.
