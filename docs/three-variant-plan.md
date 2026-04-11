# Three Anime-Focused UI Variant Worktrees — Master Plan

> Created: 2026-03-21
> Base branch: `codex/design-fusion/code` (Solaris design system)
> Target audience: Young anime/manga enthusiasts
> Backend: All 73 endpoints from `codex/dev` reused as-is

---

## Context

Whisk Studio's design-fusion branch uses the "Solaris" design system — warm, light-first, editorial (amber on cream). While functional, it underserves the core audience:

- No dark mode (anime fans strongly prefer dark themes)
- Conservative animations (150ms micro-interactions only)
- No visual novel presentation for stories
- No gamification or character showcase
- Weak mobile UX (sidebar just hides, no bottom nav)
- No particle effects, no parallax, no dramatic transitions

This plan proposes 3 radically different dark-themed variants, each targeting a different anime sub-culture, while reusing all existing backend APIs and preserving the Cognito auth contract.

---

## Shared Constraints (All 3 Variants)

### Must Preserve (Frozen Contracts)
- Provider chain: `ConfigProvider -> AuthProvider -> MusicProvider -> Router`
- `AuthContext.js`, `ConfigContext.js`, `MusicContext.js` — zero modifications
- All `services/*.js` and `utils/*.js` files — zero modifications
- Runtime config from `/config.json` (apiBaseUrl + Cognito config)
- Story response shape: `{ session, messages[], scenes[] }` at top level
- Session ID: `session.id` (not `sessionId`)
- Messages have NO `sceneId` — chronological matching on frontend
- Music track shape: `{ key, url, title, source, mood, energy, tempoBpm, tags, updatedAt }`
- Legacy redirect routes from old paths
- Forge cache keys: `whisk_images_cache`, `whisk_videos_cache`
- `AuthCallback.js` used unmodified

### Auth Integration Protocol (Critical)
1. **First implementation step** for every variant: get auth flow working before any visual work
2. Smoke test sequence: `/login` -> Cognito redirect -> `/auth/callback` -> protected route renders -> API call has Bearer token -> logout -> redirect to `/login`
3. `ProtectedRoute` logic embedded in each variant's shell component
4. `startLogin()` and `logout()` called identically (only CSS changes on login page)
5. Login page animations must not interfere with `window.location.assign()` redirect

### Worktree Creation Protocol
```bash
# From main repo root
git worktree add ../wt/<variant>/code -b codex/design-<variant>/code codex/dev
# Then in the worktree: cherry-pick or merge design-fusion's services/contexts/utils
```

### Deploy Protocol
```bash
npm --prefix cdk run idea:deploy -- --stage=design-<variant>
# Post-deploy: sanity (6 checks) + UI smoke (Playwright) must both pass
```

### UI Smoke Test Updates
Each variant must update `cdk/scripts/ui-smoke.mjs` to match its route structure and expected page texts.

---

## Variant 1: SAKURA — Maximalist Immersive

### Identity
| Property | Value |
|----------|-------|
| Name | Sakura |
| Design System | Sakura Bloom |
| CSS Prefix | `skr-` |
| Idea ID | `design-sakura` |
| Branch | `codex/design-sakura/code` |
| Worktree | `wt/design-sakura/code` |
| Inspiration | Genshin Impact launcher, Fate/Grand Order, Ren'Py VN engines, Honkai Star Rail |

### Color Palette
```css
:root {
  --skr-bg: #0D0B14;              /* deep indigo-black */
  --skr-surface: #1A1726;          /* plum-tinted dark */
  --skr-elevated: #251F35;         /* soft violet dark */
  --skr-accent: #FF6B9D;           /* sakura pink */
  --skr-accent-secondary: #C084FC; /* wisteria purple */
  --skr-accent-info: #38BDF8;      /* sky blue */
  --skr-text: #F0E6FF;             /* warm white-lavender */
  --skr-text-secondary: #A78BDB;   /* muted lavender */
  --skr-text-muted: #6B5A8A;
  --skr-border: rgba(168, 139, 219, 0.15);
  --skr-glow: rgba(255, 107, 157, 0.25);
}
```

