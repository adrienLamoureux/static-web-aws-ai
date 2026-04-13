# Whisk Studio API Specification

> Last updated: 2026-04-06

## Two Domains — One API, One CDN

When using Whisk Studio you will see network requests going to two different domains:

| Domain | What it is | Example |
|--------|-----------|---------|
| `k002t5i8r9.execute-api.us-east-1.amazonaws.com` | **API Gateway** — the backend REST API (Lambda) | `/prod/story/sessions` |
| `d2l9b1xmucsb19.cloudfront.net` | **CloudFront CDN** — the React frontend (static files) | `/index.html`, `/config.json` |

These are not two separate APIs. CloudFront serves the frontend bundle; the frontend then calls the API Gateway for all data. Both exist for every deployed stack.

---

## Base URL

Production: `https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod`

## Authentication

Bearer token via `Authorization: Bearer <jwt>` header.
JWT is a Cognito `idToken` obtained from the PKCE OAuth flow via the Hosted UI.

Access tiers:
- **Public** — no token required
- **User** — valid Cognito `idToken`
- **Admin** — valid `idToken` + Cognito `admin` group membership

### How the gateway enforces tiers

1. **No token** → API Gateway passes the request through as anonymous → Express applies per-route middleware. Public routes respond normally; User and Admin routes return **401**.
2. **Valid token** → API Gateway verifies the JWT and injects the user identity into the request context → Express reads it via `req.user`.
3. **Invalid or expired token** → API Gateway rejects the request before it reaches Express → **403** from the gateway.

> **Frontend note:** The frontend checks token expiry before mounting any protected component. If a token expires mid-session, a `whisk:auth:expired` event clears auth state and redirects to the login screen.

---

## Endpoints

### Health

#### GET /
Auth: Public
Response: `{ message: string }`

#### GET /health
Auth: Public
Response: `{ status: "ok" }`

#### GET /hello/:name
Auth: Public
Response: `{ message: string }` (greeting incorporating `:name`)

---

### Prompt Helper

#### GET /prompt-helper/options
Auth: Public
Response: `{ options: PromptHelperOptionSet[] }`
```ts
interface PromptHelperOptionSet {
  id: string;
  label: string;
  choices: string[];
}
```

#### POST /bedrock/prompt-helper
Auth: Public
Request: `{ prompt: string; style?: string; mood?: string }`
Response: `{ suggestions: string[] }`

---

### Media — Images

#### GET /s3/shared/images
Auth: Public
Response: `{ images: SharedImage[] }`
```ts
interface SharedImage { key: string; url: string; sharedBy: string; createdAt: string; }
```

#### GET /s3/shared/images/favorites
Auth: User
Response: `{ favorites: string[] }` (list of S3 keys)

#### POST /s3/shared/images/favorites
Auth: User
Request: `{ key: string; action: "add" | "remove" }`
Response: `{ success: boolean }`

#### GET /s3/images
Auth: User
Response: `{ images: UserImage[] }`
```ts
interface UserImage { key: string; url: string; createdAt: string; provider?: string; }
```

#### POST /s3/image-upload-url
Auth: User
Request: `{ filename: string; contentType: string }`
Response: `{ uploadUrl: string; key: string }`

#### POST /s3/images/share
Auth: User
Request: `{ key: string }`
Response: `{ success: boolean; sharedKey: string }`

#### POST /s3/images/delete
Auth: User
Request: `{ key: string }`
Response: `{ success: boolean }`

#### POST /images/video-ready
Auth: User
Request: `{ key: string }`
Response: `{ success: boolean }`

#### POST /images/select
Auth: User
Request: `{ predictionId: string; index: number }`
Response: `{ key: string; url: string }`

---

### Media — Videos

#### GET /s3/shared/videos
Auth: Public
Response: `{ videos: SharedVideo[] }`
```ts
interface SharedVideo { key: string; url: string; sharedBy: string; createdAt: string; }
```

#### GET /s3/videos
Auth: User
Response: `{ videos: UserVideo[] }`
```ts
interface UserVideo { key: string; createdAt: string; }
```

#### GET /s3/video-url
Auth: User
Query: `?key=<s3-key>`
Response: `{ url: string }` (pre-signed streaming URL)

#### POST /s3/videos/share
Auth: User
Request: `{ key: string }`
Response: `{ success: boolean }`

#### POST /s3/videos/delete
Auth: User
Request: `{ key: string }`
Response: `{ success: boolean }`

---

### Image Generation

#### POST /bedrock/image/generate
Auth: User
Request: `{ prompt: string; negativePrompt?: string; modelId?: string; width?: number; height?: number }`
Response: `{ key: string; url: string }`

#### POST /replicate/image/generate
Auth: User
Request: `{ prompt: string; modelId?: string; loraUrl?: string; [extra: string]: unknown }`
Response: `{ predictionId: string }`

