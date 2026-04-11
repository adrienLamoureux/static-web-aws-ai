# Live2D Companion (Hiyori) Integration Redesign

> Status: APPROVED PLAN — Ready for implementation
> Date: 2026-03-26
> Branches: `codex/design-sakura/code` (frontend), `codex/dev` (backend)

## Context

The Sakura design variant has a first Live2D integration with Hiyori that is currently **hidden** (`display: none` in `CharacterWalker.js`). The implementation is a walking character that bounces across the screen — not aligned with the VTuber-style companion vision. The companion dialog (`CompanionDialog.js`) is a single-shot "greet" bubble with no contextual awareness. This plan redesigns the Live2D integration into a proper VTuber-style companion panel that is deeply integrated with the website, reactive to user actions, and abstracted enough to support future model swaps.

### Current State Summary

- **CharacterWalker.js** (`frontend/src/components/sakura/CharacterWalker.js`): Full-width 280px canvas, character walks left/right at 1.2px/frame, bounces off edges. Canvas has `display: "none"`. Uses pixi.js@6 + pixi-live2d-display@0.4.0 (Cubism4 path). `autoInteract: false`.
- **CompanionDialog.js** (`frontend/src/components/sakura/CompanionDialog.js`): Speech bubble, hardcoded `{ message: "greet" }` to `POST /api/companion/chat`. Receives `emotion` field but ignores it. Auto-closes after 10s.
- **companion-route.js** (`backend/routes/companion-route.js`): Bedrock Haiku, system prompt with warm personality, returns `{ text, emotion }`. Emotion ∈ {happy, sad, surprised, thinking, neutral}. No auth.
- **Hiyori model**: 29 parameters, 8 motions in 6 groups (Idle×3, Flick, FlickDown, Tap, Tap@Body, Flick@Body). NO expression files (free tier). Single "Body" hit area. Physics: hair, skirt, ribbons.
- **Assets**: `frontend/public/live2d/hiyori/runtime/` — moc3, physics, cdi, 1 texture atlas (2048px), 8 motion files. Cubism Core loaded in `<head>`.
- **Known issues**: Canvas hidden but PIXI still initializes; emotion field unused; companion route not deployed to sakura stack; CDK Lambda timeout with Live2D assets.

---

## Phase 1 — Companion Abstraction Layer

> Goal: Decouple Live2D rendering from Hiyori-specific logic so models can be swapped.

### 1.1 Model Manifest Format

Create `frontend/src/lib/live2d/model-registry.js`:

```js
// Each model entry defines everything needed to load + animate a model
const MODELS = [
  {
    id: "hiyori_free",
    name: "Hiyori Momose",
    thumbnail: "/live2d/hiyori/thumb.png",
    modelPath: "/live2d/hiyori/runtime/hiyori_free_t08.model3.json",
    cubismVersion: 4,       // pixi-live2d-display import path
    scale: 0.85,            // target height ratio within canvas
    anchor: { x: 0.5, y: 1 },
    emotionMap: {            // backend emotion → parameter overrides
      happy:     { ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1, ParamCheek: 1 },
      sad:       { ParamEyeLOpen: 0.4, ParamEyeROpen: 0.4, ParamBrowLForm: -0.5, ParamBrowRForm: -0.5, ParamMouthForm: -0.5 },
      surprised: { ParamEyeLOpen: 1.2, ParamEyeROpen: 1.2, ParamBrowLForm: 0.5, ParamBrowRForm: 0.5, ParamMouthOpenY: 0.6 },
      thinking:  { ParamEyeBallX: -0.3, ParamEyeBallY: 0.2, ParamBrowLForm: 0.3, ParamAngleZ: -5 },
      neutral:   {}  // default resting state
    },
    motionMap: {             // semantic action → motion group name
      idle: "Idle",
      greet: "Tap",
      react: "Flick",
      acknowledge: "Tap@Body",
      dismiss: "FlickDown"
    },
    lookAt: {                // cursor tracking config
      headWeight: { x: 30, y: 20 },   // degrees mapped to ParamAngleX/Y
      eyeWeight:  { x: 1, y: 1 },     // mapped to ParamEyeBallX/Y
      smoothing: 0.15                  // lerp factor per frame
    }
  }
];

export function getModelById(id) { return MODELS.find(m => m.id === id); }
export function getDefaultModel() { return MODELS[0]; }
export function getAllModels() { return MODELS; }
```