### Typography
- Headings: "Zen Kaku Gothic New" (Japanese-friendly geometric), 32-48px, `-0.02em` tracking
- Body: "Noto Sans JP", 14-16px
- Code/metadata: "JetBrains Mono"

### Navigation Model
- **Bottom floating HUD**: Translucent pill bar fixed at bottom center (56px), 5 icon+label items
- Active item: glowing pink underline + scale-up
- **No sidebar** — full viewport for content
- Sub-pages: slide-in glass panels from right edge
- Quick-action radial: long-press brand mark for shortcuts

### Route Map
| Route | Name | Feature |
|-------|------|---------|
| `/` | Realm | Sakura petal particle hero + featured image + horizontal nav cards |
| `/atelier` | Atelier | Split-panel: glass controls left, live preview right. Segmented tabs (Images/Videos) |
| `/chronicle` | Chronicle | Chapter select (vertical timeline). Active session = VN reader mode |
| `/gallery` | Gallery | Masonry grid with `mix-blend-mode: luminosity` hover + gold-border favorites |
| `/sanctum` | Sanctum | Admin "control room" with gradient-border stat cards |
| `/sanctum/sounds` | Sound Vault | Track list with waveform previews, mood shown as colored orbs |
| `/sanctum/lora` | LoRA Archive | Card grid with glowing strength sliders |

### Key Differentiating Features

**1. Visual Novel Reader Mode (Storyboard)**
- Full viewport VN reader when inside a story session
- Scene illustration fills background with Ken Burns pan/zoom
- Translucent text box at bottom third with typewriter effect (15ms/char)
- Character portrait slides in from left (from Character system)
- Scene transitions: dissolve or curtain-wipe CSS animations
- "🎨 Illustrate" becomes a VN-style action button in the text box

**2. Sakura Petal Particle Hero (Home)**
- Canvas-based sakura petal system using `@tsparticles/slim`
- 40 petals with gravity, wind, opacity fade, size 8-16px
- FPS capped at 30, reduced to 20 petals on mobile
- Falls over a single large featured image

**3. Character Showcase Gallery**
- Dedicated `/characters` sub-route
- Collectible cards with parallax tilt on hover (`perspective(800px) + rotateY/rotateX`)
- Shows portrait, traits, bound LoRA profile

**4. Immersive Music Player**
- Bottom HUD expands upward to reveal radial waveform visualizer
- Uses existing `useAudioBars` hook rendered as `conic-gradient` + canvas overlay

**5. Theatre Mode for Videos**
- Scene video enters near-fullscreen with letterbox bars
- Ambient light bleed behind video (CSS box-shadow matching dominant color)

### Animation Strategy
| Animation | Technique | Duration |
|-----------|-----------|----------|
| Page transitions | CSS View Transitions API + framer-motion fallback | 300ms cross-fade + 20px Y-slide |
| Scroll parallax | `animation-timeline: scroll()` on home hero | Continuous |
| VN typewriter | CSS `steps()` + JS interval | 15ms/char |
| Card hover tilt | `onMouseMove` -> CSS `transform: perspective(800px) rotateY/rotateX` | 200ms ease-out |
| Particle system | `@tsparticles/slim` — 40 petals, gravity 0.3, wind 0.1 | Continuous |
| Music dock expand | `max-height` with `cubic-bezier(0.34, 1.56, 0.64, 1)` elastic | 400ms |
| HUD indicator | `translateX()` slide | 250ms ease |
| Scene transition | Two stacked `<img>` opacity crossfade / `clip-path: inset()` curtain | 600ms |
| Loading shimmer | `linear-gradient` translate with pink tint | 1.5s infinite |