#### GET /replicate/image/status
Auth: User
Query: `?predictionId=<id>`
Response: `{ status: "starting"|"processing"|"succeeded"|"failed"; urls?: string[] }`

#### POST /civitai/image/generate
Auth: User
Request: `{ prompt: string; modelId?: string; [extra: string]: unknown }`
Response: `{ jobId: string }`

#### GET /civitai/image/status
Auth: User
Query: `?jobId=<id>`
Response: `{ status: string; images?: string[] }`

#### POST /gradio/image/generate
Auth: User
Request: `{ prompt: string; endpoint?: string; [extra: string]: unknown }`
Response: `{ url: string }`

---

### Video Generation

#### POST /replicate/video/generate
Auth: User
Request: `{ imageKey: string; modelId?: string; [extra: string]: unknown }`
Response: `{ predictionId: string }`

#### GET /replicate/video/status
Auth: User
Query: `?predictionId=<id>`
Response: `{ status: string; url?: string }`

#### POST /bedrock/nova-reel/image-to-video-s3
Auth: User
Request: `{ imageKey: string; prompt?: string; durationSeconds?: number }`
Response: `{ jobId: string }`

#### GET /bedrock/nova-reel/job-status
Auth: User
Query: `?jobId=<id>`
Response: `{ status: string; outputKey?: string; outputUrl?: string }`

---

### Story — Sessions

#### GET /story/presets
Auth: Public
Response: `{ presets: StoryPreset[] }`
```ts
interface StoryPreset { id: string; title: string; description: string; genre: string; }
```

#### GET /story/characters
Auth: Public
Response: `{ characters: StoryCharacter[] }`
```ts
interface StoryCharacter { id: string; name: string; description: string; imageUrl?: string; }
```

#### GET /story/sessions
Auth: User
Response: `{ sessions: StorySessionSummary[] }`

#### POST /story/sessions
Auth: User
Request: `{ presetId: string; title?: string; characterId?: string }`
Response: `{ session: StorySession; messages: StoryMessage[]; scenes: StoryScene[] }`
```ts
interface StorySession { id: string; title: string; presetId: string; createdAt: string; }
interface StoryMessage { role: "user"|"assistant"; content: string; createdAt: string; }
interface StoryScene { id: string; content: string; order: number; imageUrl?: string; createdAt: string; }
```

#### GET /story/sessions/:id
Auth: User
Response: `{ session: StorySession; messages: StoryMessage[]; scenes: StoryScene[] }`
Note: `messages` and `scenes` are top-level keys, not nested inside `session`.

#### DELETE /story/sessions/:id
Auth: User
Response: `{ success: boolean }`

#### DELETE /story/sessions
Auth: User
Request: `{ ids: string[] }`
Response: `{ deleted: number }`

#### PATCH /story/sessions/:id/lora
Auth: User
Request: `{ loraProfileId: string | null }`
Response: `{ success: boolean }`

#### POST /story/sessions/:id/message
Auth: User
Request: `{ content: string; modelId?: string }`
Response: `{ message: StoryMessage; scene?: StoryScene }`

---

### Story — Illustrations & Animation

#### POST /story/sessions/:id/illustrations
Auth: User
Request: `{ sceneIds?: string[]; modelId?: string }`
Response: `{ queued: number }`

#### POST /story/sessions/:id/scenes/:sceneId/animation
Auth: User
Request: `{ imageKey: string; style?: string }`
Response: `{ jobId: string }`

#### GET /story/sessions/:id/scenes/:sceneId/animation
Auth: User
Response: `{ status: string; url?: string }`

---

### Story — Music

#### GET /story/music-library
Auth: User
Response: `{ tracks: MusicTrack[] }`
```ts
interface MusicTrack { id: string; title: string; url: string; duration?: number; createdAt: string; }
```

#### POST /story/music-library/upload-url
Auth: User
Request: `{ filename: string; contentType: string }`
Response: `{ uploadUrl: string; key: string }`

#### POST /story/music-library/upload
Auth: User
Request: `{ key: string; title: string }`
Response: `{ track: MusicTrack }`

#### POST /story/sessions/:id/scenes/:sceneId/music
Auth: User
Request: `{ mood?: string; description?: string; modelId?: string }`
Response: `{ jobId: string }`

#### GET /story/sessions/:id/scenes/:sceneId/music
Auth: User
Response: `{ status: string; url?: string; trackId?: string }`

#### POST /story/sessions/:id/scenes/:sceneId/music/favorite
Auth: User
Request: `{ trackId: string; favorite: boolean }`
Response: `{ success: boolean }`

#### POST /story/sessions/:id/scenes/:sceneId/music/recommend
Auth: User
Request: `{ sceneContent: string }`
Response: `{ recommendation: string; mood: string }`

