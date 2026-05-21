# Agent Mode — v0 Ship Plan

> **Status:** Shipped 2026-04-26 (v0 + post-v0 polish tiers 1–3 + docs). **v1 Phase A + B-MVP shipped 2026-05-10. v1.1 (intent execution + recall_favorites) shipped 2026-05-10. v1.2 (generate_music + browse_gallery + cross-mode handoff + mobile polish) shipped 2026-05-10. v1.3 (tool-result selection-to-edit + per-field suggest + rate limiting + latency logging) shipped 2026-05-11. v1.4 (cost telemetry + cohort-scoped flag + multi-step plans + Confirm-all + negativePrompt suggest) shipped 2026-05-11. v1.5 (Sanctum cost view + cohort dropdown UI + bento layout toggle) shipped 2026-05-11. v1.6 (slash commands + daily token cap + agent model picker + conversation export) shipped 2026-05-12. v1.7 (multiple agent sessions + voice input) shipped 2026-05-12.**
> **Scope:** v0, ship in ~1 week. Full v1 parked in the Open Questions section at the bottom.
> **Audience:** the next agent (or human) picking this up.
>
> Post-v0 deltas vs. the original plan:
> - `HiyoriCorner` deferred — we kept the existing global `CompanionPanel`. See ADR-007.
> - `MemoryBadge` shipped (top-left of `AgentStage`).
> - Tweak-in-Atelier now plumbs `prompt + style + aspect + width/height + seed` losslessly.
> - Synchronous fast-path: when Replicate returns `succeeded` inside `Prefer: wait=5`, the backend writes the IMG row and returns `imageUrl` directly, skipping the polling round-trip.
> - Tier 3 polish: ink-wash mode transition, canned greeting (no LLM), staged thinking labels, tweak chips, re-roll button, typing-ahead composer queue, friendly error copy with auto-flip.
> - Backend test coverage added (`agent-tools`, `agent-memory`, `agent-route` — 28 tests).
>
> v1 deltas:
> - Tool fleet expanded to four: `generate_image`, `set_theme`, `continue_story`, `illustrate_scene`.
> - `set_theme` is a client-action — AgentContext applies it via ThemeContext; persisted to `AGENT#STATE`.
> - `continue_story` + `illustrate_scene` are intent tools — frontend surfaces a confirm button, navigates to Chronicle.
> - Second model turn after server-dispatch tools — closing sentence ("turned out softer than I expected — want more contrast?"). Skipped for intent-only tools.
> - Cross-session prefs at `AGENT#STATE`, read on every turn and injected as `<prefs>…</prefs>` in the system prompt.
> - `agent-memory.saveMessages` uses atomic `UpdateCommand` (`ADD turnCount :n`) — no more read-modify-write race.
> - Frontend selection-to-edit: clicking any past user/agent panel pre-fills the composer for quoting/iterating.
> - Backend tests now total 225 (added 19 for v1 features). Frontend still 79.
>
> v1.1 deltas:
> - `continue_story` and `illustrate_scene` no longer just navigate — `confirmIntent` now calls the existing `sendStoryMessage` / `generateStoryIllustration` services directly so the action *actually executes* server-side before navigation. Surfaces `executing → executed → opening` states in the IntentPanel.
> - New `recall_favorites` tool — server-dispatch reads the user's recent IMG items, signs top-N URLs (limit 1–12, default 8), returns prompts + thumbnails. The agent's closing turn comments on patterns ("you've been into forest scenes lately, neh~").
> - New `RecallFavoritesPanel` component — horizontal thumbnail strip with hover-reveal prompts; clicking a tile pre-fills the composer with that prompt (works with selection-to-edit).
> - New `AgentIntentBanner` component — small one-shot banner on Chronicle landing acknowledging "Hiyori added: …", auto-dismisses after 6s, reads + clears `localStorage["skr-agent-intent"]`.
> - Backend test count now 230 (added 5 for `recall_favorites`).
>
> v1.2 deltas:
> - **Tool fleet at 7**: added `generate_music` (intent, story-scoped — confirm calls `startStorySceneMusic`) and `browse_gallery` (server-dispatch — lists public `shared/images/` via S3 `ListObjectsV2`).
> - **Cross-mode handoff**: new `SummonAgentButton` in Whisk near the Generate button. Stashes the prompt in `localStorage["skr-agent-summon"]` and flips mode; `AgentContext` consumes the stash on mount and pre-fills the composer via `pendingText`.
> - **Mobile polish**: `@media (max-width: 640px)` block in `agent.css` — sticky composer with `env(safe-area-inset-bottom)`, font-size 16px on the input to defeat iOS zoom-on-focus, larger tap targets on chips/buttons (8–10px padding), larger recall/gallery tiles (112×144 on phone), tightened stage padding. Extra `@media (max-width: 380px)` for very small phones.
> - New `BrowseGalleryPanel` — thumbnail strip with click-to-zoom (full-screen overlay).
> - `agent-tools.js` split: small dispatchers moved to `lib/agent-tools/dispatchers.js` (304 lines); main file is just specs + router (257 lines). Heavy `generate-image.js` already separate.
> - Test file split too: `agent-tools.test.js` (specs + generate_image) + new `agent-tools-dispatchers.test.js` (all intent/server-dispatch tests).
> - Backend test count now 238 (added 8 for music + gallery).
>
> v1.3 deltas:
> - **Selection-to-edit extended** — tool-result panels' prompt text is now clickable (quotes into the composer via `setPendingText`).
> - **`POST /api/agent/suggest`** — single-field Bedrock helper for "Let Hiyori choose" buttons. Powers per-field assistance inside Dashboard Forge without forcing a mode switch. First button shipped on the prompt textarea; style/aspect buttons follow the same pattern.
> - **`SummonAgentButton` companion**: `HiyoriSuggestButton` — same dotted-pill aesthetic, accent-secondary palette so the two affordances are visually distinct.
> - **Rate limiting** — DynamoDB token bucket per user (`AGENT#RATE`). Defaults: 30/2s on `/turn`, 60/1s on `/suggest`. Atomic refill via timestamp recalc. Fails open on DB errors. Returns 429 + `Retry-After` + `X-RateLimit-Remaining` headers.
> - **Structured latency logging** — single JSON line per `/turn` invocation (`event: "agent.turn"`, `latencyMs`, `outcome`, `toolCount`, `stopReason`, etc.) for CloudWatch Insights.
> - File splits: `backend/test/agent-route.test.js` shrunk (suggest + rate-limit tests moved to `agent-suggest-route.test.js`).
> - Backend test count now 252 (added 14 for rate-limit + suggest).
>
> v1.4 deltas:
> - **Cost telemetry** — per-user running totals at `AGENT#COST` (atomic `ADD` increments). New `backend/lib/agent-cost.js` module. Captures usage on both `/turn` Bedrock calls (initial + closing) and the `/suggest` InvokeModel call. Token counts also surface on the structured log line for CloudWatch Insights.
> - **Cohort-scoped `agentMode` flag** — value can now be `true|false|"all"|"admin"|"beta"|<unknown→true>`. `evaluateFlag(flags, key, user)` checks against `user.isAdmin` / `user.roles` / `user.groups`. Same gate applied at `/turn` and `/suggest`.
> - **Multi-step tool plans** — system prompt opens up 2–3 chained tools per turn for natural workflows ("start a story and illustrate it"). Backend dispatch loop and closing turn already handled the case mechanically; only the prompt needed updating.
> - **`ConfirmAllPanel`** — when 2+ intent panels (`requiresConfirm`) arrive in the same turn, AgentContext drops a synthetic `confirm-all` turn carrying the list. New `confirmAllIntents()` runs them in sequence, navigates to the final URL when all succeed.
> - **`negativePrompt` suggest field** — fourth field on the suggest endpoint. Second `HiyoriSuggestButton` ships in Whisk's prompt-actions row alongside the prompt one.
> - File splits: `agent-route.js` shrunk by extracting `/api/agent/suggest` to `routes/agent-suggest-route.js`. `routes/index.js` registers both.
> - Backend test count now 273 (added 21 for cost + cohort + multi-step + negativePrompt).
>
> v1.5 deltas:
> - **Sanctum cost view** — `GET /api/admin/agent/cost` (admin-gated `ScanCommand` over `AGENT#COST`), new `AgentCostSection` in the Director page with a sortable table + summary row + rough USD estimate (Haiku 4.5 pricing constants). Closes the loop on v1.4's cost telemetry.
> - **Cohort dropdown UI** — `FeatureFlagsSection` now renders `agentMode` as a 4-option `<select>` (Off / Admins only / Beta cohort / Everyone). Boolean flags continue to use the existing pill toggle. `"all"` collapses to boolean `true` for storage, `"false"` to `false` — keeps the backend payload backward compatible.
> - **Bento layout toggle** — `AgentStage` gains a 2nd toggle button in the meta strip (next to MemoryBadge). Persists choice to `localStorage["skr-agent-layout"]`. CSS columns (2 on tablet, 3 on desktop) for tool-result panels; text panels keep full-width via `column-span: all` so they read as chapter markers. Auto-collapses to single column on phones.
> - File splits: backend admin tests moved to `test/agent-admin-route.test.js`.
> - Backend test count now 280 (added 7 for scanAll + admin endpoint). Frontend at 83 (added 4 for cohort dropdown).
>
> v1.6 deltas:
> - **Slash commands** in the composer: `/help`, `/clear`, `/reset`, `/theme <name>`, `/recall [n]`, `/reroll`. Parser + dispatcher live in `frontend/src/lib/agent/slashCommands.js`. `/help` and `/clear` are pure local; `/theme` applies via the existing `applyClientAction` plumbing; `/recall` and `/reroll` rewrite into normal prompts that go through the agent. Composer hint updated to advertise "type / for shortcuts".
> - **Daily token cap** (200k tokens/day default ~ $0.20 at Haiku 4.5) — new `agentCost.checkDailyCap` runs after the request bucket and before Bedrock. Uses `dayStartedAt` for UTC-midnight rollover (no scheduled job needed). 429 + `Retry-After` (ms until midnight) when over.
> - **Director agent model picker** — new `backend/lib/agent-config.js` module with cached `getAgentModelId(deps)` reader + `setAgentModelId(deps, modelId)` writer. Stored at `(CONFIG#AGENT, CONFIG#AGENT)`. Both `/turn` (Converse) and `/suggest` (InvokeModel) read through this getter. New `GET/PUT /api/admin/agent/model` endpoints + `AgentModelSection` in Sanctum with a preset dropdown (Haiku 4.5 / Sonnet 4.6 / Opus 4.7) + custom modelId / inference profile ARN input + reset-to-default button.
> - **Conversation export** — `turnsToMarkdown(turns)` serialises the AgentStage stream to markdown (`**You:**` / `**Hiyori:**`, embedded images with prompt + style + seed metadata, intent panels as italic notes, transient UI dropped). `downloadMarkdown()` triggers a `.md` download with a timestamped filename. New ↓ Export button in the AgentStage meta strip.
> - File splits: extracted `backend/routes/agent-admin-route.js` (model GET/PUT + cost GET) so `agent-route.js` stays under the 500-line cap.
> - Backend test count now 301 (added 21 for agent-config, daily cap, model picker, slash-equivalent server flows). Frontend at 106 (added 23 for slashCommands + exportTurns + backfill).
>
> v1.7 deltas:
> - **Multiple agent sessions** — new `backend/lib/agent-sessions.js` module + `backend/routes/agent-sessions-route.js` exposing GET/POST/PATCH/DELETE `/api/agent/sessions`. Sessions persist at `AGENT#SESSION#{id}` with `{name, createdAt, lastUsedAt}`. The session id doubles as the memory namespace passed into `/api/agent/turn`, so each session gets its own conversation memory for free via the existing `AGENT#{id}#MSG#{ts}` layout. Reserved `"default"` session is always available.
> - **`AgentSessionPicker`** in the AgentStage meta strip — dropdown sorted by lastUsedAt desc, with rename / delete affordances on hover + a "New session" creator that mints a client-side uuid. Native `window.prompt`/`confirm` for v1.7; custom modal UI parked.
> - **`AgentContext.activeSessionId`** persisted to `localStorage["skr-agent-session"]`. Switching wipes the local turn stream — backend memory hydrates automatically on the next turn via the new sessionId namespace.
> - **Voice input** — new `useVoiceInput` hook wrapping the browser-native Web Speech API. New mic button in `Composer` flips between idle and listening; interim transcripts flow live into the textarea. Hidden when the browser lacks SpeechRecognition. No backend / API key required.
> - File splits: extracted `frontend/src/lib/agent/intentExecutor.js` (server-side intent execution) so `AgentContext.js` stays under the 500-line cap.
> - Backend test count now 325 (added 24 for agent-sessions module + route). Frontend at 115 (added 9 for mintSessionId + useVoiceInput).

