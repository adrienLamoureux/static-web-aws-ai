# Companion Mode — v0 Ship Plan

> **Status:** v0 skeleton shipped 2026-05-19 (frame + mode switch + 2 tools + TTS). Remaining 6 new tools (open_story_session, read_scene, share/unshare/delete_image, change_brightness, sign_out) deferred to follow-ups.
> **Scope:** v0, ship in ~1 week. Builds on shipped Agent Mode (v1.7) infrastructure.
> **Audience:** the next agent (or human) picking this up.
>
> v0 deltas vs. the original plan:
> - **TTS landed first** as a cross-cutting precursor (works in agent mode too, not just companion). Toggle button next to mic in Composer. Auto-speaks every agent reply when enabled. Cancel-on-interrupt when user submits. Persisted to `localStorage["skr-tts-enabled"]`.
> - **CompanionStage** reuses MangaPanel + Composer instead of building a new "wide chat panel" — Composer already has mic + 🔊 toggles, no duplication.
> - **App.js branch** picks `<CompanionStage />` vs `<SakuraShell>` based on `useMode()` — no shell-suppression CSS gymnastics, just don't render the shell at all when in companion mode.
> - **Two new tools** (`view_my_creations`, `what_can_you_do`) registered in agent-tools.js. The other 6 from the original plan are parked.
> - **System prompt addendum** (`COMPANION_MODE_ADDENDUM`) appended to the existing SYSTEM_PROMPT when `ctx.mode === "companion"`. Encourages narrative tone, on-screen affordance mentions, voice-confirm pattern, and the canned admin refusal.
> - Backend test count: 358 (+8 for companion-tools). Frontend: 129 (+13 for useSpeech).

## Context

Today the app has **two modes** via `ModeContext` (localStorage `skr-mode`):
- `"dashboard"` — traditional form-driven UI (default).
- `"agent"` — route-scoped to `/atelier`, manga-panel scroll, Hiyori in a corner, 7 tools.

Both modes keep the full **app shell**: topbar, bottom HUD, route navigation, Sanctum link, the floating CompanionPanel. The user can always click around traditionally.

**Companion Mode (v0)** is a third value of `ModeContext`: `"companion"`. When active, the entire app shell disappears. Hiyori scales up to dominate the viewport. The composer is the only input. Every user operation that isn't admin-locked happens through the conversation — generate, view, navigate, share, delete, sign out. The user has a single ✕ button to return to the dashboard.

This is **distinct** from the existing `CompanionFullScreen` overlay (the ⤢ button on the floating panel):
- `CompanionFullScreen` uses `/api/companion/chat` (the lightweight, tool-less companion endpoint). It's a chat-only modal.
- Companion Mode reuses the **full agent backend** (`/api/agent/turn`, tools, memory, sessions, rate limits, daily caps) — the conversation can *do things*, not just talk.

**v0 scope (1 week):** prove the "hands-off, voice-or-text-only" loop. Cut TTS, always-on mic, vision input, narrative tools. Get the frame + 8 tools + admin refusal pattern working.

- **Mode:** global. Toggle persists across routes. URL still updates via react-router (programmatic only) so refresh-to-resume works.
- **Tool fleet:** all 7 Agent Mode tools + 8 new "viewing/managing" tools (view_my_creations, open_story_session, read_scene, share/unshare/delete_image, change_brightness, sign_out, what_can_you_do).
- **Refusals:** admin operations (Sanctum) get a canned polite refusal with a one-click "drop into dashboard" exit.
- **Transport:** polling (same as Agent Mode). SSE/streaming still parked.
- **Memory:** reuse `AGENT#{sessionId}` namespace. Companion Mode uses session id `"companion"` (or a minted uuid) to keep memory conceptually separate from dashboard-agent.

---

## Architecture

### Mode extension

`ModeContext` accepts a third value: `"companion"`. App.js conditionally renders:

```jsx
{mode === "companion" ? (
  <CompanionStage />
) : (
  <>
    <TopBar />
    <Routes>…</Routes>
    <BottomHUD />
    <CompanionPanel />
  </>
)}
```

