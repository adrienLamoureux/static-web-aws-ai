# Requirements — design-fusion

> Last updated: 2026-03-19
> Branch: `codex/design-fusion/code`
> Worktree: `/Users/adrienlamoureux/Documents/code/wt/design-fusion/code`
> Scope: `frontend/**` plus branch-local docs only
> Live frontend: `https://d3ei9r5awjyzzr.cloudfront.net`
> Live API: `https://luu3x0m826.execute-api.us-east-1.amazonaws.com/prod/`

## 1. Purpose
- This branch is the Solaris overlay for the Whisk product.
- It preserves the full backend feature set while changing navigation, layout, and visual language.
- It is not a prototype stub. Auth, services, story, music, director, character, and LoRA flows are all live.
- It should be treated as the richer UI branch for future frontend work, not as a placeholder theme pass.

## 2. Editable Scope
- Allowed:
  - `frontend/src/**`
  - `frontend/REQUIREMENTS.md`
  - branch-local `AGENTS.md` and `README.md`
- Not allowed:
  - `backend/**`
  - shared idea registries
  - generic repo docs

## 3. Architecture Entry Points
- App root: `frontend/src/App.js`
- Provider chain:
  - `ConfigProvider`
  - `AuthProvider`
  - `MusicProvider`
- Runtime config: `frontend/src/contexts/ConfigContext.js`
- Auth: `frontend/src/contexts/AuthContext.js`
- Music state: `frontend/src/contexts/MusicContext.js`
- Styling: `frontend/src/index.css`

### Runtime Notes
- `ConfigContext` fetches `/config.json` and is the only source of `apiBaseUrl` and Cognito config for the branch.
- `AuthContext` implements Cognito PKCE and clears session cache on logout.
- `MusicContext` stores the global track catalog, active track, and autoplay requests consumed by the dock.
- `SolarisMusicDock` is mounted in the app shell, so scene music and library tracks are shared across routes.

## 4. Route Model

### Primary Routes
- `/`
- `/forge`
- `/storyboard`
- `/showcase`
- `/director`
- `/director/sounds`
- `/director/lora`
- `/about`
- `/login`
- `/auth/callback`

### Legacy Redirects
- `/whisk -> /forge`
- `/videos -> /forge?tab=videos`
- `/story -> /storyboard`
- `/shared -> /showcase`
- `/lora -> /director/lora`
- `/music-library -> /director/sounds`

These redirects are part of the branch contract. Do not remove them casually.

## 5. Visual System
- Namespace: every branch-specific CSS class should use the `sol-` prefix.
- Main tokens live in `:root` inside `frontend/src/index.css`.
- Fonts:
  - Inter for body
  - JetBrains Mono for supporting mono use
- Visual direction:
  - warm, light-first, editorial
  - amber accent
  - restrained shadows
  - grouped sidebar navigation
- The CSS file is monolithic. Prefer extending existing Solaris selectors over inventing parallel theme systems.

## 6. Page Ownership Map
- `HomePage.js`
  - Solaris landing page with animated masonry hero, navigation cards, and recent shared-image strip
- `Forge.js`
  - tab shell between `Whisk.js` and `WhiskVideos.js`, driven by `?tab=images|videos`
- `Whisk.js`
  - primary image studio coordinator
  - owns image gallery, prompt preview modal, video-launch modal, character/LoRA selector, prompt helper, CivitAI quick mode, and image/upload actions
- `WhiskVideos.js`
  - generated video gallery for the Forge video tab
  - owns preview loading, sharing, favoriting, and deletion of generated videos
- `Story.js`
  - story workspace with session bootstrap, preset picker, session switching, session-level LoRA switching, chat loop, on-demand illustration, and scene media handling
- `SharedLibrary.js`
  - community gallery for shared images and videos with search, favorites filter, lightbox, and in-place video playback
- `Director.js`
  - operations and admin surface
  - owns overview stats, queue prioritization, story-session pinning, home-page masonry portrait management, and character CRUD
- `StoryMusicLibrary.js`
  - sound vault
  - owns track upload, metadata tagging, search/filter, and playback into the global music dock
- `LoraManagement.js`
  - LoRA catalog and profiles
  - owns per-character profile drafts, image/video modality settings, and CivitAI catalog sync/search
- `AuthCallback.js`
  - Cognito callback

