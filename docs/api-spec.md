# Whisk Studio API Specification

> Last updated: 2026-06-27

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

### Agent Mode (v1.7)

Agent mode is gated by the `agentMode` feature flag (Sanctum → Feature Flags), which is cohort-scoped
(`true|false|"all"|"admin"|"beta"`). When disabled for the caller, all `/api/agent/*` endpoints return
404 so the frontend can fall back gracefully. The same fleet also backs **companion mode** (full-viewport,
admin-refusing); `context.mode` (`"atelier"`/`"companion"`) tunes the system prompt.

#### Tool fleet (v1.7 — 9 tools)
| Tool | Type | Effect |
|------|------|--------|
| `generate_image` | server-dispatch | Kicks off a Replicate prediction. Synchronous fast-path when `Prefer: wait=5` returns `succeeded`. |
| `set_theme` | client-action | AgentContext applies via ThemeContext; persisted to `agentState.theme`. |
| `continue_story` | intent (requiresConfirm) | Frontend confirms → calls existing `POST /story/sessions/:id/message`, then navigates to `/chronicle?session=…`. |
| `illustrate_scene` | intent (requiresConfirm) | Frontend confirms → calls existing `POST /story/sessions/:id/illustrations`, then navigates to Chronicle. |
| `recall_favorites` | server-dispatch | Reads the user's recent `IMG` items, signs top-N URLs, returns prompts + thumbnails. Agent's closing turn comments on patterns. |
| `generate_music` | intent (requiresConfirm) | Story-scoped; falls back to most-recent session + last scene. Frontend confirms → calls existing `POST /story/sessions/:id/scenes/:sceneId/music`. Returns `no_active_scene` if the user has no story yet. |
| `browse_gallery` | server-dispatch | Lists recent public `shared/images/` keys via S3 `ListObjectsV2`, signs top-N URLs. Agent's closing turn comments on community trends. |
| `view_my_creations` | server-dispatch | Browse-framed view of the user's own recent `IMG` items (vs `recall_favorites`' pattern-spotting). |
| `what_can_you_do` | static (no LLM) | Returns a canned capability menu `{ title, items[] }` for new/lost users. |

Intent tools are **executed on confirm via existing story endpoints** — no new backend route required. The frontend's `useAgent().confirmIntent` posts directly with the user's auth token; the panel surfaces `executing → executed → opening Chronicle` states inline. A small `AgentIntentBanner` on the Chronicle page reads `localStorage["skr-agent-intent"]` on mount to acknowledge "Hiyori added this" on landing.

After any successful server-dispatch tool the backend runs a **second Bedrock turn** with the `toolResult` content block, capped at 120 tokens, to produce a closing sentence ("turned out softer than I expected — want more contrast?"). Skipped for `requiresConfirm` intents (nothing to react to yet) and for fully-failed tool calls.

The backend reads cross-session prefs from `AGENT#STATE` and injects them into the system prompt as `<prefs>lastStyle=…, lastAspect=…</prefs>` so the model biases tool defaults toward what the user has chosen before. Pref values are **enum-validated on read and write** (they re-enter the prompt — an unchecked value would be a self-injection vector).

#### v1.7 additions (endpoints + guardrails)
- **Named sessions** — `GET/POST/PATCH/DELETE /api/agent/sessions` (metadata at `AGENT#SESSION#{id}`).
  The `sessionId` doubles as the memory namespace, so `/turn` takes `sessionId` (legacy fallback `modelId`).
- **Admin model picker** — `GET/PUT /api/admin/agent/model` (override at `CONFIG#AGENT`, 60s cache;
  default `us.anthropic.claude-haiku-4-5-20251001-v1:0`). Both `/turn` and `/suggest` read through it.
- **Admin cost view** — `GET /api/admin/agent/cost` (scan of `AGENT#COST`, sorted by total tokens).
- **Guardrails** — per-user token bucket (`AGENT#RATE`) + **daily token cap** 200k/day (`AGENT#COST`,
  429 + `Retry-After`, `daily_cap_reached`) + **daily image cap** 50/day (`AGENT#IMG_COUNT`,
  `image_daily_cap_reached`). Image + token caps roll over independently.

