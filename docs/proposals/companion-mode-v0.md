# Companion Mode — design record (shipped v0)

> **Status:** v0 skeleton shipped 2026-05-19, deployed 2026-06-27 (frame + mode switch + 2 tools + TTS).
> This is a historical design record — the *why*. For current behavior see
> [`../architecture.md`](../architecture.md) §5 and [`../ai-context.md`](../ai-context.md);
> for roadmap [`../state-of-the-art.md`](../state-of-the-art.md) §12.

## What it is
A third `ModeContext` value (`"companion"`) that takes over the whole viewport: the app shell
disappears, Hiyori scales up, and the composer is the only input. Every non-admin operation happens
through the conversation. A single ✕ returns to the dashboard. It reuses the **full agent backend**
(`/api/agent/turn`, tools, memory, sessions, rate limits, daily caps) — the conversation can *do
things*, not just talk — which distinguishes it from the tool-less `CompanionFullScreen` chat overlay.

## Design decisions (the rationale worth preserving)
- **App.js renders `<CompanionStage />` instead of the shell** when `mode === "companion"` — no
  shell-suppression CSS, just don't mount the shell. `CompanionStage` reuses MangaPanel + Composer
  (which already has mic + 🔊), so no duplicate "wide chat panel" was built.
- **Admin operations are refused by design** via a `COMPANION_MODE_ADDENDUM` appended to the system
  prompt when `ctx.mode === "companion"` — canned polite refusal + one-click "drop into dashboard".
  This is the core safety property of the mode.
- **TTS landed first** as a cross-cutting precursor (works in agent mode too): 🔊 toggle in Composer,
  auto-speaks replies, cancel-on-interrupt, persisted to `localStorage["skr-tts-enabled"]`.
- **"View" tools must round-trip to DynamoDB** and narrate only returned items — never invent ("you
  have 12 images" when the user has 3). Hallucination guard baked into the tool contract.
- **Caps are not exempt** — companion mode rides the same daily token + image caps as agent mode.

## Still parked (v1 follow-ups)
- **6 more tools:** `open_story_session`, `read_scene`, `share_image`, `unshare_image`,
  `delete_image`, `change_brightness`, `sign_out`.
- Tailored frontend cards for `view_my_creations` + `what_can_you_do` (today they fall through to the
  generic `ToolResultPanel`).
- Always-on mic / "hey Hiyori" hotword, vision input (image upload), a "tell me a story" generative
  tool, mid-flight cancel, biometric gate for destructive ops, mobile-first polish.
- **Open questions:** own `/companion` URL vs pure modal state (v0 chose modal for refresh
  predictability); shared session memory with agent mode vs separate (v0 keeps them separate).
