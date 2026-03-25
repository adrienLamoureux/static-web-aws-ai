# Improvements - design-sakura

## Purpose
- Track shared improvements rolled out to this idea stack.

## Log

### 2026-03-25 — Live2D companion character (Hiyori)

Replaced the SVG chibi walker with a proper Live2D companion.

**What shipped:**
- `CharacterWalker.js` — pixi-live2d-display renderer, RAF horizontal movement, edge-pause with Flick motion, document-level click hit-test, canvas hidden pending refinement
- `CompanionDialog.js` — speech bubble anchored above character, auto-close 10s, clamped to viewport
- Hiyori Momose model assets (`hiyori_free_t08`, Cubism 3) in `public/live2d/hiyori/runtime/`
- `live2dcubismcore.min.js` loaded in `<head>` of `index.html`
- `POST /api/companion/chat` backend route (Bedrock Haiku) committed to `codex/dev`

**Known gaps at time of shipping:**
- No expression changes (free model has no .exp3.json files)
- Companion dialog calls the sakura stack's own Lambda, which doesn't yet have the backend route
- Scale/position/speed need visual tuning before un-hiding
