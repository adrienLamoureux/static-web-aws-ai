# Music Pill Redesign — `skr-music-pill`

> **Status:** Ready for implementation
> **Branch:** `codex/design-sakura/code`
> **Worktree:** `/Users/adrienlamoureux/Documents/code/wt/design-sakura/code`
> **Scope:** `frontend/**` only

## Context

The current `skr-music-pill` element (top-right of every page in `design-sakura`) was implemented to give the Sakura Bloom design a small persistent music reader. Functionally it works — it's a real audio player wired to the dev backend's `/story/music-library` endpoint, with track picker, seek, play/pause, and stop. But visually it feels off:

- The 3-bar "EQ" animation is a static CSS keyframe with hard-coded staggered timing — it has **zero relationship to the audio that's actually playing**. It looks like decoration even when there's silence.
- The pill is sandwiched between the topbar, the ThemeSwitcher, and the top of the main content area, with no visual integration into either — it feels like a floating widget rather than part of the Sakura Bloom design language.
- It misses the user's stated intent: a "music reader — something small but cool/beats". Today it's small but not cool, and certainly not beat-driven.

The good news: the codebase already contains a fully-built **real-time WebAudio FFT visualizer hook** (`frontend/src/components/music/useAudioBars.js`, 234 lines) that nobody is using anymore — its only consumer (`SolarisMusicDock`) is hidden via `display: none`. The hook returns 24 audio-reactive bar values + an `isPeak` boolean for beat detection, with graceful fallback to a BPM-driven sway when WebAudio is unavailable, and respects `prefers-reduced-motion`. This is exactly the missing infrastructure for a "beats" feel.

The intended outcome: **an audio-reactive music reader that genuinely feels alive when music is playing, fits the Sakura Bloom glass + glow + sakura-pink aesthetic, stays compact, and reuses existing infrastructure rather than reinventing it.**

## Confirmed scope (locked in by user)

- **Concept:** Live Spectrum Pill (Concept A — see "alternatives considered" at the bottom)
- **Position:** keep at top-right (no layout move)
- **Idle:** stay always visible (with a softly breathing `♪`)
- **CSS location:** edit `frontend/src/styles/components.css` in place (no new CSS file)

---

## Approach: Live Spectrum Pill

The pill stays in place at top-right and stays always visible (idle when no track). The fake 3-bar EQ is replaced with a real audio-reactive 10-bar mini-spectrum driven by the dormant `useAudioBars` hook. The pill's border + box-shadow pulses with detected beats via the hook's `isPeak` flag. A subtle accent gradient washes over the pill body while playing, and the progress bar gains a small leading-edge glow. Idle state shows a softly breathing `♪`.

**Solves the brief:**
- *"Beats"* → bars genuinely move with the audio; halo pulses on bass hits
- *"Cool"* → beat-synced glow using the existing `--skr-glow-strong` token
- *"Small"* → footprint identical to today
- *"Off with the design"* → uses only Sakura tokens the rest of the UI already uses (`--skr-glow`, `--skr-glow-strong`, `--skr-accent`, `--skr-glass`), so it visually rhymes with the companion bubble, brand emblem, and HUD

**Reuses:** `useAudioBars` (the entire dormant 234-line hook), all existing `--skr-*` tokens, current pill skeleton.

**Risks:** WebAudio's `createMediaElementSource` requires `crossOrigin="anonymous"` on the `<audio>` element AND CORS headers on the S3 audio URLs. The hook falls back gracefully to BPM-sway if WebAudio fails, but the `<audio>` element itself will refuse to load cross-origin without CORS headers when `crossOrigin` is set. **Mitigation:** verify CORS in dev before flipping `crossOrigin` on; if S3 lacks CORS, leave `crossOrigin` off and accept BPM-sway mode (still vastly better than today).

## Critical files

**Modify:**
- `frontend/src/components/sakura/SakuraMusicBar.js` (currently 153 lines) — wire `useAudioBars`, render reactive bars, propagate `isPeak` to root class, conditionally add `crossOrigin="anonymous"` to `<audio>`
- `frontend/src/styles/components.css` (lines ~331–486 contain the music pill block) — replace the `.skr-music-eq` block (lines ~353–373) with variable-driven bars; add `.skr-music-pill.is-peak` halo rule; add subtle playing-state gradient; refine progress bar leading edge

**Read/reference (no changes):**
- `frontend/src/components/music/useAudioBars.js` — the hook being reactivated; returns `{ bars, mode, isPeak, isReducedMotion }`; takes `{ audioRef, isPlaying, tempoBpm, trackKey }`
- `frontend/src/contexts/MusicContext.js` — track shape (`tempoBpm`, `key`, etc.)
- `frontend/src/styles/tokens.css` — glow/glass/accent tokens already defined (`--skr-glow`, `--skr-glow-strong`, `--skr-border-strong`, `--skr-accent`, `--skr-glass`)