### 1.2 Live2D Engine Service

Create `frontend/src/lib/live2d/Live2DEngine.js` — a class that owns the PIXI Application and Live2DModel lifecycle:

**Constructor**: `new Live2DEngine(canvasElement)`
- Creates PIXI.Application targeting the canvas with `backgroundAlpha: 0`, `antialias: true`, `autoDensity: true`, `resolution: devicePixelRatio`

**Methods**:
- `async loadModel(manifestEntry)` — disposes current model if any, calls `Live2DModel.from(path, { autoInteract: false })`, scales/anchors per manifest, starts idle motion
- `dispose()` — destroys model + PIXI app, removes listeners
- `setEmotion(name, durationMs = 3000)` — delegates to emotion-interpolator
- `playMotion(semanticName)` — looks up `motionMap[semanticName]`, calls `model.motion(group)`
- `setLookAtTarget(x, y)` — updates target coordinates for cursor tracking
- `pause()` / `resume()` — stops/starts the PIXI ticker
- Internal tick callback: applies cursor tracking interpolation + emotion parameter overrides each frame

**Lifecycle**:
- Registers `document.visibilitychange` → `pause()`/`resume()`
- Cleanup: cancel RAF, remove listeners, destroy model, destroy app

### 1.3 Emotion Interpolator

Create `frontend/src/lib/live2d/emotion-interpolator.js`:

- `applyEmotion(coreModel, emotionMap, emotionName, durationMs = 3000)`:
  - Captures current values of all emotion-mapped parameters
  - Over 300ms, lerps each parameter from current → target (using `requestAnimationFrame`)
  - Holds for `durationMs - 600ms`
  - Over 300ms, lerps back to resting values
  - Returns a cancel function
- Layer priority: motion curves > emotion overrides > look-at (look-at is additive)

### 1.4 Files

| Action | File |
|--------|------|
| Create | `frontend/src/lib/live2d/model-registry.js` |
| Create | `frontend/src/lib/live2d/Live2DEngine.js` |
| Create | `frontend/src/lib/live2d/emotion-interpolator.js` |

---

## Phase 2 — VTuber Panel Component

> Goal: Replace the walking character with a fixed, docked companion panel.

### 2.1 Layout Design

**Position:** Bottom-right corner, above the HUD nav bar (64px). Docked like a VTuber cam overlay.

```
┌─────────────────────────────────────────────┐
│  TopBar (56px)                    [Music]   │
├─────────────────────────────────────────────┤
│                                             │
│            Main Content Area                │
│                                             │
│                                             │
│                                   ┌───────┐ │
│                                   │Hiyori │ │
│                                   │ Panel │ │
│                                   │240×280│ │
│                                   └───────┘ │
├─────────────────────────────────────────────┤
│           HUD Nav Pill (64px)               │
└─────────────────────────────────────────────┘
```

- **Desktop (≥768px):** 240×280px panel, `position: fixed`, `bottom: calc(var(--skr-hud-height) + 12px)`, `right: 16px`
- **Mobile (<768px):** Collapsed to a 56×56 circular avatar button in bottom-right; tap to expand to a bottom sheet (full-width, 50vh max)
- **z-index:** 900 (above content, below modals at 1000, same layer as HUD)
- **Toggle:** Small chevron button on the panel edge to minimize → shows only a 48px circular Hiyori icon. Click to restore.
- **Minimized state** persisted in `localStorage` key `skr-companion-minimized`

