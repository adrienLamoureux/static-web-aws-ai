# Status - design-pixnovel

## Snapshot
- Stack: `StaticWebAWSAIStack-design-pixnovel`
- Stage: `design-pixnovel`
- Created at: `2026-02-24T22:49:34.686Z`
- Current status: `LIVE`
- Active worktree: `/Users/adrienlamoureux/Documents/code/wt/design-pixnovel/code`
- Active branch: `codex/design-pixnovel/code`
- CloudFront URL: `https://d31s9yo6pacgac.cloudfront.net`
- API Endpoint: `https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/`
- Seed user email: `seed+design-pixnovel@example.com`
- Seed status: `COMPLETED (8 images, 6 music tracks from design-main, explicit demo password set)`
- Current UX split:
  - `/` Generator: image wall + quick generate panel + image-to-video launch modal
  - `/videos`: dedicated video preview/delete library
  - `/story`, `/music-library`, `/about`: unchanged feature domains in Pixnovel shell

## Open Risks
- Hero portrait is CSS-rendered and may still need a final art asset direction.
- No visual regression screenshot baseline exists yet for this new variant.
- Hero masonry currently uses external prototype image URLs and should migrate to first-party media hosting.

## Next Actions
- Replace masonry URLs with seeded first-party media sources from the target stack.
- Add screenshot diff checks to complement existing UI smoke.
- Add video library controls (search/filter/sort) on `/videos` for larger collections.
- Run targeted UX pass on spacing/scroll behavior for Story and Videos pages in this shell.