#### POST /story/sessions/:id/scenes/:sceneId/music/select
Auth: User
Request: `{ trackId: string }`
Response: `{ success: boolean }`

---

### LoRA

#### GET /lora/catalog
Auth: User
Response: `{ models: LoraModel[] }`
```ts
interface LoraModel { id: string; name: string; url: string; triggerWords?: string[]; previewUrl?: string; }
```

#### POST /lora/catalog/sync/civitai
Auth: User
Response: `{ synced: number }`

#### GET /lora/profiles
Auth: User
Response: `{ profiles: LoraProfile[] }`
```ts
interface LoraProfile { characterId: string; name: string; loraUrl: string; weight?: number; }
```

#### POST /lora/profiles
Auth: User
Request: `{ name: string; loraUrl: string; characterId?: string; weight?: number }`
Response: `{ profile: LoraProfile }`

#### GET /lora/profiles/:characterId
Auth: User
Response: `{ profile: LoraProfile }`

#### PUT /lora/profiles/:characterId
Auth: User
Request: `Partial<LoraProfile>`
Response: `{ profile: LoraProfile }`

#### DELETE /lora/profiles/:profileId
Auth: User
Response: `{ success: boolean }`

---

### Characters

#### GET /characters
Auth: User
Response: `{ characters: Character[] }`
```ts
interface Character { id: string; name: string; description: string; imageUrl?: string; }
```

#### POST /characters
Auth: User
Request: `{ name: string; description: string; imageUrl?: string }`
Response: `{ character: Character }`

#### GET /characters/:id
Auth: User
Response: `{ character: Character }`

#### PUT /characters/:id
Auth: User
Request: `Partial<Character>`
Response: `{ character: Character }`

#### DELETE /characters/:id
Auth: User
Response: `{ success: boolean }`

---

### Companion

#### POST /api/companion/chat
Auth: Public (memory personalisation requires auth)
Request:
```ts
{
  messages: Array<{ role: "user"|"assistant"; content: string }>;
  context: { page: string; isAuthenticated: boolean };
  modelId?: string;
}
```
Response:
```ts
{
  text: string;
  emotion: "happy"|"sad"|"surprised"|"thinking"|"neutral";
  generation?: { type: "image"|"navigate"|"story"|"music"; payload: string };
  hasMemory?: boolean;
}
```

#### POST /api/companion/proactive
Auth: Public
Request: `{ trigger: string; context: { page: string; recentAction?: string } }`
Response: `{ text: string; emotion: string }`

#### POST /api/companion/initiative
Auth: Public
Request: `{ context: { page: string }; memory?: string }`
Response: `{ text: string; emotion: string }`

#### GET /api/companion/memory/status
Auth: Optional User
Response: `{ hasMemory: boolean; turnCount?: number }`

#### DELETE /api/companion/memory
Auth: User
Query: `?modelId=<model-id>`
Response: `{ success: boolean }`

#### GET /api/admin/companion-model
Auth: Public
Response: `{ modelId: string; config: object }`

#### PUT /api/admin/companion-model
Auth: Admin
Request: `{ modelId: string; config?: object }`
Response: `{ success: boolean }`

---

### Operations & Admin

#### GET /ops/director/masonry/images
Auth: Public
Response: `{ images: MasonryImage[] }`
```ts
interface MasonryImage { key: string; url: string; title?: string; }
```

#### GET /ops/dashboard
Auth: Admin
Response: `{ summary: object }`

#### GET /ops/director/config
Auth: Admin
Response: `{ config: object }`

#### POST /ops/director/config
Auth: Admin
Request: `{ config: object }`
Response: `{ success: boolean }`

#### GET /ops/director/app-config
Auth: Admin
Response: `{ config: object }`

#### POST /ops/director/app-config
Auth: Admin
Request: `{ config: object }`
Response: `{ success: boolean }`

#### POST /ops/director/masonry/upload-url
Auth: Admin
Request: `{ filename: string; contentType: string }`
Response: `{ uploadUrl: string; key: string }`

#### POST /ops/director/masonry/images/delete
Auth: Admin
Request: `{ key: string }`
Response: `{ success: boolean }`

#### GET /ops/director/overview
Auth: Admin
Response: `{ overview: object }`

#### POST /ops/director/jobs/prioritize
Auth: Admin
Request: `{ jobId: string; priority: number }`
Response: `{ success: boolean }`

#### POST /ops/director/story/sessions/pin
Auth: Admin
Request: `{ sessionId: string; pinned: boolean }`
Response: `{ success: boolean }`

#### POST /ops/director/sound/normalize
Auth: Admin
Request: `{ trackKey: string }`
Response: `{ success: boolean; normalizedKey?: string }`