When `mode === "companion"`:
- TopBar, BottomHUD, CompanionPanel (the corner widget) are suppressed
- Routes still mount under the stage so internal programmatic nav (e.g. Hiyori opens a story session) gets a real URL
- A single frosted `✕` button top-right is the only escape

### The frame

```
┌───────────────────────────────────────────────────────────┐
│                                                         ✕ │
│                                                           │
│    ┌─────────────────┐   ┌──────────────────────────┐    │
│    │                 │   │  ┌──────────────────┐    │    │
│    │                 │   │  │  Hiyori bubble   │    │    │
│    │     Hiyori      │   │  └──────────────────┘    │    │
│    │  (Live2D, large)│   │                          │    │
│    │                 │   │  ┌──────────────────┐    │    │
│    │                 │   │  │  user reply      │    │    │
│    │                 │   │  └──────────────────┘    │    │
│    │                 │   │                          │    │
│    │                 │   │  ┌──────────────────────┐│    │
│    │                 │   │  │ Result card / grid   ││    │
│    │                 │   │  │ (image, scene,       ││    │
│    │                 │   │  │  gallery, recall…)   ││    │
│    └─────────────────┘   │  └──────────────────────┘│    │
│                          └──────────────────────────┘    │
│    ┌─────────────────────────────────────────────────┐   │
│    │  🎙  type or speak…                              │   │
│    └─────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

- Hiyori canvas: ~50% width on desktop, full-top half on mobile
- Right column: scrolling conversation + tool-result cards
- Composer: sticky bottom, mic always visible (`useVoiceInput` already shipped)
- No tweak/reroll/intent chips visible — every action is conversational

---

## Tool surface

### Reuse (already shipped, render fine in companion frame)

`generate_image`, `set_theme`, `recall_favorites`, `browse_gallery`.

### Adapt (existing tools, change confirm behaviour)

`continue_story`, `illustrate_scene`, `generate_music`. Currently produce `requiresConfirm` intents that, on confirm, navigate to Chronicle. In Companion Mode they execute **in place** — the result renders as a card in the conversation. Hiyori still asks before destructive operations, but the user confirms by saying "yes" instead of clicking a button.

### New tools (v0)

| Tool | Purpose | Reuses |
|---|---|---|
| `view_my_creations` | List user's recent images/videos with thumbnails. "Show me what I made yesterday." | `queryMediaItems` |
| `open_story_session` | Surface a story session by title fuzzy match. "Pick up the fox spirit story." | existing `/story/sessions` endpoint |
| `read_scene` | Display a specific scene's text (TTS deferred to v1). "Read me chapter 2." | `queryBySkPrefix` |
| `share_image` | Toggle public-gallery status — on. "Share the third one." | existing share endpoint |
| `unshare_image` | Toggle public-gallery status — off. "Unshare that." | existing share endpoint |
| `delete_image` | Soft-delete with confirm. "Delete that one." | `deleteMediaItem` |
| `change_brightness` | Toggle dark/light. "Make it brighter." | ThemeContext |
| `sign_out` | Confirm intent → Cognito logout. "I'm done." | Cognito sign-out |
| `what_can_you_do` | Hiyori lists her capabilities. "Help / what can you do?" | static, no LLM call |

### Refusals (admin operations)

Admin-flavored asks ("change the LoRA catalog", "show me everyone's costs", "flip the feature flag") get a canned reply:

> *"That one's behind the Director's desk — I can't help from here. Want me to drop you into the dashboard?"*

If user says yes → `setMode("dashboard")` + `navigate("/sanctum")`. Implemented as a `refuse_admin` directive in the companion-mode system prompt, **not** a tool — the model recognizes the intent and emits the canned line.

---

## Backend touchpoints

### Request body

```js
POST /api/agent/turn
{
  messages: [...],
  sessionId: "companion",
  context: { page: "companion", mode: "companion" }
}
```

### System prompt branch

`agent-route.js` builds the system prompt. Add a branch when `context.mode === "companion"`:

- More narrative tone ("let me see…", "okay, pulling that up now…")
- Mention what's appearing on screen ("the grid below shows your last 8 images")
- Confirm via natural language not buttons ("does the first one look right?")
- Decline admin asks politely

### Tool dispatchers

- `backend/lib/agent-tools/companion-tools.js` (new) — 8 dispatchers above
- Register in `backend/lib/agent-tools.js` `dispatchTool` router
- Each tool's spec gets pushed into `ALL_TOOL_SPECS` so Bedrock sees them
- All existing security gates (rate limit, daily token cap, daily image cap, prefs enum validation) apply unchanged

### Memory + sessions

No backend storage changes. Reuse `AGENT#{sessionId}` namespace and the existing rolling-summary compaction. Companion Mode uses session id `"companion"` (or a minted uuid) so its memory stays separate from dashboard-agent memory.