### 2.2 Panel Anatomy

```
┌─ CompanionPanel ──────────────┐
│ [Model Name ▾]    [─] (min)  │  ← Header (▾ dropdown is Director-only)
│                               │
│   ┌─────────────────────┐     │
│   │                     │     │
│   │   Live2D Canvas     │     │
│   │   (transparent bg)  │     │
│   │                     │     │
│   └─────────────────────┘     │
│                               │
│ [💬 Chat]            [mood]   │  ← Footer: chat toggle + emotion indicator
└───────────────────────────────┘
```

### 2.3 Components

| Action | File | Description |
|--------|------|-------------|
| Create | `frontend/src/components/sakura/companion/CompanionPanel.js` | Main panel container, layout, minimize toggle, responsive breakpoints |
| Create | `frontend/src/components/sakura/companion/CompanionCanvas.js` | Wraps Live2DEngine, owns the `<canvas>` ref, handles resize |
| Create | `frontend/src/components/sakura/companion/CompanionChat.js` | Enhanced multi-turn chat UI (replaces CompanionDialog.js) |
| Create | `frontend/src/components/sakura/companion/ModelSelector.js` | Director-only model picker dropdown |
| Modify | Sakura layout root (where CharacterWalker is currently mounted) | Replace `<CharacterWalker>` + `<CompanionDialog>` with `<CompanionPanel>` |
| Modify | `frontend/src/index.css` | Add CSS variables: `--skr-companion-width`, `--skr-companion-height` |

**CharacterWalker.js and CompanionDialog.js**: Keep files for reference but stop importing them from the layout.

---

## Phase 3 — Cursor Tracking & Emotion Reactions

> Goal: Make Hiyori feel alive — eyes/head follow cursor, emotions animate on her face.

### 3.1 Cursor Tracking (Look-At)

Implemented inside `Live2DEngine.js` tick callback:

1. Listen to `mousemove` on `document`
2. Compute normalized coordinates relative to canvas center: `dx = (mouseX - canvasCenterX) / (window.innerWidth / 2)`, clamped to [-1, 1]
3. Each frame (via PIXI Ticker):
   - Lerp `currentLookX` toward `targetLookX` by `smoothing` factor (0.15)
   - Apply: `model.internalModel.coreModel.setParameterValueById("ParamAngleX", currentLookX * headWeight.x)`
   - Same for `ParamAngleY`, `ParamEyeBallX`, `ParamEyeBallY`
4. When a motion is playing, reduce look-at influence to 50% to avoid fighting the motion curves
5. On mobile: disable cursor tracking (no persistent cursor)

### 3.2 Lip Sync (Simple)

When the companion is "speaking" (text appearing character-by-character in chat):
- Oscillate `ParamMouthOpenY` between 0 and 0.8 at ~6Hz using sine wave
- Duration matches the text reveal time
- No audio analysis needed — purely visual

---

## Phase 4 — Contextual Reaction System

> Goal: Hiyori reacts to what the user is doing in the app.

### 4.1 Companion Event Bus

Create `frontend/src/lib/companion/CompanionContext.js` — React Context + Provider:

```js
const CompanionActions = {
  PAGE_NAVIGATE:    "page_navigate",    // { page: "forge" }
  GENERATION_START: "generation_start", // { type: "image" | "story" }
  GENERATION_DONE:  "generation_done",  // { type, success }
  GENERATION_ERROR: "generation_error", // { type, error }
  USER_IDLE:        "user_idle",        // after 60s no interaction
  USER_RETURN:      "user_return",      // after idle, user interacts again
  CHAT_MESSAGE:     "chat_message",     // { text, emotion }
};
```

The provider wraps the app, exposes:
- `dispatch(action, payload)` — fire an event
- `useCompanionEvent(callback)` — subscribe to events in the CompanionPanel

### 4.2 Reaction Mapping

