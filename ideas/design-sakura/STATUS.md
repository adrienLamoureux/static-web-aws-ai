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
- CDK `DeployWebsite` custom resource Lambda times out when syncing Live2D assets (>3MB total); workaround is manual `aws s3 sync` + CloudFront invalidation
- `codex/dev` companion route not yet deployed to the sakura Lambda (different stack); companion dialog shows fallback until sakura stack merges backend from dev

## Next Actions
- Refine Hiyori: scale, position, idle motion tuning
- Add expression changes to CompanionDialog once a model with .exp3.json files is available
- Investigate CDK Lambda timeout fix (increase `memorySize`/`ephemeralStorageSize` on `BucketDeployment`)
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
- 2026-03-24T20:05:28.656Z | event=deploy | stack=StaticWebAWSAIStack-design-sakura / cloudfront=https://d2lepwk3t4buta.cloudfront.net / api=https://wl9d78lnf9.execute-api.us-east-1.amazonaws.com/prod/ / commit=9fa7ea3 / sanity=passed / ui_smoke=passed
- 2026-03-24T20:31:51.365Z | event=deploy | stack=StaticWebAWSAIStack-design-sakura / cloudfront=https://d2lepwk3t4buta.cloudfront.net / api=https://wl9d78lnf9.execute-api.us-east-1.amazonaws.com/prod/ / commit=d2ea574 / sanity=passed / ui_smoke=passed
- 2026-03-24T21:15:02.547Z | event=deploy | stack=StaticWebAWSAIStack-design-sakura / cloudfront=https://d2lepwk3t4buta.cloudfront.net / api=https://wl9d78lnf9.execute-api.us-east-1.amazonaws.com/prod/ / commit=51c71cb / sanity=passed / ui_smoke=passed
- 2026-03-25T07:42:53.374Z | event=deploy | stack=StaticWebAWSAIStack-design-sakura / cloudfront=https://d2lepwk3t4buta.cloudfront.net / api=https://wl9d78lnf9.execute-api.us-east-1.amazonaws.com/prod/ / commit=8fbe565 / sanity=passed / ui_smoke=passed
- 2026-03-25T14:24:00.000Z | event=s3-sync | note=Manual sync of Live2D companion assets + full build (CDK Lambda timeout workaround) / commits=e58d3a8..a92e370 / live2d=hiyori_free_t08 / character=hidden-pending-refinement
- 2026-03-26T18:22:00.000Z | event=s3-sync | note=VTuber companion panel redesign — CompanionPanel, Live2DEngine, emotion system, cursor tracking, multi-turn chat, model selector / commit=8abcc84 / invalidation=I628AE3O0LNBCPEKNLMGRCFBJL
- 2026-03-27T00:00:00.000Z | event=s3-sync | note=Hiyori reactivity — emotion→motion mapping, simulated lipsync (ParamMouthOpenY), manual mouse-follow (model.focus), walk pause during chat, canvas unhidden / commit=4bd3db1 / invalidation=IARF14VHBO9F2CACCHO3MQLPTK
- 2026-04-08T20:59:07.000Z | event=deploy | note=Sanctum overhaul (Tier 1+2+3) — SanctumSubNav, auto-refresh, empty states, CompanionSection, ThemeSection, SoundModuleCard, ConfigEditor, UsageDashboard, ModerationSection, FeatureFlagsSection, CharactersSection split, job retry/cancel, all-users session browser, companion memory admin, feature flags backend, cost dashboard, media moderation API / backend=StaticWebAWSAIStack-dev / frontend=s3-sync+invalidation / invalidation=I6NC89GMTQ7C23WQGE7X28E0P9 / sanity=passed / ui_smoke=passed