### Cost telemetry

No changes. The existing per-user token + image caps apply automatically. Companion Mode is **not** exempt — Hiyori's chattier system prompt may push token consumption up by ~15%, comfortably within the 200k/day cap.

---

## Files to modify

| File | Purpose |
|---|---|
| `frontend/src/lib/mode/ModeContext.js` | Accept `"companion"` value |
| `frontend/src/App.js` | Conditional render — suppress shell in companion mode |
| `frontend/src/lib/agent/AgentContext.js` | Pass `context.mode = "companion"` when active; default session id `"companion"` |
| `frontend/src/components/sakura/companion/CompanionPanel.js` | Add "Enter Companion Mode" button alongside ⤢ |
| `backend/routes/agent-route.js` | Branch system prompt on `context.mode` |
| `backend/lib/agent-tools.js` | Register 8 new tool specs + dispatch entries |

## Files to create

| File | Purpose |
|---|---|
| `frontend/src/components/sakura/companion-mode/CompanionStage.js` | Dominant Hiyori + chat + result-slot layout |
| `frontend/src/components/sakura/companion-mode/CompanionResultArea.js` | Slot wrapper that picks the right card variant per tool result |
| `frontend/src/components/sakura/companion-mode/MyCreationsPanel.js` | Grid for `view_my_creations` |
| `frontend/src/components/sakura/companion-mode/StorySessionCard.js` | Card for `open_story_session` |
| `frontend/src/components/sakura/companion-mode/SceneReaderPanel.js` | Card for `read_scene` (text-only in v0) |
| `frontend/src/components/sakura/companion-mode/EnterCompanionButton.js` | Entry-point button |
| `frontend/src/styles/companion-mode.css` | Viewport-takeover layout, bigger Hiyori, body-scroll lock |
| `backend/lib/agent-tools/companion-tools.js` | 8 new dispatchers |

## Reusable pieces — do NOT duplicate

- `useVoiceInput` — mic input, already shipped
- `AgentContext` — turn stream, queue, sessions, intent confirm chain (all already there)
- `intentExecutor` — confirm-then-execute for story tools
- `slashCommands` — `/help`, `/reset` still work
- `CompanionCanvas` — Live2D renderer (mount at larger scale in `CompanionStage`)
- `RecallFavoritesPanel`, `BrowseGalleryPanel`, `ToolResultPanel`, `IntentPanel` — already render the tool results cleanly; reuse as-is
- `MemoryBadge`, `AgentSessionPicker` — show in `CompanionStage` (small top-right, alongside ✕)
- Agent backend (`/api/agent/turn`, tools, memory, rate limits, caps) — unchanged

## Hero moment — first 5 seconds

1. **0.0s** User taps "Enter Companion Mode" on the Hiyori panel.
2. **0.6s** Page ink-washes outward (reuse the existing `skr-mode-transition` keyframe).
3. **1.0s** Topbar/HUD/dashboard fades. Hiyori scales from corner to dominant. Speech bubble: *"oh nice, just you and me. what are we doing — making, looking, or vibing?"* — **canned text, no LLM call**.
4. **1.8s** Composer auto-focuses. Mic icon pulses gently (always-available hint).
5. **User says "show me what I made last week"** → `view_my_creations` grid renders below Hiyori → "the cooler-toned one's gorgeous" → tool fires → variation appears next to original.

Restraint is the pitch — no menu, no chips, no sidebars. The only visible affordances are the composer, mic, and ✕.

---

## Explicit cuts from v0 (parked for v1)