## Component changes (`SakuraMusicBar.js`)

1. **Conditionally add `crossOrigin` to the audio element** so WebAudio can analyse the stream:
   ```jsx
   <audio
     ref={audioRef}
     crossOrigin="anonymous"
     onTimeUpdate={...}
     ...
   />
   ```
   *Risk:* if the S3 pre-signed URLs don't return CORS headers, the audio may fail to load entirely. **Verify in dev before committing.** If CORS isn't configured, omit `crossOrigin` and the hook will silently fall back to BPM-sway mode — the visual is still a major upgrade.

2. **Import and call the hook:**
   ```js
   import useAudioBars from "../music/useAudioBars";
   ...
   const { bars, isPeak } = useAudioBars({
     audioRef,
     isPlaying: playing,
     tempoBpm: currentTrack?.tempoBpm,
     trackKey: currentTrack?.key,
   });
   ```

3. **Pick a compact subset of bars** to fit the pill (24 bars is too many for a small reader):
   ```js
   // Take every other bar from the middle frequency range — 10 bars total
   const visibleBars = useMemo(
     () => bars.filter((_, i) => i % 2 === 0).slice(2, 12),
     [bars]
   );
   ```

4. **Replace the static EQ render block:**
   ```jsx
   <div className={`skr-music-eq${playing ? " is-playing" : ""}`} aria-hidden="true">
     {currentTrack ? (
       visibleBars.map((h, i) => (
         <span key={i} style={{ "--skr-bar-h": h }} />
       ))
     ) : (
       <span className="skr-music-note">♪</span>
     )}
   </div>
   ```

5. **Apply beat-peak class to the root pill** for halo glow:
   ```jsx
   <div
     className={`skr-music-pill${playing ? " is-playing" : ""}${isPeak ? " is-peak" : ""}`}
     ref={panelRef}
   >
   ```

6. **No state-management changes.** No new context, no new props — the hook handles all its own state internally.

Estimated final size: **~180 lines** (currently 153). Well within the 500-line file budget.

## CSS changes (`components.css`, lines ~331–486)

1. **Replace the EQ bar block** (currently `.skr-music-eq span` with three `nth-child` keyframe animations) with variable-height bars:
   ```css
   .skr-music-eq {
     display: flex;
     align-items: flex-end;
     gap: 1.5px;
     height: 16px;
     flex-shrink: 0;
   }
   .skr-music-eq span {
     display: block;
     width: 2px;
     background: var(--skr-accent);
     border-radius: 1px;
     height: calc(2px + var(--skr-bar-h, 0.12) * 14px);
     opacity: 0.55;
     transition: height 0.05s linear, opacity 0.2s ease;
   }
   .skr-music-eq.is-playing span {
     opacity: 1;
   }
   ```
   Delete the three `nth-child` animation rules and the `@keyframes skr-eq` block — they're no longer needed.

2. **Add the beat-peak halo** on the root pill:
   ```css
   .skr-music-pill {
     transition: box-shadow 0.22s ease, border-color 0.22s ease;
   }
   .skr-music-pill.is-peak {
     box-shadow: var(--skr-glow-strong), 0 4px 20px rgba(0, 0, 0, 0.35);
     border-color: var(--skr-border-strong);
   }
   ```

3. **Add a subtle accent wash when playing** (gives the pill a faint pink tint while music is on):
   ```css
   .skr-music-pill.is-playing {
     background: linear-gradient(
       135deg,
       var(--skr-glass),
       rgba(255, 107, 157, 0.06) 60%,
       var(--skr-glass)
     );
   }
   ```

4. **Refine the progress bar leading edge** with an accent glow:
   ```css
   .skr-music-pill-progress-fill {
     position: relative;
     box-shadow: 0 0 6px rgba(255, 107, 157, 0.6);
   }
   ```

5. **Idle note pulse** — gentle breathing on the `♪` when no track is loaded:
   ```css
   @keyframes skr-note-breathe {
     0%, 100% { opacity: 0.4; }
     50%      { opacity: 0.8; }
   }
   .skr-music-note {
     animation: skr-note-breathe 2.4s ease-in-out infinite;
   }
   ```

Net CSS delta: **~10 lines added, ~15 lines removed** (the three `nth-child` rules and `@keyframes skr-eq` block disappear). `components.css` ends up roughly the same size.

## Step-by-step execution order

1. Read `frontend/src/contexts/MusicContext.js` to confirm the `tempoBpm` field is on `currentTrack` (it should be, per the data shape; verify before relying on it).
2. Verify CORS on the S3 pre-signed URLs (test live: load the pill with `crossOrigin="anonymous"` set on the `<audio>` element and see whether playback still works).
3. Edit `frontend/src/components/sakura/SakuraMusicBar.js`:
   - Import `useAudioBars`
   - Add `crossOrigin="anonymous"` to `<audio>` (only if step 2 succeeds; otherwise skip and accept fallback mode)
   - Call the hook with `{ audioRef, isPlaying: playing, tempoBpm, trackKey }`
   - Compute `visibleBars` via `useMemo`
   - Replace EQ render block with mapped bars + CSS variable
   - Add `is-playing` and `is-peak` classes to root pill
