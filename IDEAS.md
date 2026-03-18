# Idea Environments

Use this file as the top-level overview for all parallel full-stack idea environments.

## Registry
<!-- IDEA_REGISTRY_START -->
- idea=design-fusion | stack=StaticWebAWSAIStack-design-fusion | status=LIVE | last_action=2026-03-18T10:07:58.579Z | cloudfront=https://d3ei9r5awjyzzr.cloudfront.net | api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ | folder=ideas/design-fusion | note=Deployed 628b7c7
- idea=design-pixnovel | stack=StaticWebAWSAIStack-design-pixnovel | status=LIVE | last_action=2026-03-15T17:40:17.006Z | cloudfront=https://d21j30h6jj4n2k.cloudfront.net | api=https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/ | folder=ideas/design-pixnovel | note=Deployed 19337c2 (prepush-rebase-ui-validate-resume)
<!-- IDEA_REGISTRY_END -->

## Operating Rules
- Each idea must have its own folder: `ideas/<idea-id>/`.
- Each folder must keep `README.md`, `DECISIONS.md`, `RUNBOOK.md`, `STATUS.md`, and `IMPROVEMENTS.md`.
- Deploy and destroy actions should be run via the CDK helper commands so this registry and idea status logs stay in sync.
- Cross-idea feature rollouts must include an `--improvement` label and should update `/IMPROVEMENTS.md`.

## Standard Commands
- `npm --prefix cdk run idea:list`
- `npm --prefix cdk run idea:init -- --stage=<idea-id> --title="<title>"`
- `npm --prefix cdk run idea:deploy -- --stage=<idea-id> [--owner="<owner>"] [--ttl-days=<days>]`
- `npm --prefix cdk run idea:seed -- --target-stage=<idea-id> [--source-stage=<source-stage>] [--source-stack=<stack-name>] [--seed-user-email=<email>] [--seed-user-password=<password>]`
- `npm --prefix cdk run idea:destroy -- --stage=<idea-id>`
- `npm --prefix cdk run idea:diff -- --stage=<idea-id>`
- `npm --prefix cdk run idea:synth -- --stage=<idea-id>`
- `npm --prefix cdk run idea:rollout -- --improvement="<name>" [--exclude=idea-x] [--owner="<owner>"] [--ttl-days=<days>]`
- `npm --prefix cdk run idea:deploy-many -- --all --improvement="<name>" [--owner="<owner>"] [--ttl-days=<days>]`
- `npm --prefix cdk run idea:deploy-many -- --stages=idea-a,idea-b --improvement="<name>" [--owner="<owner>"] [--ttl-days=<days>]`
- `npm --prefix cdk run idea:diff-many -- --all`
- `npm --prefix cdk run idea:synth-many -- --all`
- `npm --prefix cdk run idea:seed-many -- --all [--exclude=idea-x] [--source-stage=<source-stage>] [--source-stack=<stack-name>]`