#### POST /api/agent/turn
Auth: User
Request:
```json
{
  "messages": [{ "role": "user|assistant", "content": "..." }],
  "sessionId": "default",
  "context": { "page": "atelier", "mode": "atelier" }
}
```
Response (text-only turn):
```json
{ "text": "Picking anime at 3:4 — ikuyo!", "emotion": "happy", "hasMemory": true }
```
Response (tool-use turn):
```json
{
  "text": "Picking anime at 3:4 — ikuyo!",
  "emotion": "happy",
  "hasMemory": true,
  "toolCalls": [{
    "name": "generate_image",
    "args": { "prompt": "...", "style": "anime", "aspect": "3:4" },
    "result": {
      "provider": "replicate",
      "predictionId": "...",
      "batchId": "...",
      "imageName": "...",
      "status": "starting|succeeded",
      "imageUrl": "https://...",  // present only on synchronous fast-path succeed
      "prompt": "...",
      "style": "anime", "aspect": "3:4", "seed": 12345,
      "width": 768, "height": 1024
    },
    "error": null
  }]
}
```

The dispatcher uses a fast-path: when Replicate returns `succeeded` inside the `Prefer: wait=5` window, the backend writes the IMG row + signed URL synchronously and the frontend skips polling. Otherwise the frontend polls `/replicate/image/status` with the returned `predictionId/imageName/batchId/prompt`.

Errors surface as `toolCalls[].error` strings (`replicate_token_missing`, `replicate_create_failed`, `replicate_no_prediction`, `prompt_required`, `unauthorized`, `unknown_tool:<name>`). The frontend maps these to user-facing copy via `errorMessages.js`.

#### POST /api/agent/suggest (v1.3, expanded v1.4)
Auth: User. Returns a single suggested value for a Dashboard form field — powers the per-field "Let Hiyori choose" buttons.
Request:
```json
{ "field": "prompt|style|aspect|negativePrompt", "context": { "currentPrompt": "..." } }
```
Response:
```json
{ "field": "style", "value": "anime" }
```
Server-side normalisation:
- `style` → coerced to one of `[anime, manga, photoreal, chibi]` (defaults to `anime`).
- `aspect` → coerced to one of `[1:1, 3:4, 16:9]` (defaults to `3:4`).
- `prompt` / `negativePrompt` → strips wrapping quotes and any trailing `[EMOTION: …]` tags; capped at 200 chars.
Returns `502 empty_suggestion` if Bedrock returns nothing usable, `400 invalid_field` on unknown fields.

#### Rate limiting (v1.3)
Both `POST /api/agent/turn` and `POST /api/agent/suggest` are guarded by a per-user token bucket stored at `(USER#{userId}, AGENT#RATE)`. Defaults:
- `/api/agent/turn` — capacity 30, refill 1 token / 2s (sustains ~30 req/min, bursts to 30).
- `/api/agent/suggest` — capacity 60, refill 1 token / 1s (lighter call, more generous).

On allow: emits `X-RateLimit-Remaining` header. On deny: 429 + `Retry-After` (seconds) + `{ error: "rate_limited", retryAfterMs }` body. The limiter fails open on DynamoDB errors — never blocks traffic on infra hiccups.

#### Cohort scoping for `agentMode` (v1.4)
The `agentMode` flag value can now be one of:
- `true` / `"all"` — enabled for every user
- `false` — disabled
- `"admin"` — enabled only when `req.user.isAdmin === true`
- `"beta"` — enabled only when `req.user.roles` (or `groups`) includes `"beta"`
- Any other string — coerced to `true` (fail open — never accidentally lock users out)

Cohort gating is evaluated by `evaluateFlag(flags, "agentMode", req.user)` and applied identically at both `/api/agent/turn` and `/api/agent/suggest`. Future rollout strategy: ship a flag as `"admin"` first, expand to `"beta"`, then `"all"`.

#### Cost telemetry (v1.4)
Both `/api/agent/turn` and `/api/agent/suggest` capture Bedrock `usage` tokens (input + output) and atomically increment the per-user record at `(USER#{userId}, AGENT#COST)` via `UpdateExpression: ADD inputTokens :i, outputTokens :o, turnCount :one`. Token counts are also surfaced on the per-turn structured log line so CloudWatch Insights can compute totals on the fly.

DynamoDB shape:
```json
{ "pk": "USER#u1", "sk": "AGENT#COST", "inputTokens": 12450, "outputTokens": 980, "turnCount": 38, "lastUpdatedAt": 1715464800000 }
```