- **TTS audio output** — Hiyori speaking via `window.speechSynthesis`. Trivial to wire but default voices are mediocre; deserves its own quality pass.
- **Always-on listening** (like Alexa) — mic stays open between turns. Permission/UX research needed first.
- **"Tell me a story"** — generative narrative tool spinning ambient stories from the user's library.
- **Natural-language refinement** ("the third one but cooler tones") — needs session-state recall of what "third one" means + image-conditioning.
- **Image upload via drag/drop** — multi-modal input.
- **Mid-flight cancel** — "stop, I changed my mind" mid-generation.
- **Per-session memory cleanup UX** — "forget what I just said" command.
- **TouchID/FaceID gate** for destructive ops (delete + sign-out).
- **Vision tools** — "look at this and tell me what you think."

---

## Verification

End-to-end checks before declaring v0 done:

1. **Mode persistence.** Flip to companion mode, refresh, still companion. No shell elements visible. ✕ button visible top-right.
2. **All 8 new tools.** Each one tested with a representative phrase. Backend dispatches, frontend renders the right card.
3. **Confirm-via-speech.** `continue_story` intent → user says "yes" → executes in place without leaving companion mode. Same for `illustrate_scene` + `generate_music`.
4. **Admin refusal.** "Show me the feature flags" → canned refusal + "drop into dashboard?" offer → on yes, exits to `/sanctum`.
5. **Sign-out flow.** "I'm done" → confirm → Cognito logout → redirect to login.
6. **Mobile.** Full layout works on iPhone 13-sized viewport. Hiyori top half, chat bottom half, mic prominent.
7. **No regression.** Dashboard mode and agent mode work unchanged. Companion mode is purely additive.
8. **Cost cap.** Token + image caps still apply. Verify by mocking a user at the cap → companion tool returns 429.
9. **Latency budget.** P50 first-bubble <2.5s, P50 first-tool-result <8s on Haiku 4.5 + Replicate.
10. **Deploy smoke.** UI smoke includes a `companion-stage` synthetic check (flip localStorage `skr-mode = "companion"`, expect no topbar visible).

---

## Risks

| Risk | Mitigation |
|---|---|
| **User feels trapped.** | Always-visible ✕ exit top-right. Single click → dashboard mode. |
| **LLM hallucinates "you have 12 images" when user has 3.** | Every "view" tool MUST round-trip to DynamoDB; Hiyori only narrates the returned items, never invents. |
| **Voice input on unsupported browsers.** | `useVoiceInput.supported = false` → fall back to text-only with one-time toast. |
| **User mis-clicks somewhere.** | No clickable navigation exists in this mode (no topbar, no buttons inside result cards except inline tool affordances). Hard to escape accidentally. |
| **Admin user really needs Sanctum.** | Refusal includes "drop into dashboard?" → one click to exit + auto-route to `/sanctum`. |
| **Cost spike from chatty Hiyori.** | Existing daily token cap + image cap apply unchanged. Companion mode is **not** exempt. Telemetry will surface if companion turns are pushing the cap. |
| **Hiyori uses an unsafe pref value.** | `agentState.patch` validators (shipped in hardening pass) reject out-of-enum values on both write and read. |

---

## Open questions for v1 (parked, not blocking v0)

- **Own URL?** `/companion` route vs. pure modal state. v0 picks pure modal (localStorage flag) for refresh predictability; revisit if shareable URLs matter.
- **Shared session memory with agent mode** or separate? v0 keeps them separate (session id `"companion"`); revisit if users want to "continue what we started in the dashboard."
- **Mobile-first or desktop-first?** v0 ships desktop-first. Mobile layout works but isn't the showpiece.
- **TTS voice selection** — when v1 wires speech output, default voice + per-user override.
- **Always-on mic with hotword** — "hey Hiyori" wakeword. Requires extra permissions and UX research.
- **Vision input** — "look at this and tell me what you think" requires Bedrock vision-capable model branch.
- **Bento layout in companion mode** — currently no; conversation is sequential. Revisit if multi-card "dashboard glance" is needed.

---

## Estimated effort

**1 week** (matches the original v0 agent mode plan):
- 1.5 days — frame, mode switch, layout
- 2 days — 8 new tools (most are thin wrappers around existing endpoints)
- 1 day — system prompt + refusal pattern + intent-in-place
- 0.5 day — mobile pass
- 1 day — verification + deploy smoke
