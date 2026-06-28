# Agent Mode — design record (shipped)

> **Status:** shipped and live. v0 → **v1.7** (multiple sessions + voice input), 2026-04-26 → 2026-05-12.
> This is a historical design record — the *why*. For current behavior see
> [`../architecture.md`](../architecture.md) §5–6 and [`../ai-context.md`](../ai-context.md);
> for endpoints [`../api-spec.md`](../api-spec.md) "Agent Mode (v1.7)"; for roadmap
> [`../state-of-the-art.md`](../state-of-the-art.md) §12. Per-version deltas live in git history.

## What it is
A conversational mode (route-scoped to `/atelier`, toggled via `ModeContext`) where the user chats
with Hiyori and she calls real tools via a Bedrock **Converse** tool-use loop — generate images,
continue stories, illustrate scenes, score music, recall favorites, browse the gallery, set theme.

## Design decisions (the rationale worth preserving)
- **New `/api/agent/turn` route — never touch `/api/companion/chat`.** Agent traffic is tool-heavy
  and short-lived; the companion chat endpoint is identity/memory-focused. Keeping them separate
  avoided regressing the existing companion and let agent memory live in its own `AGENT#` namespace.
- **Three tool classes by control-flow need:** *server-dispatch* (backend executes, then a ≤120-tok
  closing turn comments), *client-action* (`set_theme`, applied in React), *intent* (user confirms
  before any write hits their Chronicle). This is why the frontend renders different panels per tool.
- **Synchronous fast-path** for `generate_image`: when Replicate succeeds within `Prefer: wait=5`,
  the backend writes the IMG row + returns the signed URL, so the UI skips polling on the happy path.
- **Cross-session prefs** (`AGENT#STATE`) injected as `<prefs>` bias tool defaults toward prior
  choices — enum-validated read+write because they re-enter the prompt (self-injection guard).
- **"Hero moment" ethos:** canned greeting (no LLM round-trip), staged client-side "thinking" labels,
  and the ink-wash mode transition exist so latency *feels* eventful rather than dead.
- Companion-panel reuse over a new `HiyoriCorner` — see [ADR-007](../adr/007-companion-panel-over-hiyori-corner.md).

## Still parked (not yet built)
- **Streaming responses** — API Gateway → Lambda Function URL with `awslambda.streamifyResponse` + SSE
  (the headline remaining item; everything else is incremental).
- Extra manga primitives: ink splash, screentone, sparkle burst, onomatopoeia stamps.
- `--ar 3:4` shorthand parsing for power users.

> The original v0 cut-list (full tool suite, cross-session prefs, selection-to-edit, re-roll, mobile
> polish, "Summon Agent", per-field suggest, bento layout) has all since shipped.