## Context

Whisk Studio today is a **Dashboard** — every creative action requires the user to pick a provider, a model, a LoRA profile, an aspect ratio, a style preset, a batch count, and a prompt. That precision is gold for power users but a wall for newcomers, and on mobile it collapses under its own form density.

Meanwhile, **Hiyori is already half an agent**: Live2D presence, persistent DynamoDB memory with rolling compaction, a pub/sub event bus, inline `GenerationCard` that can call Replicate from inside the chat, and a tag-parsed action grammar that can already navigate, pre-fill a story, or suggest a prompt. She's just not driving — she's an observer in the corner.

**Agent mode** elevates Hiyori from observer to co-creator. User types one sentence of intent. Hiyori picks the provider, the LoRA, the aspect ratio, narrates her decisions in a speech bubble, and the result paints into a manga panel below. User can always escape into Dashboard on any panel with a lossless "Tweak in Atelier" button.

**v0 scope (~1 week):** prove the loop on one route with one tool. Cut everything else.

- **Mode:** route-scoped. Only `/atelier` exposes the toggle. Sanctum/Home/Chronicle unchanged.
- **Tool:** `generate_image` only. All other tools deferred to v1.
- **Visual:** shoujo pastel — reuse existing Sakura Bloom tokens. Only two new CSS primitives (bubble tail + speed lines).
- **Transport:** polling (not SSE). API Gateway migration deferred to v1.
- **Memory:** new `AGENT#` SK namespace on the existing single-table — no schema changes.

