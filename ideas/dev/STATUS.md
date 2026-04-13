# Status - dev

## Snapshot
- Stack: `StaticWebAWSAIStack-dev`
- Stage: `dev`
- Created at: `2026-03-18T08:19:07.943Z`
- Current status: `LIVE`
- Active worktree: `/Users/adrienlamoureux/Documents/code/static-web-aws-ai`
- Active branch: `main`
- CloudFront URL: `https://d2l9b1xmucsb19.cloudfront.net`
- API Endpoint: `https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/`
- Cognito domain: `https://whiskstudio-alx-dev-761593662432.auth.us-east-1.amazoncognito.com`
- Shared live-stack test credentials: `test@test.com` / `Test1234567@`

## Open Risks
- Backend test coverage is still low relative to the route surface area.
- `Whisk.js` (698 lines) and `Story.js` (658 lines) exceed the 500-line limit — pre-existing, need splitting.

## Next Actions
- Land all backend, frontend, and CDK changes on `main`.
- Keep `IDEAS.md` and `docs/architecture.md` in sync when stack behavior changes.
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
- 2026-04-03T20:43:50.852Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=4cfef6c / sanity=passed / ui_smoke=passed
- 2026-04-04T20:15:39.616Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=8860d01 / sanity=passed / ui_smoke=passed
- 2026-04-04T20:49:05.822Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=9a18711 / sanity=passed / ui_smoke=passed
- 2026-04-06T20:07:32.732Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=212e181 / sanity=passed / ui_smoke=passed
- 2026-04-08T20:57:48.800Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=7cd6e10 / sanity=passed / ui_smoke=passed
- 2026-04-11T20:14:12.724Z | event=synth | stage=dev
- 2026-04-11T20:25:50.123Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=d4cfb99 / sanity=passed / ui_smoke=passed
- 2026-04-11T21:58:51.967Z | event=deploy | stack=StaticWebAWSAIStack-dev / cloudfront=https://d2l9b1xmucsb19.cloudfront.net / api=https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod/ / commit=ca86522 / sanity=passed / ui_smoke=passed