### Libraries
| Package | Version | Purpose |
|---------|---------|---------|
| `@tsparticles/react` | `^3.0.0` | Particle system rendering |
| `@tsparticles/slim` | `^3.0.0` | Lightweight particle engine |
| `framer-motion` | `^11.0.0` | Page transitions, layout animations, AnimatePresence |
| `react-transition-group` | `^4.4.5` | View Transitions API fallback |
| `zustand` | `^4.5.0` | VN reader state (scene, text progress, portrait) |
| `react-intersection-observer` | `^9.8.0` | Scroll-triggered animations + lazy loading |

### Component Architecture (~28 new components)
- `SakuraShell.js` — App shell with bottom HUD, no sidebar
- `SakuraHUD.js` — Bottom navigation bar
- `SakuraHero.js` — Particle system + featured image
- `SakuraGlassPanel.js` — Reusable glass morphism container (`backdrop-filter: blur(16px)`)
- `SakuraCard.js` — Base card with glow border
- `SakuraCharacterCard.js` — Parallax tilt character card
- `VNReader.js` — Visual novel full-screen reader
- `VNTextBox.js` — Bottom-third typewriter text box
- `VNPortrait.js` — Character portrait slide-in
- `VNSceneTransition.js` — Crossfade/curtain-wipe manager
- `SakuraTheatreMode.js` — Video playback overlay
- `SakuraMusicExpanded.js` — Expanded radial visualizer
- `SakuraTimeline.js` — Story session chapter select
- `SakuraPageTransition.js` — View Transitions wrapper

### Risks
| Risk | Severity | Mitigation |
|------|----------|------------|
| `tsparticles` bundle size (+80KB gz) | Medium | `@tsparticles/slim` + lazy load + `React.lazy` |
| View Transitions browser support (~75%) | Low | Feature-detect, fall back to framer-motion |
| VN reader complexity | High | Isolated zustand store, test independently |
| Mobile performance (particles + blur) | High | Disable particles on `prefers-reduced-motion`, reduce blur on mobile |

### Estimates
- **New/modified files:** ~65
- **New LOC:** ~8,000-10,000
- **CSS LOC:** ~1,400
- **Complexity:** High
- **Timeline:** 3-4 weeks with Claude assistance

---

## Variant 2: KITSUNE — Modern Clean with Strong Anime Identity

### Identity
| Property | Value |
|----------|-------|
| Name | Kitsune |
| Design System | Kitsune Mono |
| CSS Prefix | `kit-` |
| Idea ID | `design-kitsune` |
| Branch | `codex/design-kitsune/code` |
| Worktree | `wt/design-kitsune/code` |
| Inspiration | AniList, Crunchyroll, MyAnimeList, Spotify |

### Color Palette
```css
:root {
  --kit-bg: #0B1622;              /* AniList deep navy */
  --kit-surface: #151F2E;          /* lighter navy */
  --kit-elevated: #1F2937;         /* blue-gray */
  --kit-card: #1A2332;
  --kit-accent: #3DB4F2;           /* AniList sky blue */
  --kit-accent-heart: #EC4899;     /* hot pink for favorites */
  --kit-success: #4ADE80;          /* green for completed */
  --kit-warning: #FBBF24;          /* amber for in-progress */
  --kit-text: #EDF1F5;
  --kit-text-secondary: #8BA0B2;
  --kit-text-muted: #516170;
  --kit-border: rgba(139, 160, 178, 0.12);
}
```

### Typography
- All text: "Plus Jakarta Sans", weights 400/500/600/700
- Headlines: 24-32px
- Body: 14px
- Metadata: 11-12px, `0.04em` letter-spacing, uppercase

### Navigation Model
- **Left sidebar (220px):** Fixed, always visible on desktop. Active = filled background pill with blue accent
- **Mobile (< 768px):** Bottom tab bar (5 items) with swipe gestures for sub-tabs
- **Top bar:** Page title + global search input + user avatar dropdown
- **Cmd+K command palette:** Search across stories, images, characters, LoRA models