#### Latency logging (v1.3, expanded v1.4)
`POST /api/agent/turn` emits a single JSON log line on every terminal path:
```json
{ "event": "agent.turn", "latencyMs": 1842, "status": 200, "outcome": "ok", "toolCount": 1, "tools": "generate_image", "closingTurn": true, "stopReason": "tool_use", "hasMemory": true }
```
CloudWatch Insights query example:
```
filter event = "agent.turn"
| stats avg(latencyMs), pct(latencyMs, 50), pct(latencyMs, 95) by outcome
```

#### Agent sessions (v1.7)
Multiple parallel conversation threads per user. The session id IS the memory namespace — the frontend mints a uuid and uses it directly as `sessionId` on `/api/agent/turn`, which routes to the existing `AGENT#{sessionId}#MSG#{ts}` memory layout. The implicit `"default"` session is always available without a metadata record.

Sessions are gated by the `agentMode` flag + cohort scoping (same as `/turn`).

DynamoDB shape:
```json
{ "pk": "USER#u1", "sk": "AGENT#SESSION#myproj", "name": "My Project", "createdAt": 1715464800000, "lastUsedAt": 1715465100000 }
```

##### GET /api/agent/sessions
Auth: User. Lists the user's sessions sorted by `lastUsedAt` desc.
Response: `{ items: [{ sessionId, name, createdAt, lastUsedAt }] }`

##### POST /api/agent/sessions
Auth: User. Creates a session with the client-minted id.
Request: `{ sessionId: string, name: string }`
Response: `{ session: { sessionId, name, createdAt, lastUsedAt } }`. Session ids must match `[a-zA-Z0-9_-]+` (lowercased server-side); duplicates return the existing record without overwriting. The reserved `"default"` id is rejected.

##### PATCH /api/agent/sessions/:id
Auth: User. Renames an existing session.
Request: `{ name: string }`
Response: `{ session: { sessionId, name } }` or `404 session_not_found`.

##### DELETE /api/agent/sessions/:id
Auth: User. Removes the metadata record AND wipes the conversation memory at `AGENT#{id}#MSG#...`. The reserved `"default"` id is rejected (delete `/api/agent/memory?sessionId=default` to wipe its history instead).
Response: `{ ok: true }`

##### POST /api/agent/turn — sessionId support
`/turn` now reads `body.sessionId` (falls back to legacy `body.modelId`) as the memory namespace key. Bumps the session's `lastUsedAt` after a successful turn so the picker sorts by recency. `/api/agent/memory/status` and `DELETE /api/agent/memory` also accept `sessionId` as a query param.

#### GET /api/admin/agent/model (v1.6)
Auth: Public (read). Returns the currently active Bedrock model id and the env-backed default.
Response: `{ modelId: "us.anthropic.claude-haiku-4-5-...", default: "us.anthropic.claude-haiku-4-5-..." }`

#### PUT /api/admin/agent/model (v1.6)
Auth: User + Admin. Persists the agent's Bedrock model id at `(CONFIG#AGENT, CONFIG#AGENT)`. Empty / whitespace-only input resets to the env default and returns `reset: true`. 60s cache TTL on the read path.
Request: `{ modelId: string }`
Response: `{ modelId: string, reset: boolean }`

#### Daily token cap (v1.6)
`POST /api/agent/turn` enforces a per-user daily cap (default 200k tokens/day, ~$0.20 at Haiku 4.5 prices) on top of the v1.3 request bucket. The check runs after rate-limit but before Bedrock, using `agentCost.checkDailyCap`. Counter resets at UTC midnight via `dayStartedAt` rollover. Fails open on DB errors.

On deny: `429 daily_cap_reached` + `Retry-After` header (ms until UTC midnight) + body `{ tokensToday, capacity, retryAfterMs }`. Frontend `errorMessages.js` maps to "You've used up your daily token budget. Resets at midnight UTC."

#### GET /api/admin/agent/cost (v1.5)
Auth: User + Admin. Scans every `AGENT#COST` record in the table and returns per-user totals sorted by `inputTokens + outputTokens` descending.
Query: `?limit=<1-200>` (default 50; over-fetched at 2× internally so sorting picks the right top-N).
Response:
```json
{
  "items": [
    { "userId": "...", "inputTokens": 12450, "outputTokens": 980, "turnCount": 38, "totalTokens": 13430, "lastUpdatedAt": 1715464800000 }
  ],
  "scannedCount": 124,
  "truncated": false
}
```
Backed by a `ScanCommand` with `FilterExpression: sk = "AGENT#COST"` (no GSI). Pagination capped at 10 internal pages so a misuse can't burn capacity. The frontend `AgentCostSection` in Sanctum renders this as a sortable table with a rough USD-cost estimate (Claude Haiku pricing constants client-side; "good enough to spot outliers", not billing).

