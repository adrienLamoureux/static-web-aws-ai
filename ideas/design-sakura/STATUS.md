# Status - design-sakura

## Snapshot
- Stack: `StaticWebAWSAIStack-design-sakura`
- Stage: `design-sakura`
- Created at: `2026-03-23T16:03:06.473Z`
- Current status: `LIVE`
- Active worktree: `/Users/adrienlamoureux/Documents/code/wt/design-sakura/code`
- Active branch: `codex/design-sakura/code`
- CloudFront URL: `https://d2lepwk3t4buta.cloudfront.net`
- API Endpoint: `https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/` (shared dev backend)
- Cognito domain: `https://whiskstudio-alx-dev-761593662432.auth.us-east-1.amazoncognito.com` (shared dev pool)
- User Pool ID: `us-east-1_KGfmw3Ykn` (shared dev pool)
- User Pool Client ID: (see ideas/design-sakura/cdk-outputs.json)
- Design system: Sakura Bloom (deep indigo + sakura pink, skr- prefix, bottom HUD)
- Current route split:
  - `/`: Home — masonry hero, recent activity
  - `/atelier`: Image generation + video animation
  - `/chronicle`: Story sessions with chat, scenes, illustrations
  - `/gallery`: Masonry gallery of shared images
  - `/sanctum`: Admin dashboard (characters, config)
  - `/sanctum/sounds`: Sound vault
  - `/sanctum/lora`: LoRA catalog and character profiles
  - `/about`: Static about page
- Shared live-stack test credentials: `test@test.com` / `Test1234567@`

## Open Risks
- No REQUIREMENTS.md written yet for this variant
- Legacy Solaris component file names (SolarisMasonry.js etc) still present — rename in follow-up

## Next Actions
- QA login flow with test credentials on https://d2lepwk3t4buta.cloudfront.net
- Write frontend/REQUIREMENTS.md

## Activity Log
- 2026-03-23T16:03:06.475Z | event=init | Idea workspace initialized
- 2026-03-23T16:10:41.906Z | event=deploy | stack=StaticWebAWSAIStack-design-sakura / cloudfront=https://d2lepwk3t4buta.cloudfront.net / api=https://xu3rykdxfj.execute-api.us-east-1.amazonaws.com/prod/ / commit=75cd798 / sanity=passed / ui_smoke=passed
- 2026-03-23T16:22:55.818Z | event=deploy | stack=StaticWebAWSAIStack-design-sakura / cloudfront=https://d2lepwk3t4buta.cloudfront.net / api=https://xu3rykdxfj.execute-api.us-east-1.amazonaws.com/prod/ / commit=6221dfb / sanity=passed / ui_smoke=passed
- 2026-03-23T16:56:45.226Z | event=deploy | stack=StaticWebAWSAIStack-design-sakura / cloudfront=https://d2lepwk3t4buta.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=e5002d4 / sanity=passed / ui_smoke=passed
- 2026-03-23T20:46:43.345Z | event=deploy | stack=StaticWebAWSAIStack-design-sakura / cloudfront=https://d2lepwk3t4buta.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=02a7643 / sanity=passed / ui_smoke=passed
- 2026-03-23T21:00:04.144Z | event=deploy | stack=StaticWebAWSAIStack-design-sakura / cloudfront=https://d2lepwk3t4buta.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=7893fe4 / sanity=passed / ui_smoke=passed
- 2026-03-23T21:29:14.503Z | event=deploy | stack=StaticWebAWSAIStack-design-sakura / cloudfront=https://d2lepwk3t4buta.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=bdf82c7 / sanity=passed / ui_smoke=passed
- 2026-03-24T08:51:23.894Z | event=deploy | stack=StaticWebAWSAIStack-design-sakura / cloudfront=https://d2lepwk3t4buta.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=97f9bce / sanity=passed / ui_smoke=passed
- 2026-03-24T18:39:37.814Z | event=init | Idea workspace initialized
- 2026-03-24T18:50:19.504Z | event=ui-smoke | stage=design-sakura / result=passed