### Route Map
| Route | Name | Feature |
|-------|------|---------|
| `/` | Home | Activity feed (vertical timeline) + quick-stats row + "Continue creating" cards |
| `/studio` | Studio | Accordion controls left, result grid right. Segmented toggle Images/Videos |
| `/stories` | Stories | Card grid (3 columns) with cover image, status badge, message count |
| `/browse` | Browse | Tabbed: Images / Videos / Favorites. Infinite-scroll masonry |
| `/admin` | Admin | Tab-based: Dashboard / Characters / Sound Vault / LoRA |
| `/admin?tab=sounds` | Sound Vault | Table layout with inline playback, tag chips, waveform thumbnail |
| `/admin?tab=lora` | LoRA Catalog | Card grid with model preview, base model badge, search bar |

### Key Differentiating Features

**1. Activity Feed (Home)**
- Vertical timeline of recent actions: "You generated an image", "Story session updated", "New LoRA synced"
- Each card: thumbnail + timestamp + quick-action button
- Synthesized from existing API data (no new backend endpoints)

**2. Command Palette (Cmd+K)**
- Built with `cmdk` library (headless, accessible)
- Searches across stories, characters, images, LoRA models
- Results grouped by type with keyboard navigation
- Quick actions: "New Story", "Generate Image", "Switch Character"

**3. Status-Colored Story Tracking**
- Sessions get colored status indicators (blue = in progress, green = completed, amber = needs attention)
- Session card shows completion percentage bar

**4. Character Profile Pages**
- Dedicated route `/admin/characters/:id`
- Portrait, attributes table, LoRA bindings, gallery of all images generated with that character

**5. Smart Music Queue**
- Full Spotify-style now-playing bar (bottom)
- Tracks auto-queue based on story mood metadata
- Queue management via slide-up panel

**6. Inline Image Comparison**
- Side-by-side slider comparison in Forge for different LoRA strengths

### Animation Strategy
| Animation | Technique | Duration |
|-----------|-----------|----------|
| Page transitions | framer-motion `AnimatePresence mode="wait"` | 200ms fade + 10px Y |
| Card hover | `border-color` transition + `translateY(-2px)` + shadow | 150ms |
| List stagger | framer-motion `variants` + `staggerChildren` | 30ms delay between items |
| Tab indicator | `translateX` slide | 200ms |
| Skeleton loading | Opacity oscillation pulse | 1s cycle |
| Music bar slide-in | `translateX` from left | 300ms |
| Cmd+K modal | Scale 0.95->1.0 + backdrop fade | 150ms ease-out |
| Favorite heart | Scale 1.0->1.3->1.0 + pink drop-shadow burst | 300ms |
| Scroll fade-in | Intersection Observer, one-shot opacity+Y | 200ms |

### Libraries
| Package | Version | Purpose |
|---------|---------|---------|
| `framer-motion` | `^11.0.0` | Page transitions, list staggering |
| `cmdk` | `^1.0.0` | Command palette (Cmd+K) |
| `react-intersection-observer` | `^9.8.0` | Scroll fade-ins + infinite scroll |
| `react-virtuoso` | `^4.7.0` | Virtualized lists for activity feed and galleries |
| `date-fns` | `^3.6.0` | Human timestamps ("2 hours ago") |

### Component Architecture (~22 new components)
- `KitsuneShell.js` — Sidebar + topbar + content
- `KitsuneSidebar.js` — Fixed left nav with mobile collapse
- `KitsuneBottomTabs.js` — Mobile bottom tab bar
- `KitsuneCommandPalette.js` — Cmd+K modal (wraps `cmdk`)
- `KitsuneActivityFeed.js` — Home activity timeline
- `KitsuneActivityCard.js` — Individual activity item
- `KitsuneStatsRow.js` — Quick-stats horizontal cards
- `KitsuneImageGrid.js` — Masonry grid with hover overlays
- `KitsuneSessionCard.js` — Story session with status badge
- `KitsuneCharacterProfile.js` — Full character page
- `KitsuneMusicBar.js` — Spotify-style now-playing bar
- `KitsuneMusicQueue.js` — Queue management panel
- `KitsuneStatusBadge.js` — Color-coded status chip
- `KitsuneAccordion.js` — Collapsible control groups
- `KitsuneFavoriteButton.js` — Animated heart button