#### GET /api/agent/memory/status
Auth: Optional User
Query: `?modelId=<id>` (default `"default"`)
Response: `{ hasMemory: boolean; turnCount?: number }`

#### DELETE /api/agent/memory
Auth: User
Query: `?modelId=<id>` (default `"default"`)
Response: `{ ok: boolean }`

DynamoDB shape (single-table, separate from `COMPANION#`):
- `pk = USER#{userId}`, `sk = AGENT#{modelId}` → state record `{ summary, turnCount, updatedAt }`
- `pk = USER#{userId}`, `sk = AGENT#{modelId}#MSG#{ts13}` → turn message `{ role, content, toolCalls?, createdAt }`
- `pk = USER#{userId}`, `sk = AGENT#STATE` → cross-session prefs `{ lastStyle, lastAspect, lastLora, theme, updatedAt }` (single record per user, not per model — written via best-effort `agentState.patch` after successful tool dispatch)

`turnCount` increments atomically via `UpdateExpression: ADD turnCount :n` (eliminates the read-modify-write race between concurrent saves). Rolling summary compaction kicks in at `turnCount > 30`. `toolCalls` is persisted on assistant messages so the agent can reference past results in summary generation. Compaction summariser tokens are billed to `AGENT#COST` (so they count against the user's daily token cap).

#### Daily caps and rate limits

- **Per-request rate limit**: token bucket per user, capacity 30, refill 1/2s on `/turn`; capacity 60, refill 1/s on `/suggest`. Returns 429 with `Retry-After` header. Module: `backend/lib/agent-rate-limit.js`.
- **Daily token cap**: 200,000 tokens/day (UTC-midnight rollover) on `/turn` Bedrock spend (initial + closing Converse + compaction summariser). Returns 429 with `error: "daily_cap_reached"` and `Retry-After`.
- **Daily image cap**: 50 image generations/day (UTC-midnight rollover) on `generate_image` tool calls. Bounds Replicate spend, the dominant cost driver (~90% of total). Returns `{ok: false, error: "image_daily_cap_reached", capacity, imagesToday, retryAfterMs}` in the tool result. Module: `backend/lib/agent-cost.js`.

#### Sessionid sanitisation

The `sessionId` query/body param is normalised through `sanitiseSessionId` (`[a-zA-Z0-9_-]+`, lowercased, ≤80 chars). Values outside this set fall back to `"default"`. This blocks injection of `#MSG#`-style fragments into the SK namespace.

#### Pref value validation

`AGENT#STATE` writes are gated by `validatePrefValue` (`backend/lib/agent-state.js`). Each known key has an enum:
- `lastStyle` ∈ {anime, manga, photoreal, chibi}
- `lastAspect` ∈ {1:1, 3:4, 16:9}
- `theme` ∈ the 10 Sakura Bloom themes
- `lastLora` matches `^[a-zA-Z0-9_\-:./]{1,120}$`

Unknown keys and values that fail validation are silently dropped on both write AND read (older records pre-validator are filtered at read time). The field flows into the next turn's system prompt, so an unchecked value would enable self-targeted prompt injection.

#### Slash commands (composer power-user shortcuts, v1.6)

Implemented in `frontend/src/lib/agent/slashCommands.js`. Parsed locally — most commands execute without a server round-trip.

| Command | Behaviour | Server call? |
|---|---|---|
| `/help` | Renders the command list inline as a canned agent panel. | No |
| `/clear`, `/reset` | Wipes the local turn stream. | No |
| `/theme <name>` | Switches theme directly. Validates against the 10 theme enum. | No |
| `/recall [n]` | Rewrites to "Show me my recent {n} generations" and submits as a normal turn (1–12, default 8). | Yes — triggers `recall_favorites` tool. |
| `/reroll` | Re-submits the last user prompt verbatim. | Yes — normal `/turn` call. |

Unknown commands fall through to a normal user turn (no special handling).

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