---

## Architecture

### Backend — new route, don't touch `/api/companion/chat`

Create `backend/routes/agent-route.js` with `POST /api/agent/turn`. The companion route stays untouched — it's the lightweight chit-chat + proactive path and must keep working in Dashboard.

**Request:**
```json
{ "messages": [...], "context": { "page": "atelier" } }
```

**Response (non-streaming for v0):**
```json
{
  "text": "Picking Nova Canvas at 3:4 with the sakura preset — ikuyo!",
  "emotion": "excited",
  "toolCalls": [{
    "name": "generate_image",
    "args": { "prompt": "...", "style": "anime", "aspect": "3:4", "provider": "bedrock" },
    "result": { "jobId": "...", "status": "pending" }
  }]
}
```

The frontend polls the provider-specific status endpoint it already uses (`GET /api/replicate/image/status`, `GET /api/civitai/image/status`, etc.) — no new polling infrastructure needed.

**Bedrock call.** Use `ConverseCommand` (already in `@aws-sdk/client-bedrock-runtime`, just never imported) with one tool:

```js
{
  toolSpec: {
    name: "generate_image",
    description: "Generate an image. Pick sensible defaults for unspecified fields based on the user's intent.",
    inputSchema: { json: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        style: { type: "string", enum: ["anime", "photoreal", "manga", "chibi"] },
        aspect: { type: "string", enum: ["1:1", "3:4", "16:9"] },
        provider: { type: "string", enum: ["bedrock", "replicate", "civitai"] }
      },
      required: ["prompt"]
    }}
  }
}
```