### Risks
| Risk | Severity | Mitigation |
|------|----------|------------|
| Activity feed needs no new endpoints | Low | Synthesize from existing: recent images (S3 list), sessions, LoRA syncs |
| Mobile bottom tabs + music bar stacking | Medium | Music bar above tabs: 48px + 56px = 104px bottom padding |
| High info density on small screens | Medium | Reduce grid columns, hide secondary metadata, collapse stats into carousel |

### Estimates
- **New/modified files:** ~53
- **New LOC:** ~6,000-7,500
- **CSS LOC:** ~1,100
- **Complexity:** Medium
- **Timeline:** 2-3 weeks with Claude assistance

---

## Variant 3: YOKAI — Experimental Retro-Futuristic

### Identity
| Property | Value |
|----------|-------|
| Name | Yokai |
| Design System | Yokai Neon |
| CSS Prefix | `yk-` |
| Idea ID | `design-yokai` |
| Branch | `codex/design-yokai/code` |
| Worktree | `wt/design-yokai/code` |
| Inspiration | Evangelion NERV UI, Persona 5 menus, Pixiv Fanbox, Cowboy Bebop credits, CRT terminals |

### Color Palette
```css
:root {
  --yk-bg: #0A0A0F;              /* true near-black */
  --yk-surface: #12121A;          /* ink */
  --yk-elevated: #1C1C28;         /* midnight */
  --yk-accent: #00FFA3;           /* neon green */
  --yk-accent-danger: #FF3366;    /* neon red-pink */
  --yk-accent-creative: #7B61FF;  /* electric purple */
  --yk-accent-info: #00E5FF;      /* cyan */
  --yk-text: #E8E8E8;
  --yk-text-secondary: #888888;
  --yk-text-muted: #555555;
  --yk-border: rgba(0, 255, 163, 0.08);
  --yk-scanline: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px);
}
```

### Typography
- Navigation/headings: "Space Mono" (monospaced), uppercase, `letter-spacing: 0.12em`
- Body text: "Space Grotesk" (geometric sans), line-height 1.7
- Display sizes: 36-56px, some with `skewX(-3deg)` for Persona-5 dynamism

### Surface Treatment
- **Zero border-radius** everywhere — sharp, angular
- Cards: `2px solid` left border in accent color (terminal cursor feel)
- Some cards: `clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)` for cut corners
- Global CRT scanline overlay via `body::after` pseudo-element
- Neon text glow: `text-shadow: 0 0 8px currentColor` on accent-colored text

### Navigation Model
- **Thin edge rail (48px):** Icon-only left rail. Hover = tooltip label. Active = 4px green left border
- **Page title banner:** Giant 56px uppercase monospaced title with `skewX(-3deg)`, full-width green line below
- **Sub-navigation:** Horizontal monospaced text tabs with `_` underline on active
- **Mobile:** Edge rail becomes bottom bar. "Create" button = prominent neon-green circle
- **Custom context menus:** Right-click on generated images for Download/Favorite/Animate/Use in Story

### Route Map
| Route | Name | Feature |
|-------|------|---------|
| `/` | Terminal | CSS gradient mesh background + ASCII logo with decrypt hover + system status log |
| `/create` | Foundry | Split-screen: CLI-style prompt input left, output gallery right. Draggable divider |
| `/stories` | Codex | Session list as terminal log. Active session = green-on-black message display |
| `/browse` | Archive | Full-bleed 0px-gap image grid. Hover = desaturate + green prompt overlay |
| `/system` | Control | System monitor dashboard: monospaced stat readouts like NERV displays |
| `/system/audio` | Audio Bank | ASCII-style waveform bars. Fixed-width column metadata. `[>]` play buttons |
| `/system/lora` | Model Index | Table layout. Name/Base/Trigger/Status columns. Green pulsing border on sync |

