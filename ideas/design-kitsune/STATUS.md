# Status - design-kitsune

## Snapshot
- Stack: `StaticWebAWSAIStack-design-kitsune`
- Stage: `design-kitsune`
- Created at: `2026-03-21`
- Current status: `LIVE`
- Active worktree: `/Users/adrienlamoureux/Documents/code/wt/design-kitsune/code`
- Active branch: `codex/design-kitsune/code`
- CloudFront URL: `https://d2gmxz2dbzrvfm.cloudfront.net`
- API Endpoint: `https://rqtsmads46.execute-api.us-east-1.amazonaws.com/prod/`
- Cognito domain: `https://whisk-studio-design-kitsune-761593662432.auth.us-east-1.amazoncognito.com`
- User Pool ID: `us-east-1_tvruM5avI`
- User Pool Client ID: `8s85puar8pomo4ujfn9n2efe2`
- Shared live-stack test credentials: `test@test.com` / `Test1234567@`
- Design system: Kitsune Mono (AniList-inspired dark navy, kit- prefix)
- Current route split:
  - `/`: Home — activity feed, stats, continue-creating cards
  - `/studio`: Image generation + video animation (tab switcher)
  - `/stories`: Story sessions with chat, scenes, illustrations
  - `/browse`: Masonry gallery of shared images
  - `/admin`: Admin dashboard (characters, config)
  - `/admin/sounds`: Sound vault (upload, categorize tracks)
  - `/admin/lora`: LoRA catalog and character profiles
  - `/about`: Static about page

## Open Risks
- Legacy Solaris component file names (SolarisMasonry.js etc) still present, should be renamed in follow-up

## Next Actions
- QA login flow with test credentials on https://d2gmxz2dbzrvfm.cloudfront.net
- Verify all page content renders correctly with dark theme
- Rename legacy Solaris component files to Kitsune equivalents

## Activity Log
- 2026-03-21 | event=branch-created | commit=6721e2a | note=initial-kitsune-variant
- 2026-03-21T21:31:00.628Z | event=deploy | stack=StaticWebAWSAIStack-design-kitsune / cloudfront=https://d2gmxz2dbzrvfm.cloudfront.net / api=https://rqtsmads46.execute-api.us-east-1.amazonaws.com/prod/ / commit=2fe9518 / sanity=passed / ui_smoke=passed
