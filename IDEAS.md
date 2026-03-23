# Idea Environments

Use this file as the top-level overview for all parallel full-stack idea environments.

## Registry
<!-- IDEA_REGISTRY_START -->
- idea=design-atelier | stack=StaticWebAWSAIStack-design-atelier | status=LIVE | last_action=2026-03-16T15:44:57.120Z | cloudfront=https://d3mv9zsmbqsn48.cloudfront.net | api=https://6g0ug8ef7l.execute-api.us-east-1.amazonaws.com/prod/ | folder=ideas/design-atelier | note=Deployed 628b7c7 (initial-scaffold)
- idea=design-fusion | stack=StaticWebAWSAIStack-design-fusion | status=LIVE | last_action=2026-03-19T08:43:09.321Z | cloudfront=https://d3ei9r5awjyzzr.cloudfront.net | api=https://luu3x0m826.execute-api.us-east-1.amazonaws.com/prod/ | folder=ideas/design-fusion | note=Deployed 68211ea
- idea=design-kinetic | stack=StaticWebAWSAIStack-design-kinetic | status=LIVE | last_action=2026-03-16T15:39:04.407Z | cloudfront=https://d1ulh0ke4fvnqg.cloudfront.net | api=https://ebd594ulg4.execute-api.us-east-1.amazonaws.com/prod/ | folder=ideas/design-kinetic | note=Deployed 628b7c7 (initial-scaffold)
- idea=design-kitsune | stack=StaticWebAWSAIStack-design-kitsune | status=LIVE | last_action=2026-03-23T16:55:38.239Z | cloudfront=https://d2gmxz2dbzrvfm.cloudfront.net | api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ | folder=ideas/design-kitsune | note=Deployed 729b8f9
- idea=design-pixnovel | stack=StaticWebAWSAIStack-design-pixnovel | status=LIVE | last_action=2026-03-15T17:40:17.006Z | cloudfront=https://d21j30h6jj4n2k.cloudfront.net | api=https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/ | folder=ideas/design-pixnovel | note=Deployed 19337c2 (prepush-rebase-ui-validate-resume)
- idea=design-solaris | stack=StaticWebAWSAIStack-design-solaris | status=LIVE | last_action=2026-03-16T15:30:18.031Z | cloudfront=https://d17qd3rx45vcxl.cloudfront.net | api=https://u3a3qlhk2h.execute-api.us-east-1.amazonaws.com/prod/ | folder=ideas/design-solaris | note=Deployed 628b7c7 (initial-scaffold)
- idea=dev | stack=StaticWebAWSAIStack-dev | status=LIVE | last_action=2026-03-18T10:06:52.399Z | cloudfront=https://d2l9b1xmucsb19.cloudfront.net | api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ | folder=ideas/dev | note=Deployed 5bea57a
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