## 7. Supporting Components And Hooks
- Components:
  - `components/SolarisMasonry.js`
  - `components/shared/SolarisImageWall.js`
  - `components/shared/CharacterLoraSelector.js`
  - `components/story/StorySceneCard.js`
  - `components/music/SolarisMusicDock.js`
  - `components/music/SolarisTrackCard.js`
- Hooks:
  - `pages/whisk/hooks/useImageStudio.js`
  - `pages/whisk/hooks/useWhiskImages.js`
  - `pages/whisk/hooks/useWhiskVideos.js`
  - `pages/whisk/hooks/useVideoGeneration.js`
  - `pages/story/useSceneMedia.js`

### Component And Hook Roles
- `SolarisMasonry.js`
  - home-page animated portrait hero
  - falls back to `data/sol-masonry-defaults.json` when Director has no uploaded portraits
- `SolarisImageWall.js`
  - reusable auto-panning gallery with favorite, share, download, prompt-view, and video-generation actions
- `CharacterLoraSelector.js`
  - character -> LoRA profile cascade used by Forge
  - auto-selects a character default LoRA when available
- `StorySceneCard.js`
  - scene card for illustration, animation, soundtrack generation, and play-in-dock actions
- `useSceneMedia.js`
  - owns polling for story-scene animation and music jobs
- `useWhiskImages.js`
  - owns image gallery loading, caching, favorite toggles, and deletions for Forge
- `useWhiskVideos.js`
  - owns video gallery loading, caching, preview fetching, favorite toggles, and deletions for Forge
- `useImageStudio.js`
  - owns image-generation and upload state, model options, and prompt-helper integration
- `useVideoGeneration.js`
  - owns provider/model selection and video job submission for the selected source image

## 8. Service Layer Contract
All API access must go through `frontend/src/services/**`.

Key files:
- `apiClient.js`
- `runtime-config.js`
- `story.js`
- `operations.js`
- `lora.js`
- `images.js`
- `s3.js`
- `replicate.js`
- `bedrock.js`
- `civitai.js`
- `huggingface.js`
- `promptHelper.js`
- `characters.js`

### Service Ownership Map
- `operations.js`
  - Director overview/config APIs
  - Director masonry asset APIs
  - model capability/config lookups used by Forge and LoRA pages
- `story.js`
  - story sessions, story messages, story illustrations, story scene media, and story music library APIs
- `lora.js`
  - LoRA catalog, LoRA profiles, and CivitAI sync
- `characters.js`
  - character catalog and CRUD
- `s3.js`
  - sharing, favorites, shared-gallery listings, and direct S3 upload helpers
- `images.js`
  - selected-image handoff used when opening video generation from Forge
- `promptHelper.js`, `replicate.js`, `bedrock.js`, `civitai.js`, `huggingface.js`
  - underlying generation/provider helpers used by the Forge hooks

## 9. Frozen Invariants
- Preserve top-level story response handling:
  - `session`
  - `messages`
  - `scenes`
- Preserve Solaris class namespace.
- Preserve grouped route naming and legacy redirects.
- Preserve real Cognito auth flow.
- Use service-layer helpers instead of embedding new raw HTTP calls in page files.
- Preserve runtime config loading from `/config.json`; do not hardcode frontend/API/auth values in page code.
- Preserve Forge cache keys:
  - `whisk_images_cache`
  - `whisk_videos_cache`
- Preserve the global music-track object shape consumed by `MusicContext` and `SolarisMusicDock`:
  - `key`
  - `url`
  - `title`
  - `source`
  - `mood`
  - `energy`
  - `tempoBpm`
  - `tags`
  - `updatedAt`
- Preserve Story behavior where scene music is pushed into the shared dock, not played inline.
- Preserve Director ownership boundaries:
  - characters live in `Director.js`
  - LoRA profiles live in `LoraManagement.js`

## 10. Validation
- Required:
`npm --prefix frontend run build`
- Recommended while iterating:
`npm --prefix cdk run idea:ui-local -- --stage=design-fusion`
- Deploy when needed:
`npm --prefix cdk run idea:deploy -- --stage=design-fusion`

## 11. Known Risks
- Large page and hook files can make small changes harder to isolate.
- Story and director flows are sensitive to backend contract drift.
- `Whisk.js`, `Story.js`, `Director.js`, and `LoraManagement.js` are orchestration-heavy and easy to over-edit.
- The shared music dock depends on cross-page track-shape consistency.
- `frontend/src/index.css` is monolithic, so style regressions can leak across many pages if selectors are too broad.