Create `frontend/src/lib/companion/reaction-map.js`:

| Event | Motion | Emotion | Auto-Chat |
|-------|--------|---------|-----------|
| `PAGE_NAVIGATE` | `greet` | `happy` | Send context: "User navigated to {page}" |
| `GENERATION_START` | `acknowledge` | `thinking` | — |
| `GENERATION_DONE` (success) | `react` | `happy` | — |
| `GENERATION_ERROR` | `dismiss` | `sad` | — |
| `USER_IDLE` (60s) | — | `thinking` | — |
| `USER_RETURN` | `greet` | `happy` | — |

### 4.3 Integration Points — Files to Modify

| File | Event to dispatch |
|------|-------------------|
| React Router / layout navigation handler | `PAGE_NAVIGATE` |
| Forge generation submit handler | `GENERATION_START` |
| Forge generation callback | `GENERATION_DONE` / `GENERATION_ERROR` |
| CompanionContext itself (idle timer) | `USER_IDLE` / `USER_RETURN` |

---

## Phase 5 — Enhanced Companion Chat

> Goal: Multi-turn, context-aware chat panel integrated into the VTuber panel.

### 5.1 Frontend — CompanionChat.js

- Expandable chat area that slides up from the CompanionPanel footer
- Shows conversation history (React state only — not persisted across refreshes for v1)
- Input field at bottom with send button
- Each message includes context: `{ message, context: { page, recentAction } }`
- On response: trigger `setEmotion()` on the model + lip sync while text reveals
- Character-by-character text reveal (~30ms/char) for a "speaking" feel
- Cap at 20 messages in state before dropping oldest (memory management)

### 5.2 Backend — companion-route.js (codex/dev branch)

Enhance `POST /api/companion/chat`:

- Accept `messages` array (conversation history, last 10 turns) instead of single `message` string
- Accept `context` object: `{ page, recentAction, username }`
- Inject context into system prompt: "The user is currently on the {page} page. They recently {recentAction}."
- Keep existing parameters: `max_tokens: 200`, `temperature: 0.85`
- **Backward compatible**: if `message` (string) is sent instead of `messages` array, wrap it into a single-message array

---

## Phase 6 — Model Selection (Director-Only)

> Goal: Allow the Director to swap the Live2D model from the Sanctum.

### 6.1 Frontend — ModelSelector.js

- Dropdown in CompanionPanel header, only visible if user has `admin` role (Director)
- Lists models from `model-registry.js` with thumbnail + name
- On selection: calls `Live2DEngine.dispose()` then `Live2DEngine.loadModel(newEntry)`
- Saves selection to backend: `PUT /api/admin/companion-model` → `{ modelId }`
- On app load: `GET /api/admin/companion-model` → loads the configured model (falls back to default)

### 6.2 Backend — companion-route.js (codex/dev branch)

Add two endpoints:
- `GET /api/admin/companion-model` — returns `{ modelId }` from DynamoDB (`COMPANION_CONFIG` item)
- `PUT /api/admin/companion-model` — admin-only (auth middleware), saves `{ modelId }` to DynamoDB

### 6.3 Adding a New Model (Future Developer Workflow)

