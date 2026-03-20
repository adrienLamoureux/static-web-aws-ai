# Requirements — design-pixnovel

> Last updated: 2026-03-19
> Branch: `codex/design-pixnovel/code`
> Worktree: `/Users/adrienlamoureux/Documents/code/wt/design-pixnovel/code`
> Scope: `frontend/**` plus branch-local docs only
> Live frontend: `https://d21j30h6jj4n2k.cloudfront.net`
> Live API: `https://5qoo5y28cd.execute-api.us-east-1.amazonaws.com/prod/`

## 1. Purpose
- This is the flagship rich frontend overlay.
- It keeps the full Whisk feature set but re-frames it inside the Pixnovel shell.
- The branch is intentionally opinionated about layout, theming, and UX density.

## 2. Editable Scope
- Allowed:
  - `frontend/src/**`
  - `frontend/REQUIREMENTS.md`
  - branch-local `AGENTS.md` and `README.md`
- Not allowed:
  - `backend/**`
  - shared docs and registries
  - branch-external architecture rewrites

## 3. App-Level Architecture
- Main orchestration file: `frontend/src/App.js`
- Central shell config: `frontend/src/config/pixnovelShellConfig.js`
- Auth provider: `frontend/src/contexts/AuthContext.js`
- Route protection: `frontend/src/components/auth/RequireAuth.js`
- Global music dock: `frontend/src/components/music/GlobalNowPlayingDock.js`
- Theme CSS: `frontend/src/themes/pixnovel.css`

Important design choice:
- App-level runtime config loading, route wiring, quick-generate UX, theme persistence, operations polling, and shell composition all live in `App.js`.

## 4. Runtime Config And Auth
- The app fetches `/config.json` on startup.
- On localhost, `REACT_APP_API_URL` can override the runtime API URL.
- Cognito config is merged through `mergeCognitoConfig(...)`.
- Auth uses real Cognito Hosted UI + PKCE through `AuthContext`.
- Cached auth tokens live in `frontend/src/utils/authTokens.js`.

## 5. Route Model
Routes are defined from `PIXNOVEL_PANE_META` in `frontend/src/config/pixnovelShellConfig.js`.

Primary routes:
- `/`
- `/shared`
- `/whisk`
- `/lora`
- `/videos`
- `/story`
- `/director`
- `/music-library`
- `/about`
- `/login`
- `/auth/callback`

These route names are part of the branch identity and should not be casually renamed.

## 6. Shell And Theme Rules
- The shell is cinematic and high-context, but it should stay controlled rather than noisy.
- Theme state is persisted with `PIXNOVEL_THEME_STORAGE_KEY`.
- `pixnovel.css` is the main theme surface.
- `moescape.css` remains part of the branch theme assets and should not be removed blindly.
- Motion policy:
  - preserve the current rule that only the masonry stream provides meaningful persistent animation
  - do not add broad transitions or decorative motion everywhere

## 7. Core Product Surfaces
- `pages/Whisk.js`
  - image-generation workspace
  - LoRA-aware image flow
  - share/select/video-launch actions
- `pages/WhiskVideos.js`
  - dedicated video library
- `pages/Director.js`
  - operations UI
  - app config, director config, masonry, session pinning, job prioritization
- `pages/Story.js`
  - story reader/director workflow
- `pages/StoryMusicLibrary.js`
  - soundtrack library
- `pages/LoraManagement.js`
  - LoRA catalog and profile management
- `pages/SharedLibrary.js`
  - shared gallery
- `pages/About.js`
  - product/system profile
- `pages/Login.js`
  - entry into the Cognito flow

## 8. Supporting Components And Hooks

### Whisk
- `components/whisk/WhiskHero.js`
- `components/whisk/WhiskWall.js`
- `components/whisk/WhiskModal.js`
- `pages/whisk/hooks/useImageStudio.js`
- `pages/whisk/hooks/useWhiskImages.js`
- `pages/whisk/hooks/useWhiskVideos.js`
- `pages/whisk/hooks/useVideoGeneration.js`

### Story
- `pages/story/useStoryStudio.js`
- `pages/story/useStoryDirectorBoard.js`
- `pages/story/StoryChatPanel.js`
- `pages/story/StoryContinuityCenter.js`
- `pages/story/StoryDirectorIllustrations.js`
- `pages/story/StoryIllustrationsPanel.js`
- `pages/story/StoryMusicTrackCard.js`
- `pages/story/storyDirectorUtils.js`

### Home / Quick Generate
- `components/home/ImageGenerationPanel.js`
- `components/home/PromptHelperForm.js`
- `components/home/ImageUploadPanel.js`
- `components/home/VideoGenerationPanel.js`
- `components/home/ApiStatusCard.js`

## 9. Service Layer Contract
All API access should flow through `frontend/src/services/**`.

Key service files:
- `apiClient.js`
- `operations.js`
- `story.js`
- `lora.js`
- `images.js`
- `s3.js`
- `replicate.js`
- `bedrock.js`
- `civitai.js`
- `huggingface.js`
- `promptHelper.js`

Do not invent ad-hoc payloads in pages when a service module should own that API shape.

## 10. Frozen Invariants
- Preserve top-level story response handling: `session`, `messages`, `scenes`.
- Keep route metadata centralized in `pixnovelShellConfig.js`.
- Keep the quick-generate form building its request through shared constants and services.
- Preserve the App-level theme persistence flow.
- Preserve real Cognito auth and `RequireAuth` behavior.

## 11. Validation
- Required:
`npm --prefix frontend run build`
- Recommended while iterating:
`npm --prefix cdk run idea:ui-local -- --stage=design-pixnovel`
- Deploy when needed:
`npm --prefix cdk run idea:deploy -- --stage=design-pixnovel`

## 12. Known Risks
- `frontend/src/App.js` is a high-churn integration file with many responsibilities.
- Story and director areas contain many cooperating modules and are easy to regress when route or shell assumptions change.
- Theme changes can leak broadly because the shell styling is centralized.