On `stopReason === "tool_use"`, dispatch to the existing provider handler and return to the frontend. Do **not** do the second model turn yet (summary after tool result) — the v0 response text comes from the model's pre-tool text block. Simpler, fewer round-trips, still legible.

**Feature flag.** Gate the whole route behind `feature-flags.js` key `agentMode`. If off, `/api/agent/turn` 404s and the frontend falls back silently.

**Memory.** New keys in `backend/lib/keys.js`:
- `AGENT#{modelId}` — state record `{ summary, turnCount, activeJobId?, updatedAt }`
- `AGENT#{modelId}#MSG#{ts13}` — turn messages `{ role, content, toolCalls?, createdAt }`

Reuse the compaction pattern from `companion-memory.js` (summary rollup at 30 turns). Add conditional-write `attribute_exists(pk)` to avoid a race (two rapid agent turns stomping each other's `turnCount`). Do **not** pollute `COMPANION#` — different lifecycle.

### Frontend — new AgentStage, reuse everything possible

**Mode toggle.** New `ModeContext` at `frontend/src/lib/mode/ModeContext.js`. Persists to `localStorage skr-mode`. Mounts `<AgentStage>` only when `mode === "agent"` AND current route is `/atelier`. All other routes ignore the flag.

New component tree under `frontend/src/components/sakura/agent/`:

```
AgentStage                    full-viewport overlay (reuse CompanionFullScreen z-1100 pattern)
├── StageBackdrop             reuse .skr-gradient-drift + var(--skr-gradient-hero)
├── StageTopStrip
│   ├── ModeToggle            new — flips mode, triggers ink-wash transition
│   ├── ThemeSwitcher         existing
│   └── MemoryBadge           new tiny — reuses /api/companion/memory/status
├── PanelStream               new — vertical scroll of MangaPanel (NOT bento)
│   ├── MangaPanel kind=user          user turn, right-aligned
│   ├── MangaPanel kind=agent         Hiyori speech bubble + reasoning
│   ├── MangaPanel kind=thinking      speed lines + skr-thinking-dot while tool runs
│   └── MangaPanel kind=tool-result   wraps existing GenerationCard + TweakInDashboard btn
├── HiyoriCorner              160px bottom-left, reuses CompanionCanvas
└── Composer                  textarea + send, auto-focus on mount
```

**New `AgentContext`** at `frontend/src/lib/agent/AgentContext.js` holding `{ turns, activeToolCall, submit }`. Keep `CompanionContext` untouched — in Agent mode the corner panel is hidden.

### Hero moment — first 5 seconds

1. `0.0s` User taps mode toggle in topbar.
2. `0.3s` Page content ink-washes outward (accelerated `skr-gradient-drift` as radial sweep — not a fade).
3. `0.8s` `AgentStage` fades in. Empty panel stream. Hiyori already in corner running idle.
4. `1.2s` Top panel appears with placeholder text "What should we make?" in Zen Kaku Gothic 900 at low opacity.
5. `2.0s` Composer auto-focuses. Hiyori speech bubble: "What are we making today?" — **canned text, no LLM call**. Zero latency first impression.

Restraint is the pitch — no sparkles, no onomatopoeia, no speed lines until the user acts.

---

## Files to modify

| File | Purpose |
|------|---------|
| `backend/routes/index.js` | Mount new `/api/agent/turn` route |
| `backend/lib/build-deps.js` | Register `ConverseCommand` dep + `agentMemory` helpers |
| `backend/lib/keys.js` | Add `buildAgentStateSk`, `buildAgentMsgSk`, `agentMsgPrefix` |
| `backend/lib/feature-flags.js` | Add `agentMode` flag (default false) |
| `frontend/src/App.js` | Wrap app in `ModeProvider`, conditionally render `<AgentStage>` on `/atelier` when mode=agent |
| `frontend/src/pages/Forge.js` | Hide the existing Forge form when `<AgentStage>` is mounted (sibling, not replacement — keeps Dashboard one toggle away) |
| `frontend/src/styles/animations.css` | Add `skr-bubble-tail` pseudo-element + `skr-speed-lines` keyframe. **Nothing else.** |
| `frontend/src/styles/components.css` | Add `.skr-manga-panel` class (thin outline, shoujo-pink border on agent turns, glass on user turns) |

## Files to create

| File | Purpose |
|------|---------|
| `backend/routes/agent-route.js` | `POST /api/agent/turn` — ConverseCommand + tool dispatch |
| `backend/lib/agent-tools.js` | Tool schema + dispatcher that calls existing route handlers (NOT new API calls) |
| `backend/lib/agent-memory.js` | Mirrors `companion-memory.js` shape against the new `AGENT#` SK |
| `frontend/src/lib/mode/ModeContext.js` | Global mode state + localStorage persistence |
| `frontend/src/lib/agent/AgentContext.js` | Agent turn state |
| `frontend/src/components/sakura/agent/AgentStage.js` | Top-level stage component |
| `frontend/src/components/sakura/agent/MangaPanel.js` | Reusable manga-panel primitive with variant prop |
| `frontend/src/components/sakura/agent/Composer.js` | Intent input + send |
| `frontend/src/components/sakura/agent/ModeToggle.js` | Topbar toggle + ink-wash transition trigger |
| `frontend/src/components/sakura/agent/TweakInDashboard.js` | Button that flips mode + pre-fills Forge URL params |

## Reusable pieces — do NOT duplicate

- `backend/lib/companion-memory.js` — pattern for rolling summary (copy the shape, point at new SK)
- `backend/routes/replicate-image-routes.js`, `bedrock-routes.js`, `civitai-image-routes.js` — `agent-tools.js` dispatches directly to these handlers, not via HTTP
- `frontend/src/components/sakura/companion/CompanionCanvas.js` — Live2D renderer (mount in `HiyoriCorner`)
- `frontend/src/components/sakura/companion/GenerationCard.js` — drop-in for tool-result panels
- `frontend/src/components/sakura/companion/CompanionFullScreen.js` — precedent for z-1100 overlay + full-viewport layout
- `frontend/src/lib/companion/CompanionContext.js` — event bus pattern. Reuse `CompanionActions.PAGE_NAVIGATE` / `GENERATION_*` — Agent mode dispatches the same events so Hiyori's Live2D reactions work for free
- `frontend/src/styles/animations.css` — `skr-bubble-in-side`, `skr-thinking-dot`, `skr-fade-rise`, `skr-gradient-drift` all ready to use
- `frontend/src/styles/tokens.css` — `--skr-accent` (sakura pink), `--skr-ease-spring`, `--skr-glass` — no new tokens needed

## Explicit cuts from v0 (flag for v1)

- All tools except `generate_image` (story, music, illustrate, gallery, favorites, set_theme)
- Bento/grid layout — v0 is vertical manga scroll
- Streaming / SSE — v0 is polling
- Mid-generation interruption + cancel
- `agentState` preference memory (lastStyle, lastLora) — v0 is stateless per turn
- Ink splash, screentone, sparkle burst, onomatopoeia primitives
- Mobile polish pass — v0 is desktop-first
- "Summon Agent" button in Dashboard Hiyori panel
- "Let Hiyori choose" ghost button in Dashboard forms
- Second model turn (summary after tool result)

---

## Verification

End-to-end checks before declaring v0 done:

1. **Toggle persistence.** Flip mode on `/atelier`, refresh, still agent. Navigate to `/sanctum` — toggle absent, admin UI unchanged.
2. **Intent → image round-trip.** Type "a cat in a space suit" in composer. Within 15s, a `MangaPanel` renders the result with the prompt visible. Network tab shows `POST /api/agent/turn` then provider generation call.
3. **Tool-use fired.** Backend logs show `ConverseCommand` returned `stopReason: "tool_use"`. Flag flip to false → route 404s → frontend shows graceful fallback (toast: "Agent mode is off").
4. **Memory isolation.** 5 turns in Agent mode, then open Dashboard Hiyori panel. Verify `/api/companion/chat` response doesn't contain agent turn content. DynamoDB scan confirms `AGENT#` and `COMPANION#` items are separate.
5. **Tweak-in-Dashboard lossless.** Click "Tweak in Atelier" on a result panel. Lands in Dashboard Forge with prompt + style + aspect pre-filled via URL params. Regenerate — identical image (same seed if provider supports).
6. **No Dashboard regression.** Run existing frontend Jest suite (`npm --prefix frontend run test:ci`) + backend (`npm --prefix backend test`). All pass.
7. **Live2D still reacts.** Hiyori plays her `generation_start` reaction when a tool fires (via shared `CompanionActions.GENERATION_START` dispatch). Visual smoke.
8. **Latency budget.** P50 first-panel-visible <2s, P50 result-image-visible <15s on Haiku 4.5 + Replicate. Log in CloudWatch.
9. **Hero moment feels right.** Manual QA: toggle on `/atelier`. Ink-wash transition plays, canned greeting appears within 2s without LLM call, composer auto-focuses.
10. **Deploy smoke.** After `npm --prefix cdk run idea:deploy -- --stage=dev`, hit the prod URL, flip feature flag via `/sanctum` FeatureFlagsSection, run checks 1–2 in the deployed env.

---

## Open questions for v1 (parked, not blocking v0)

- Streaming migration: API Gateway → Lambda Function URL with `awslambda.streamifyResponse` + SSE
- Full tool suite: `continue_story`, `illustrate_scene`, `generate_music`, `browse_gallery`, `recall_favorites`
- Bento panel layout (post-v0 visual upgrade once the single-column loop is loved)
- Additional manga primitives: ink splash, screentone, sparkle burst, onomatopoeia stamps
- Cross-session preference memory (`lastStyle`, `lastLora` in `agentState`)
- Mobile-first redesign (likely where Agent mode wins hardest — Dashboard forms are already weak on phones)
- Selection-to-edit: tap a past panel, "this one but crimson" (ChatGPT Canvas pattern)
- Re-roll/variation lane on every result (Suno pattern)
- `--ar 3:4` shorthand for power users who want precision inside Agent mode