1. Place model assets in `frontend/public/live2d/{model-name}/runtime/`
2. Add an entry to `model-registry.js` with correct `emotionMap`, `motionMap`, `lookAt` config
3. Deploy frontend + manual `aws s3 sync` for assets (CDK Lambda can't handle large Live2D assets)
4. Director selects the new model in Sanctum → persisted for all users

---

## Implementation Order & PR Strategy

```
Phase 1 (Abstraction Layer)  ← No visible change, foundation only
  ↓
Phase 2 (VTuber Panel)       ← Hiyori appears docked bottom-right, idle
  ↓
Phase 3 (Tracking + Emotion) ← Hiyori follows cursor, emotes on chat responses
  ↓
Phase 5 (Enhanced Chat)      ← Multi-turn chat in panel (backend changes on codex/dev)
  ↓
Phase 4 (Contextual Reactions) ← Hiyori reacts to page nav, generation, idle
  ↓
Phase 6 (Model Selection)    ← Director can swap models from Sanctum
```

**PR grouping:**
- **PR 1** (design-sakura): Phases 1-3 — Companion abstraction + VTuber panel + tracking/emotions
- **PR 2** (design-sakura + codex/dev): Phases 4-5 — Reactions + enhanced chat
- **PR 3** (design-sakura + codex/dev): Phase 6 — Model selection system

---

## Key Files Summary

### New Files (frontend — codex/design-sakura/code)

| File | Purpose |
|------|---------|
| `frontend/src/lib/live2d/model-registry.js` | Model manifest definitions + lookup functions |
| `frontend/src/lib/live2d/Live2DEngine.js` | PIXI + Live2D lifecycle manager class |
| `frontend/src/lib/live2d/emotion-interpolator.js` | Smooth parameter transitions for emotions |
| `frontend/src/lib/companion/CompanionContext.js` | React context + event bus for app-wide companion events |
| `frontend/src/lib/companion/reaction-map.js` | Event → motion/emotion/chat mapping table |
| `frontend/src/components/sakura/companion/CompanionPanel.js` | Main panel container with layout + minimize |
| `frontend/src/components/sakura/companion/CompanionCanvas.js` | Canvas wrapper for Live2DEngine |
| `frontend/src/components/sakura/companion/CompanionChat.js` | Multi-turn chat UI with text reveal |
| `frontend/src/components/sakura/companion/ModelSelector.js` | Director-only model picker dropdown |

### Modified Files (frontend — codex/design-sakura/code)

| File | Change |
|------|--------|
| Sakura layout root | Replace `<CharacterWalker>` + `<CompanionDialog>` with `<CompanionPanel>` |
| `frontend/src/index.css` | Add companion CSS variables |
| Forge page component | Dispatch `GENERATION_START` / `GENERATION_DONE` / `GENERATION_ERROR` |
| Chronicle page component | Dispatch `GENERATION_START` / `GENERATION_DONE` |

### Modified Files (backend — codex/dev)

| File | Change |
|------|--------|
| `backend/routes/companion-route.js` | Multi-turn messages array, context injection, model config GET/PUT |

### Deprecated (keep for reference, stop importing)

| File | Replaced By |
|------|-------------|
| `frontend/src/components/sakura/CharacterWalker.js` | `CompanionPanel` + `CompanionCanvas` |
| `frontend/src/components/sakura/CompanionDialog.js` | `CompanionChat` |

---

## Verification Plan

### After Phase 1-3 (PR 1)
1. `npm start` in frontend — Hiyori appears in bottom-right panel with idle animation
2. Move cursor across screen — Hiyori's eyes and head follow smoothly
3. Click chat button — send a message, Hiyori's emotion changes and lips move during text reveal
4. Click minimize — only circular icon visible; click to restore
5. Resize to <768px viewport — panel collapses to avatar button
6. Switch browser tab and back — verify PIXI ticker pauses/resumes (DevTools Performance)
7. Check no console errors related to Live2D or PIXI

### After Phase 4-5 (PR 2)
1. Navigate between pages — Hiyori plays greet motion + happy emotion
2. Start image generation in Forge — Hiyori shows thinking emotion
3. Generation completes — Hiyori reacts with happy emotion
4. Send multiple messages in chat — conversation history persists, context is passed to backend
5. Stay idle 60s — Hiyori enters thinking state; move mouse — greet + happy

### After Phase 6 (PR 3)
1. Log in as Director, go to Sanctum area
2. Open model selector dropdown in companion panel header
3. (With a second test model) select different model — old model unloads, new loads
4. Refresh page — selected model persists (fetched from backend)
5. Non-Director users — verify model selector is not visible