### Key Differentiating Features

**1. CRT / Retro Terminal Aesthetic**
- Global scanline overlay (CSS `repeating-linear-gradient`)
- Optional CRT barrel distortion toggle (defaults OFF on mobile)
- Monospaced UI chrome everywhere
- "Hacker creating anime" vibe

**2. Split-Screen Foundry**
- Left half: green-on-black terminal prompt (`>` prefix, blinking cursor)
- Right half: live output gallery
- Draggable split via `react-split`

**3. Story as Terminal Log**
- Messages as timestamped terminal output: `[NARRATOR]`, `[USER]`
- Scene illustrations as inline image blocks with ASCII-art-style borders
- Glitch effect (`clip-path` jitter) when scene is generating

**4. Glitch Page Transitions**
- 3 frames of `clip-path` offset + `mix-blend-mode: difference` color shift
- Resolves to new page. Total 250ms
- Respects `prefers-reduced-motion` (falls back to 200ms crossfade)

**5. CSS-Only Generative Background**
- Home page: `conic-gradient` + `radial-gradient` layered
- Colors shift over 60s cycle (neon green -> purple -> cyan)
- Uses CSS `@property` for animated gradient stops

**6. Achievement Toasts**
- Monospaced terminal notifications: `> ACHIEVEMENT_UNLOCKED: first_generation`
- Stored in localStorage
- Slide-in from top-right, auto-dismiss after 3s

**7. ASCII Art Brand Mark**
- `<pre>` tag ASCII art "W"
- On hover: characters shuffle randomly for 500ms then resolve ("decrypt" effect)

### Animation Strategy
| Animation | Technique | Duration |
|-----------|-----------|----------|
| Glitch transition | `clip-path` offset + `mix-blend-mode: difference` (3 keyframes) | 250ms |
| Scanline scroll | `body::after` vertical translate | 8s infinite linear |
| ASCII decrypt | `setInterval` character randomize → resolve | 500ms |
| Terminal cursor | `@keyframes blink` with `step-end` | 1s infinite |
| Card hover | Left border 2px→4px, accent color | 100ms |
| Gallery hover | `grayscale(0)` → `grayscale(0.7)` + text overlay | 150ms |
| Achievement toast | `translateX(100%)` → `0` + per-character type-out | 300ms slide + 30ms/char |
| Gradient mesh | CSS `@property --angle: 0deg → 360deg` in `conic-gradient` | 60s cycle |
| Terminal loading | `content: "." / ".." / "..."` via `@keyframes` | 1.5s cycle |

### Libraries
| Package | Version | Purpose |
|---------|---------|---------|
| `framer-motion` | `^11.0.0` | Glitch transition orchestration |
| `react-split` | `^2.0.14` | Draggable split-screen in Foundry |
| `react-hotkeys-hook` | `^4.5.0` | Keyboard shortcuts (Ctrl+Enter, Escape, context menus) |

**Minimal dependencies by design.** The brutalist/terminal aesthetic is inherently CSS-driven.

### Component Architecture (~24 new components)
- `YokaiShell.js` — Edge rail + content + scanline overlay
- `YokaiEdgeRail.js` — 48px icon navigation
- `YokaiPageBanner.js` — Giant skewed page title
- `YokaiTerminalInput.js` — CLI-style textarea with `>` prefix
- `YokaiTerminalLog.js` — Message display as terminal output
- `YokaiSplitPane.js` — Draggable split-screen wrapper
- `YokaiImageGrid.js` — Full-bleed zero-gap grid
- `YokaiImageOverlay.js` — Full-screen view with metadata sidebar
- `YokaiContextMenu.js` — Custom right-click menu
- `YokaiGlitchTransition.js` — Route transition manager
- `YokaiGradientMesh.js` — CSS-only animated background
- `YokaiASCIILogo.js` — Decrypting brand mark
- `YokaiAchievementToast.js` — Terminal notification
- `YokaiSystemCard.js` — Monospaced stat readout
- `YokaiMusicBar.js` — Minimal player with ASCII visualizer
- `YokaiMatrixRain.js` — CSS-only falling characters for login
- `YokaiSceneBlock.js` — Story scene with ASCII borders

