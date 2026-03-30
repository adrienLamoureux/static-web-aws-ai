# Status - dev

## Snapshot
- Stack: `StaticWebAWSAIStack-dev`
- Stage: `dev`
- Created at: `2026-03-18T08:19:07.943Z`
- Current status: `LIVE`
- Active worktree: `/Users/adrienlamoureux/Documents/code/static-web-aws-ai`
- Active branch: `codex/dev`
- CloudFront URL: `https://d2l9b1xmucsb19.cloudfront.net`
- API Endpoint: `https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/`
- Cognito domain: `https://whiskstudio-alx-dev-761593662432.auth.us-east-1.amazoncognito.com`
- Shared live-stack test credentials: `test@test.com` / `Test1234567@`

## Open Risks
- The committed docs had drifted from the deployed branch reality until the 2026-03-19 refresh.
- Backend test coverage is still low relative to the route surface area.
- `codex/dev` intentionally does not validate the real Cognito UX in its local placeholder frontend.

## Next Actions
- Land any shared backend or CDK contract changes here before touching design branches.
- Keep `IDEAS.md`, `REQUIREMENTS.md`, and `docs/architecture.md` in sync when stack behavior changes.
- Add more backend coverage around story and operations routes.

## Activity Log
- 2026-03-18T08:19:07.945Z | event=synth | stage=dev
- 2026-03-18T08:50:21.062Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=98fe43a / sanity=passed / ui_smoke=passed
- 2026-03-18T09:15:21.019Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=5bea57a / sanity=passed / ui_smoke=passed
- 2026-03-18T10:06:52.405Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=5bea57a / sanity=passed / ui_smoke=passed
- 2026-03-24T18:41:20.517Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=e3751c4 / sanity=passed / ui_smoke=passed / improvement=3-tier-permissions
- 2026-03-24T18:47:26.474Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=e3751c4 / sanity=passed / ui_smoke=passed / improvement=fix-authorizer-deps
- 2026-03-27T11:30:21.867Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=e20a358 / sanity=skipped / ui_smoke=passed
- 2026-03-27T11:40:02.338Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=7143405 / sanity=skipped / ui_smoke=passed
- 2026-03-27T15:34:07.090Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=c104863 / sanity=skipped / ui_smoke=passed
- 2026-03-30T21:44:03.000Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=e46e939 / sanity=passed / ui_smoke=passed / improvement=companion-memory-proactive-generation
- 2026-03-30T20:44:20.682Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=e46e939 / sanity=passed / ui_smoke=passed