## Activity Log
- 2026-02-24T22:49:34.693Z | event=init | Idea workspace initialized
- 2026-02-24T23:00:07.056Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=7201f1a / sanity=passed / ui_smoke=passed / improvement=pixnovel-hybrid-ui
- 2026-02-24T23:00:54.000Z | event=seed | source_stage=design-main / user=seed+design-pixnovel@example.com / images=8 / music=6
- 2026-02-24T23:00:57.231Z | event=ui-smoke | stage=design-pixnovel / result=passed
- 2026-02-24T23:02:38.000Z | event=seed | source_stage=design-main / user=seed+design-pixnovel@example.com / images=8 / music=6 / password=explicit
- 2026-02-24T23:03:26.882Z | event=ui-smoke | stage=design-pixnovel / result=passed
- 2026-02-25T09:34:50.143Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=6a09f97 / sanity=passed / ui_smoke=passed / improvement=pixnovel-masonry-image-stream
- 2026-02-25T09:45:18.141Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=5c65c89 / sanity=passed / ui_smoke=passed / improvement=pixnovel-surface-unification
- 2026-02-25T10:09:59.058Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=3f6aedf / sanity=passed / ui_smoke=passed / improvement=pixnovel-hard-unify-shell
- 2026-02-25T10:28:16.916Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=437450d / sanity=passed / ui_smoke=passed / improvement=pixnovel-fullscreen-main-shell
- 2026-02-25T11:23:49.380Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=b6a7c68 / sanity=passed / ui_smoke=passed / improvement=pixnovel-hero-top-auth-and-cool-bg
- 2026-02-25T11:36:11.927Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=8d87a6d / sanity=passed / ui_smoke=passed / improvement=pixnovel-remove-hero-visual-cool-bg-v2
- 2026-02-25T11:50:26.698Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=303067b / sanity=passed / ui_smoke=passed / improvement=pixnovel-enforce-body-theme-override
- 2026-02-25T12:06:16.661Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=a59fddd / sanity=passed / ui_smoke=passed / improvement=pixnovel-dialog-contrast-and-text-pass
- 2026-02-25T13:54:41.017Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=af4e7de / sanity=passed / ui_smoke=passed / improvement=pixnovel-whisk-text-contrast-boost
- 2026-02-25T14:15:31.636Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=d809a8c / sanity=passed / ui_smoke=passed / improvement=pixnovel-whisk-key-text-contrast-v2
- 2026-02-25T14:29:18.806Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=d90f6d3 / sanity=passed / ui_smoke=passed / improvement=pixnovel-masonry-color-calibration
- 2026-02-25T14:37:30.618Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=5fc4036 / sanity=passed / ui_smoke=passed / improvement=pixnovel-only-masonry-animation-white-text-force
- 2026-02-25T14:42:00.508Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=5fc4036 / sanity=passed / ui_smoke=passed / improvement=pixnovel-masonry-only-white-text-hard-override
- 2026-02-25T15:03:21.054Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=1680cc6 / sanity=passed / ui_smoke=passed / improvement=pixnovel-remove-all-motion-keep-masonry-only
- 2026-02-25T15:42:43.469Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=a9ceb12 / sanity=passed / ui_smoke=passed / improvement=pixnovel-portrait-fancy-image-wall
- 2026-02-25T15:59:11.419Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=887fe46 / sanity=passed / ui_smoke=passed / improvement=pixnovel-oblique-touching-portrait-wall
- 2026-02-25T16:24:02.960Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=66cd013 / sanity=passed / ui_smoke=passed / improvement=pixnovel-stronger-oblique-touching-wall
- 2026-02-26T09:24:34.821Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=6639653 / sanity=passed / ui_smoke=passed / improvement=ops-dashboard-quick-generate-panel
- 2026-02-26T09:28:30.001Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=6639653 / sanity=passed / ui_smoke=passed / improvement=ops-dashboard-dropdown-shortcuts
- 2026-02-26T09:33:14.565Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=6639653 / sanity=passed / ui_smoke=passed / improvement=quick-panel-js-prompt-payload
- 2026-02-26T09:34:44.393Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=6639653 / sanity=passed / ui_smoke=passed / improvement=quick-panel-hidden-prompts
- 2026-02-26T09:37:36.845Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=6639653 / sanity=passed / ui_smoke=passed / improvement=remove-redundant-whisk-hero-copy
- 2026-02-26T09:44:08.412Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=6639653 / sanity=passed / ui_smoke=passed / improvement=separate-videos-page
- 2026-02-26T09:47:05.500Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=6639653 / sanity=passed / ui_smoke=passed / improvement=separate-videos-page-finalize
- 2026-02-26T10:04:51.771Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=6639653 / sanity=passed / ui_smoke=passed / improvement=pane-aware-side-rails-and-cool-tone-story-music
- 2026-02-26T11:00:38.826Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=6639653 / sanity=passed / ui_smoke=passed / improvement=story-soundlab-no-side-panels
- 2026-02-26T11:03:52.145Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=6639653 / sanity=passed / ui_smoke=passed / improvement=story-soundlab-no-side-panels
- 2026-02-26T11:15:13.660Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=6639653 / sanity=passed / ui_smoke=passed / improvement=add-global-director-page-and-video-title-cleanup
- 2026-02-26T11:42:58.174Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=6639653 / sanity=passed / ui_smoke=passed / improvement=director-scope-1-4
- 2026-02-26T11:47:48.065Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=6639653 / sanity=passed / ui_smoke=passed / improvement=director-remove-yellow-warn
- 2026-02-26T17:21:19.668Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=6639653 / sanity=passed / ui_smoke=passed / improvement=director-hero-remove-yellow-glass
- 2026-02-26T21:37:51.287Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=6639653 / sanity=passed / ui_smoke=passed / improvement=whisk-create-plus-alignment
- 2026-02-26T22:32:30.340Z | event=diff | stage=design-pixnovel
- 2026-02-26T22:34:38.345Z | event=diff | stage=design-pixnovel
- 2026-02-26T22:36:14.975Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=39dab2d / sanity=passed / ui_smoke=passed / improvement=cognito-localhost-multiport-callbacks
- 2026-02-27T09:23:07.237Z | event=diff | stage=design-pixnovel
- 2026-02-27T09:33:56.732Z | event=deploy-many | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d31s9yo6pacgac.cloudfront.net / api=https://n0gnjjanh8.execute-api.us-east-1.amazonaws.com/prod/ / commit=39dab2d / sanity=passed / ui_smoke=passed / improvement=cognito-localhost-ports-3000-3009
- 2026-02-27T17:22:57.205Z | event=ui-smoke | stage=design-pixnovel / result=passed
- 2026-03-02T11:10:19.790Z | event=sanity | stage=design-pixnovel / result=passed
- 2026-03-02T11:10:48.504Z | event=ui-smoke | stage=design-pixnovel / result=passed
- 2026-03-02T22:17:31.243Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d21j30h6jj4n2k.cloudfront.net / api=https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/ / commit=1618965 / sanity=passed / ui_smoke=passed / improvement=lora-management
- 2026-03-02T22:20:01.460Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d21j30h6jj4n2k.cloudfront.net / api=https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/ / commit=1618965 / sanity=passed / ui_smoke=passed / improvement=lora-management
- 2026-03-02T22:20:54.735Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d21j30h6jj4n2k.cloudfront.net / api=https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/ / commit=1618965 / sanity=passed / ui_smoke=passed / improvement=lora-management-smoke
- 2026-03-02T22:25:05.902Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d21j30h6jj4n2k.cloudfront.net / api=https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/ / commit=ef28baa / sanity=passed / ui_smoke=passed / improvement=full-stack-lora-shared-library
- 2026-03-02T22:51:16.006Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d21j30h6jj4n2k.cloudfront.net / api=https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/ / commit=b3a26a9 / sanity=passed / ui_smoke=passed / improvement=design-pixnovel-shared-lora-css
- 2026-03-02T23:20:03.423Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d21j30h6jj4n2k.cloudfront.net / api=https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/ / commit=29eef41 / sanity=passed / ui_smoke=passed / improvement=design-polish-header-spacing-lora-director
- 2026-03-03T00:53:55.619Z | event=sanity | stage=design-pixnovel / result=passed
- 2026-03-03T00:54:17.855Z | event=ui-smoke | stage=design-pixnovel / result=passed
- 2026-03-03T17:20:22.467Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d21j30h6jj4n2k.cloudfront.net / api=https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/ / commit=29eef41 / sanity=passed / ui_smoke=passed / improvement=story-chat-polish-v3
- 2026-03-03T17:24:28.891Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d21j30h6jj4n2k.cloudfront.net / api=https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/ / commit=29eef41 / sanity=passed / ui_smoke=passed / improvement=story-portrait-book-layout
- 2026-03-03T17:28:04.397Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d21j30h6jj4n2k.cloudfront.net / api=https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/ / commit=29eef41 / sanity=passed / ui_smoke=passed / improvement=set-replicate-token
- 2026-03-03T17:43:54.092Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d21j30h6jj4n2k.cloudfront.net / api=https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/ / commit=29eef41 / sanity=passed / ui_smoke=passed / improvement=story-chat-phone-style
- 2026-03-03T20:27:51.039Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d21j30h6jj4n2k.cloudfront.net / api=https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/ / commit=81e5390 / sanity=passed / ui_smoke=passed / improvement=story-neon-player-chat-send-icon
- 2026-03-04T16:10:42.680Z | event=deploy | stack=StaticWebAWSAIStack-design-pixnovel / cloudfront=https://d21j30h6jj4n2k.cloudfront.net / api=https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/ / commit=3273c5c / sanity=passed / ui_smoke=passed / improvement=director-vertical-refresh-and-music-dock-visibility