### Risks
| Risk | Severity | Mitigation |
|------|----------|------------|
| Glitch transitions → seizure risk | High | `prefers-reduced-motion`: replace with 200ms crossfade |
| Monospaced readability for long text | High | Story narrative uses "Space Grotesk" (proportional), only UI chrome is monospaced |
| CSS `@property` support (~83%) | Medium | Feature-detect, fall back to static gradient |
| CRT effect on mobile performance | Medium | Toggle defaults OFF on mobile |
| Custom context menu vs browser default | Low | Override only on `.yk-image-card` elements |

### Estimates
- **New/modified files:** ~56
- **New LOC:** ~7,000-8,500
- **CSS LOC:** ~1,500 (most CSS-heavy — animations, clip-paths, scanlines, gradients)
- **Complexity:** Medium-High
- **Timeline:** 2.5-3.5 weeks with Claude assistance

---

## Comparison Matrix

| Dimension | Sakura | Kitsune | Yokai |
|-----------|--------|---------|-------|
| **Mood** | Dreamy, immersive, romantic | Organized, efficient, social | Edgy, technical, rebellious |
| **Sub-audience** | VN fans, gacha players | AniList users, Crunchyroll viewers | Cyberpunk fans, indie game aesthetes |
| **Theme** | Deep indigo + sakura pink | Navy + sky blue | True black + neon green |
| **CSS prefix** | `skr-` | `kit-` | `yk-` |
| **Navigation** | Bottom floating HUD | Left sidebar + mobile bottom tabs | Thin edge rail |
| **Key innovation** | Visual novel reader | Activity feed + Cmd+K palette | Terminal/CRT + glitch transitions |
| **New dependencies** | 6 packages | 5 packages | 3 packages |
| **Bundle impact** | +~120KB gz | +~60KB gz | +~35KB gz |
| **Files** | ~65 | ~53 | ~56 |
| **LOC** | 8-10K | 6-7.5K | 7-8.5K |
| **Complexity** | High | Medium | Medium-High |
| **Timeline** | 3-4 weeks | 2-3 weeks | 2.5-3.5 weeks |
| **Accessibility risk** | Medium (particles, blur) | Low (clean hierarchy) | Medium-High (CRT, contrast) |

---

## Implementation Sequencing (Per Variant)

### Phase 1 — Foundation (Days 1-3)
1. Create worktree and branch from `codex/dev`
2. Copy `services/`, `contexts/`, `utils/` from design-fusion
3. Write `frontend/REQUIREMENTS.md`
4. Replace `index.css` with new design system tokens + reset
5. Rewrite `App.js` with new shell, navigation, routing
6. **Verify auth flow** (login -> callback -> protected route -> logout)
7. Verify `/config.json` loads and API calls work

### Phase 2 — Core Pages (Days 4-10)
8. Home page (variant-specific hero/feed/terminal)
9. Forge/Studio/Foundry (image generation)
10. Storyboard/Stories/Codex (story sessions + variant reader)
11. Showcase/Browse/Archive (community gallery)

### Phase 3 — Supporting Pages (Days 11-14)
12. Director/Admin/System dashboard
13. Sound Vault / music library
14. LoRA management
15. Music dock/bar redesign

### Phase 4 — Polish & Deploy (Days 15-20)
16. Variant-specific features (VN mode / Cmd+K / glitch transitions)
17. Animation and transition polish
18. Mobile responsive pass
19. Accessibility audit (`prefers-reduced-motion`, contrast)
20. UI smoke tests update
21. Deploy + sanity check

---

## Model Recommendations

### Per-Phase Model Selection