4. Edit `frontend/src/styles/components.css`:
   - Delete the three `.skr-music-eq.is-playing span:nth-child(N)` animation rules
   - Delete `@keyframes skr-eq`
   - Replace `.skr-music-eq span` rule with variable-height version
   - Add `.skr-music-pill { transition }` + `.is-peak` rule
   - Add `.skr-music-pill.is-playing` gradient
   - Add `.skr-music-pill-progress-fill` glow
   - Add `@keyframes skr-note-breathe` + apply to `.skr-music-note`
5. Local dev: `npm --prefix frontend start`, sign in, pick a track, watch the pill come alive.
6. If WebAudio falls back to BPM-sway, debug CORS / `crossOrigin` setup.
7. Test reduced-motion (DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`) — bars should freeze flat, halo should not pulse.
8. Test theme switching — confirm pill renders correctly under all 9+ themes (the rules use only tokens, so this should be free).
9. Test mobile width — confirm pill remains usable; check `frontend/src/styles/responsive.css` line 9 for any stale `.skr-music-bar` references that should be cleaned up to `.skr-music-pill`.
10. Run `npm --prefix frontend run test:ci` to confirm no RTL test breakage.
11. Run `npm --prefix frontend run build` to check bundle still builds clean.

## Edge cases (all handled by `useAudioBars`)

- **No track loaded** → `currentTrack` is null → render falls back to `♪` icon with breathe animation; hook is called with `trackKey: undefined` and returns idle bars.
- **WebAudio blocked / CORS fails on analyser** → hook falls back to BPM-driven sway. Pill still feels alive. `isPeak` still works.
- **`prefers-reduced-motion: reduce`** → hook returns idle bars and stops the animation loop; bars sit at idle height; `isPeak` stays false; no halo pulses.
- **No `tempoBpm` on track** → hook uses `FALLBACK_BPM_DEFAULT = 96`.
- **Track switch** → `trackKey` changes → hook resets bars to idle for the new track.
- **Theme switch** → pill colors come from CSS variables → free. No JS involvement.
- **Stop / dismiss** → `currentTrack` becomes null → audio src cleared → `playing = false` → hook sees `isPlaying: false` → animation loop stops → bars reset to idle.
- **Tab backgrounded** → `requestAnimationFrame` already pauses when the tab is hidden.

## Verification

**Manual smoke:**
1. `npm --prefix frontend start`
2. Sign in via the dev Cognito
3. Open the pill's `▾` dropdown → pick a track → confirm:
   - Audio plays
   - Bars dance along with the music (not a looped CSS animation)
   - Pill border/shadow occasionally pops brighter on bass hits
   - Subtle pink wash on the pill body while playing
4. Pause → bars freeze at current value, halo stops pulsing
5. Stop (`✕`) → pill returns to idle `♪` state with gentle breathe
6. Switch themes via the topbar `<ThemeSwitcher>` → confirm pill adapts under each theme
7. DevTools → Rendering → set `prefers-reduced-motion: reduce` → bars freeze flat, halo doesn't pulse
8. Resize to mobile (375px wide) → pill should still be visible and usable
9. (Optional) Open `MusicContext` in React DevTools → confirm `currentTrack.tempoBpm` is present for at least one library track; if not, bars will use the 96 BPM fallback

**Automated:**
- `npm --prefix frontend run test:ci` — confirm no RTL test regressions
- `npm --prefix frontend run build` — confirm build succeeds

**Deploy verification (after merge to `codex/design-sakura/code`):**
- Follow the design-sakura deploy procedure: build → fetch deployed `config.json` → `s3 sync` (excluding live2d) → `s3 sync` live2d → CloudFront invalidation
- Open `https://d2lepwk3t4buta.cloudfront.net`, sign in, repeat the manual smoke

---

## Alternatives considered (rejected)

For the record, three other concepts were sketched and rejected by the user in favor of Concept A above:

- **Concept B — Cassette Vinyl:** Replace the pill with a circular spinning vinyl record (~60px) rotating at BPM speed. Click to play, hover for title. Distinctive but title is hidden by default → less "music reader" at a glance. Doesn't reuse `useAudioBars`.
- **Concept C — Beat Orb + Marquee:** Tiny glowing orb (~24px) that scales with audio amplitude, plus a slow-scrolling title strip. Most minimal but two-state UX adds complexity.
- **Concept D — Radial Sakura Petals:** 8 petal-shaped bars arranged radially around a play button, each driven by a frequency bin. Most thematic but biggest CSS rewrite, larger footprint, breaks the pill shape language of the rest of the HUD.

Each of these can be revisited later — once the audio plumbing from Concept A exists, swapping the visualizer render is cheap.
