# API Access Reference

> Last updated: 2026-03-27

This document maps every backend API endpoint to its access level, explains the two-domain
architecture, and describes what access is required to call each route.

---

## Two Domains — One API, One CDN

When using Whisk Studio you will see network requests going to two different domains:

| Domain | What it is | Example |
|--------|-----------|---------|
| `k002t5i8r9.execute-api.us-east-1.amazonaws.com` | **API Gateway** — the backend REST API (Lambda) | `/prod/story/sessions` |
| `d2lepwk3t4buta.cloudfront.net` | **CloudFront CDN** — the React frontend (static files) | `/index.html`, `/config.json` |

These are not two separate APIs. CloudFront serves the frontend bundle; the frontend then
calls the API Gateway for all data. Both exist for every deployed stack.

---

## Access Levels

Every endpoint falls into one of three tiers:

| Tier | Token required | Who can call it |
|------|---------------|-----------------|
| **Public** | No | Anyone, including unauthenticated visitors |
| **User** | Yes — valid Cognito `idToken` | Any signed-in Whisk Studio account |
| **Admin** | Yes — Cognito `idToken` + `admin` group membership | Admin accounts only |

### How the gateway enforces this

1. **No token** → API Gateway passes the request through as anonymous → Express applies
   per-route middleware. Public routes respond normally; User and Admin routes return **401**.
2. **Valid token** → API Gateway verifies the JWT and injects the user identity into the
   request context → Express reads it via `req.user`.
3. **Invalid or expired token** → API Gateway rejects the request before it reaches Express
   → **403** from the gateway.

> **Frontend note:** The design-sakura frontend checks token expiry before mounting any
> protected component. If a token expires mid-session, a `whisk:auth:expired` event clears
> auth state and redirects to the login screen.

---

## Endpoint Inventory

### Health & Utilities

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/` | Public | Root health check |
| GET | `/health` | Public | Health check endpoint |
| GET | `/hello/:name` | Public | Smoke-test greeting |
| GET | `/prompt-helper/options` | Public | Lists available prompt-helper option sets |
| POST | `/bedrock/prompt-helper` | Public | Generates prompt suggestions via Bedrock |

---

### Media — Images

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/s3/shared/images` | **Public** | Browse all publicly shared images |
| GET | `/s3/shared/images/favorites` | User | List your favorited shared images |
| POST | `/s3/shared/images/favorites` | User | Add or remove a shared image from favorites |
| GET | `/s3/images` | User | List your own private images |
| POST | `/s3/image-upload-url` | User | Request a pre-signed S3 URL to upload an image |
| POST | `/s3/images/share` | User | Share one of your images publicly |
| POST | `/s3/images/delete` | User | Delete one of your images |
| POST | `/images/video-ready` | User | Mark an image as ready for video generation |
| POST | `/images/select` | User | Select an image from a generation result |

---

### Media — Videos

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/s3/shared/videos` | **Public** | Browse all publicly shared videos |
| GET | `/s3/videos` | User | List your own private videos |
| GET | `/s3/video-url` | User | Get a signed URL to stream a private video |
| POST | `/s3/videos/share` | User | Share one of your videos publicly |
| POST | `/s3/videos/delete` | User | Delete one of your videos |

---

### Image Generation

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/bedrock/image/generate` | User | Generate an image via Amazon Bedrock (Nova Canvas / Titan) |
| POST | `/replicate/image/generate` | User | Generate an image via Replicate |
| GET | `/replicate/image/status` | User | Poll a Replicate image generation job |
| POST | `/civitai/image/generate` | User | Generate an image via CivitAI |
| GET | `/civitai/image/status` | User | Poll a CivitAI generation job |
| POST | `/gradio/image/generate` | User | Generate an image via a Gradio endpoint |

---

### Video Generation

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/replicate/video/generate` | User | Generate a video via Replicate |
| GET | `/replicate/video/status` | User | Poll a Replicate video generation job |
| POST | `/bedrock/nova-reel/image-to-video-s3` | User | Generate a video from an image via Nova Reel |
| GET | `/bedrock/nova-reel/job-status` | User | Poll a Nova Reel generation job |

---

### Story — Sessions & Messages

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/story/presets` | **Public** | List available story presets |
| GET | `/story/characters` | **Public** | List available story characters |
| GET | `/story/sessions` | User | List your story sessions |
| POST | `/story/sessions` | User | Create a new story session |
| GET | `/story/sessions/:id` | User | Get a session with its messages and scenes |
| DELETE | `/story/sessions/:id` | User | Delete a story session |
| DELETE | `/story/sessions` | User | Bulk-delete story sessions |
| PATCH | `/story/sessions/:id/lora` | User | Update the LoRA profile attached to a session |
| POST | `/story/sessions/:id/message` | User | Send a message to the story AI |