| Phase | Recommended Model | Reasoning |
|-------|------------------|-----------|
| Foundation (App.js, CSS system, shell) | **Claude Opus 4.6** | Multi-file coordination, architectural decisions, auth integration |
| Core page rewrites | **Claude Sonnet 4.6** | Individual page focus, moderate complexity, good token efficiency |
| Supporting pages | **Claude Sonnet 4.6** | Focused tasks, predictable patterns |
| Variant features (VN reader, Cmd+K, glitch) | **Claude Opus 4.6** | Complex multi-component systems, state management |
| CSS animations & polish | **Claude Sonnet 4.6** | Creative CSS work, well-scoped |
| Docs, smoke tests, prefix migration | **Claude Haiku 4.5** | Mechanical tasks, low complexity, token-efficient |

### Per-Variant Model Budget (Pro Plan)

| Variant | Opus hours | Sonnet hours | Haiku hours | Total estimated |
|---------|-----------|-------------|-------------|-----------------|
| Sakura | 8-10h | 12-15h | 3-4h | 23-29h |
| Kitsune | 5-7h | 10-12h | 2-3h | 17-22h |
| Yokai | 6-8h | 10-13h | 2-3h | 18-24h |

### Parallel Execution Strategy
If running all 3 variants in parallel using separate Claude sessions:
- Each variant runs in its own worktree (fully isolated)
- Share the same `codex/dev` backend (no conflicts)
- Coordinate only on: smoke test patterns, idea registry updates
- **Recommend: start with Kitsune** (lowest risk, medium complexity) as proof-of-concept, then Yokai, then Sakura

---

## Critical Files Reference

### Files to NEVER modify (shared contracts)
- `frontend/src/contexts/AuthContext.js`
- `frontend/src/contexts/ConfigContext.js`
- `frontend/src/contexts/MusicContext.js`
- `frontend/src/services/*.js` (all 13 files)
- `frontend/src/utils/*.js` (all 4 files)

### Files to REWRITE per variant
- `frontend/src/App.js` — shell, routes, navigation
- `frontend/src/index.css` — entire design system
- All page files in `frontend/src/pages/`

### Files to CREATE per variant
- `frontend/REQUIREMENTS.md` — variant-specific documentation
- All new components in `frontend/src/components/<prefix>/`
- Updated `cdk/scripts/ui-smoke.mjs` for new routes

### Backend files to READ for context
- `backend/routes/index.js` — all available endpoints
- `backend/routes/story-session-routes.js` — story response contract
- `backend/routes/story-illustration-route.js` — scene generation contract

---

## Documentation Template (Per Variant)

Each variant's `frontend/REQUIREMENTS.md` must include:
1. **Purpose** — variant identity and target audience
2. **Editable Scope** — frontend-only reminder
3. **Architecture Entry Points** — provider chain, runtime config
4. **Route Model** — all routes + legacy redirects
5. **Visual System** — CSS prefix, tokens, fonts, spacing
6. **Page Ownership Map** — page-by-page breakdown
7. **Component Inventory** — all new components and their roles
8. **Service Layer Contract** — which services are used, frozen shapes
9. **Frozen Invariants** — what must never change
10. **Validation** — build, local preview, deploy commands
11. **Known Risks** — variant-specific gotchas

---

## Verification Checklist (Per Variant)

- [ ] `npm --prefix frontend run build` — zero errors
- [ ] Auth flow: login -> callback -> protected route -> API call -> logout
- [ ] All legacy redirect routes work
- [ ] All primary routes render content (no blank pages)
- [ ] Music dock plays tracks from story scenes
- [ ] Story session: create -> message -> illustration -> animation -> music
- [ ] `prefers-reduced-motion` disables dramatic animations
- [ ] Mobile: bottom nav works, content scrollable, no overlaps
- [ ] UI smoke tests pass: `npm --prefix cdk run idea:ui-smoke -- --stage=design-<variant>`
- [ ] Full deploy passes: sanity (6 checks) + smoke (all routes)