---

### Story — Scenes & Illustrations

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/story/sessions/:id/illustrations` | User | Generate illustrations for a session's scenes |
| POST | `/story/sessions/:id/scenes/:sceneId/animation` | User | Start animation generation for a scene |
| GET | `/story/sessions/:id/scenes/:sceneId/animation` | User | Poll animation status for a scene |

---

### Story — Music

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/story/music-library` | User | Browse your uploaded soundtrack library |
| POST | `/story/music-library/upload-url` | User | Request a pre-signed URL to upload a soundtrack |
| POST | `/story/music-library/upload` | User | Confirm and register an uploaded soundtrack |
| POST | `/story/sessions/:id/scenes/:sceneId/music` | User | Generate music for a scene |
| GET | `/story/sessions/:id/scenes/:sceneId/music` | User | Poll music generation status for a scene |
| POST | `/story/sessions/:id/scenes/:sceneId/music/favorite` | User | Favorite or unfavorite a scene's track |
| POST | `/story/sessions/:id/scenes/:sceneId/music/recommend` | User | Get a music recommendation for a scene |
| POST | `/story/sessions/:id/scenes/:sceneId/music/select` | User | Assign a library track to a scene |

---

### LoRA Catalog & Profiles

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/lora/catalog` | User | List the LoRA model catalog |
| POST | `/lora/catalog/sync/civitai` | User | Sync the catalog from CivitAI |
| GET | `/lora/profiles` | User | List your LoRA character profiles |
| POST | `/lora/profiles` | User | Create a new LoRA profile |
| GET | `/lora/profiles/:characterId` | User | Get a specific LoRA profile |
| PUT | `/lora/profiles/:characterId` | User | Update a LoRA profile |
| DELETE | `/lora/profiles/:profileId` | User | Delete a LoRA profile |

---

### Characters

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/characters` | User | List all characters |
| POST | `/characters` | User | Create a character |
| GET | `/characters/:id` | User | Get a character |
| PUT | `/characters/:id` | User | Update a character |
| DELETE | `/characters/:id` | User | Delete a character |

---

### Companion (Hiyori)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/api/companion/chat` | **Public** | Send a message to the companion AI (Bedrock Haiku). Returns `{ text, emotion }`. |
| GET | `/api/admin/companion-model` | **Public** | Read the currently active companion Live2D model config. |
| PUT | `/api/admin/companion-model` | Admin | Update the active companion model config. |

> The companion chat and model-read routes bypass the Lambda authorizer entirely
> (API Gateway `AuthorizationType.NONE`) so they work for all visitors, including
> unauthenticated ones on the public home page.

---

### Operations & Admin

All operations routes require **Admin** access unless noted.

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/ops/director/masonry/images` | **Public** | Fetch the curated home-page masonry image grid |
| GET | `/ops/dashboard` | Admin | Operations dashboard summary |
| GET | `/ops/director/config` | Admin | Read the director config |
| POST | `/ops/director/config` | Admin | Update the director config |
| GET | `/ops/director/app-config` | Admin | Read the app-level config |
| POST | `/ops/director/app-config` | Admin | Update the app-level config |
| POST | `/ops/director/masonry/upload-url` | Admin | Get a pre-signed URL to upload a masonry image |
| POST | `/ops/director/masonry/images/delete` | Admin | Delete a masonry image |
| GET | `/ops/director/overview` | Admin | High-level ops overview |
| POST | `/ops/director/jobs/prioritize` | Admin | Reprioritize generation jobs |
| POST | `/ops/director/story/sessions/pin` | Admin | Pin a story session in the director view |
| POST | `/ops/director/sound/normalize` | Admin | Normalize audio levels for a track |

---

## Summary — Public Endpoints at a Glance

These are the only endpoints that work without any authentication token:

| Path | Notes |
|------|-------|
| `GET /` | Health check |
| `GET /health` | Health check |
| `GET /hello/:name` | Smoke test |
| `GET /prompt-helper/options` | Prompt options |
| `POST /bedrock/prompt-helper` | Prompt suggestions |
| `GET /s3/shared/images` | Public image gallery |
| `GET /s3/shared/videos` | Public video gallery |
| `GET /story/presets` | Story preset list |
| `GET /story/characters` | Story character list |
| `POST /api/companion/chat` | Companion AI chat |
| `GET /api/admin/companion-model` | Companion model config (read) |
| `GET /ops/director/masonry/images` | Home-page masonry grid |
