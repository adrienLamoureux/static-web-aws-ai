# Whisk Studio — State of the Art

> Snapshot: **2026-06-27** · commit `ea3a2c2` · branch `main`
> Companion read for a technical interview: what the system is, how it's built,
> what it costs to run, and where it's going. The authoritative deep dives live in
> [`architecture.md`](./architecture.md), [`api-spec.md`](./api-spec.md), the
> [ADRs](./adr/), and the [proposals](./proposals/).

---

## 1. What it is

Whisk Studio is a full-stack, **fully-serverless** AI creative studio on AWS. A user
signs in and can generate images, co-write illustrated stories, score scenes with
generated music, and talk to a Live2D character ("Hiyori") that can drive the whole
app on their behalf. Three external model providers (AWS Bedrock, Replicate, CivitAI)
sit behind one Express API; everything user-facing is a single React app.

The defining product idea is **conversation-as-interface**: the same backend powers a
traditional form-driven dashboard *and* an agent that calls real tools, *and* a
hands-free companion mode where the character is the only navigation surface.

**Capabilities today**
- Text-to-image generation (4 styles, 3 aspect ratios, LoRA support) via Replicate + Bedrock + CivitAI
- Illustrated, stateful storytelling with per-scene illustration + generated music
- **Agent Mode (v1.7)** — Bedrock Converse tool-use loop with a 9-tool fleet, per-user memory, cross-session preferences, named sessions, voice input
- **Companion Mode (v0)** — full-viewport, character-driven UX that refuses admin operations by design
- Live2D companion with proactive messaging and persistent memory
- Admin "Sanctum" — feature flags (cohort-scoped), cost dashboard, model picker

---

## 2. System at a glance

| Dimension | Value | Source |
|-----------|-------|--------|
| Backend source | 79 files, ~18.8k LOC (`lib/` + `routes/`) | repo |
| Frontend source | 157 JS/JSX files | repo |
| Backend tests | **358 passing** (`node:test`) | `npm --prefix backend test` |
| Frontend tests | **129 passing** (RTL + Jest) | `npm --prefix frontend run test:ci` |
| File-length gate | clean — **0 files over 500 lines** | `scripts/check-file-length.sh` |
| HTTP endpoints | 73+ across 29 route modules | `api-spec.md` |
| Themes | 10, each with dark/light variants | `src/styles/themes/` |
| Default LLM | Claude **Haiku 4.5** (admin-overridable) | `agent-config.js` |
| Infra | 100% serverless (no EC2/RDS/NAT/ALB) | §4 |
| Deploy | one command, ~build+synth+sync+smoke | `cdk run idea:deploy` |

---

## 3. Architecture

### 3.1 Layers
```
CloudFront (static React + config.json)
      │  PKCE / Cognito Hosted UI
      ▼
API Gateway ──► Lambda (Express via @vendia/serverless-express)
      │
      ├── AWS Bedrock      (Converse tool-use, prompt help, compaction)
      ├── Replicate        (image / video generation)  ◄─ dominant cost
      ├── CivitAI / Gradio (alternative image providers)
      │
      ├── DynamoDB         (single-table, PAY_PER_REQUEST)
      └── S3               (user media, signed-URL access)
```

### 3.2 Request flow
1. CloudFront serves the built SPA + a deploy-time `config.json` (API base, Cognito wiring).
2. The browser authenticates through Cognito Hosted UI (PKCE); JWT rides on every API call.
3. API Gateway invokes the Lambda Express adapter (`backend/lambda.js`).
4. Routers resolve domain logic, call providers, persist to DynamoDB / S3.
5. Media is served back via short-lived **S3 signed URLs** (never public objects for user content).

### 3.3 Backend composition
- **Composition root:** `backend/lib/build-deps.js` — a single flat `deps` object
  assembled once and threaded into every router ([ADR-004](./adr/004-flat-deps-shape.md)).
  This is hand-rolled DI: trivially testable (swap the object), no framework.
- **Route hub:** `backend/routes/index.js` mounts ~29 Express Routers
  ([ADR-001](./adr/001-express-router-migration.md)).
- **Shared guards:** `route-guards.js` (`requireEnv` / `requireAuth` / `requireParam`)
  and `error-handler.js` keep handlers thin and uniform.

### 3.4 Frontend
React 18 SPA, "Sakura Bloom" design. No CSS framework — a hand-built `skr-` design
system on CSS custom properties ([ADR-003](./adr/003-css-design-system-over-tailwind.md)),
10 themes. The Live2D companion renders via `pixi-live2d-display` on `pixi.js@6`.
Three top-level **modes** (`ModeContext`, persisted to `localStorage["skr-mode"]`)
swap the entire shell: `dashboard` → `agent` → `companion`.

---

## 4. Serverless & infra posture

**There is no always-on compute and no expensive idle infrastructure.** Every component
bills on use:

| Resource | Mode | Idle cost |
|----------|------|-----------|
| Lambda | on-demand, **no provisioned concurrency** | $0 |
| DynamoDB | **PAY_PER_REQUEST** (on-demand) | $0 |
| S3 | per-GB storage + requests | ~$0 |
| CloudFront | per-GB egress + requests | ~$0 |
| Cognito | free tier covers expected MAU | $0 |
| API Gateway | per-request | $0 |

No EC2, RDS, ElastiCache, NAT Gateway, or load balancer exists in the stack — these are
the usual "silent $30+/month even at zero traffic" culprits, and the design deliberately
avoids all of them. Lambda log retention is capped at one month
(`logs.RetentionDays.ONE_MONTH`) to keep CloudWatch from accreting cost.

The one operational nuance: Live2D model assets (~50 MB) are excluded from CDK's
`BucketDeployment` (which would time out its helper Lambda) and synced post-deploy via
`aws s3 sync` in `idea-env.js`.

---

## 5. The three modes (the product spine)

| Mode | Surface | Who drives | Admin ops |
|------|---------|-----------|-----------|
| **Dashboard** | Classic forms (Forge, Chronicle, Sanctum) | User clicks | ✅ (Sanctum) |
| **Agent** (`/atelier`) | Manga-panel chat + tools | User ↔ agent | ✅ |
| **Companion** (v0) | Full-viewport character takeover | Character-led conversation | ❌ **refused by design** |

Companion Mode is the newest pillar. When active it replaces all conventional navigation:
the character is the entire interface. The system-prompt addendum biases toward narrative
tone and on-screen voice confirmation, and hard-codes a refusal for any admin/Director
operation — *"That one's behind the Director's desk — I can't help from here. Want me to
drop you into the dashboard?"* Non-admin actions (generate, browse your library, change
theme, score a scene) flow through the same tool fleet.

---

## 6. Agent Mode deep-dive

The most architecturally interesting subsystem.

### 6.1 The turn loop
`POST /api/agent/turn` runs a Bedrock **Converse** call with tool specs attached. Tools
fall into three classes, which determines the control flow:

- **server-dispatch** (`generate_image`, `recall_favorites`, `browse_gallery`,
  `view_my_creations`) — backend executes, then a **second 120-token "closing" model turn**
  comments on the result (*"turned out softer than I expected — want more contrast?"*).
- **client-action** (`set_theme`) — returned to the browser, applied via React context.
- **intent** (`continue_story`, `illustrate_scene`, `generate_music`) — returned as a
  confirm payload; the user approves before any write hits their Chronicle.

The 9-tool fleet: `generate_image`, `set_theme`, `continue_story`, `illustrate_scene`,
`recall_favorites`, `generate_music`, `browse_gallery`, plus companion-v0's
`view_my_creations` and `what_can_you_do`.

### 6.2 Memory & state
- **Per-session memory** at `AGENT#{sessionId}` with rolling-summary **compaction** above
  30 turns (the summariser's own tokens are billed back — no blind spot).
- **Cross-session preferences** at `AGENT#STATE` (`{lastStyle, lastAspect, lastLora, theme}`)
  injected into the system prompt as `<prefs>` so tool defaults bias toward prior choices.
  Values are **enum-validated on read *and* write** — because they re-enter the prompt, an
  unchecked value would be a self-targeted prompt-injection vector.
- **Named sessions** (v1.7): the session id *is* the memory namespace, so multi-session
  history needed no schema change.

### 6.3 Guardrails (defense in depth)
- Per-user **token-bucket rate limit** (`AGENT#RATE`), fail-open on DB error.
- **Daily token cap** 200k/day (UTC rollover) → 429 + `Retry-After`.
- **Daily image cap** 50/day, on a *separate* counter so it rolls over independently.
- **Cohort-scoped feature flag** — `agentMode ∈ {true,false,"all","admin","beta"}`,
  evaluated against the caller's Cognito groups.

---

## 7. Data model — single-table DynamoDB

One table, `pk = USER#{sub}` + `sk` namespaces. No GSIs required for the access patterns.

| SK namespace | Holds |
|--------------|-------|
| `IMG#…` / `JOB#…` / `VID#…` | user media + generation jobs |
| `COMPANION#{modelId}` (+ `#MSG#`) | long-lived companion identity memory |
| `AGENT#{sessionId}` (+ `#MSG#`) | short-lived, tool-heavy agent memory |
| `AGENT#STATE` | cross-session prefs (prompt-injected, validated) |
| `AGENT#RATE` | token bucket |
| `AGENT#COST` | running token totals + daily cap counter |
| `AGENT#IMG_COUNT` | daily image cap counter |
| `AGENT#SESSION#{id}` | named session metadata |
| `CONFIG#AGENT` | admin model override (60s cached) |
| `PRESET#STORY/CHARACTER/PROMPT_HELPER` | seed content |

Concurrency-safe counters use atomic `ADD` (`UpdateExpression: ADD turnCount :n`) instead
of read-modify-write, eliminating lost-update races between concurrent turns.

---

## 8. Cost model (per user)

Replicate image generation is the **dominant cost (~90%)**; everything else rounds to
pennies. All figures are estimates anchored to the in-repo caps.

### Per-action unit economics
| Action | Provider | ~Cost | Notes |
|--------|----------|-------|-------|
| Image generation | Replicate | ~$0.01 / image | varies with model + GPU seconds; the swing variable |
| Agent turn | Bedrock Haiku 4.5 | ~$0.001 / turn | 200k tokens/day ≈ **$0.20** ceiling |
| Music / video | Replicate | cents / job | low frequency |
| DynamoDB / S3 / Lambda / CloudFront | AWS | ~$0 | rounding error per user |

### Monthly per-user scenarios
| Profile | Behaviour | Est. cost / mo |
|---------|-----------|----------------|
| **Casual** | a few sessions, ~30 images | **< $1** |
| **Engaged** | ~100 images + steady chat | **~$1–3** |
| **Adversarial (capped)** | hits both caps every day | **~$25** |

The image cap is what makes the worst case tractable: without it, an abusive user could
drive **~$230/mo**; the 50/day ceiling pulls that to ~$25/mo (50 × 30 × ~$0.011 ≈ $16 of
Replicate + the $6 token-cap ceiling + infra). The token cap independently bounds Bedrock.

**Takeaway for an interviewer:** the cost story is *bounded and per-user observable* —
`AGENT#COST` records real token spend per user, surfaced in the Sanctum dashboard with a
live USD estimate, and both spend vectors (tokens, images) have hard daily ceilings.

---

## 9. Security posture

- **Auth:** Cognito JWT on every protected route; `getUserFromRequest` resolves
  `isAdmin` from `cognito:groups` across all three claim paths (REQUEST authorizer,
  legacy claims, unsigned fallback).
- **Object isolation:** every media operation is scoped to `users/{sub}/`; cross-prefix
  access is rejected. User content is served only via expiring signed URLs.
- **Admin endpoints** (`/api/admin/agent/*`) sit behind `requireUser` + `requireAdmin`.
- **Prompt-injection hardening:** any value that re-enters the system prompt (the prefs)
  is enum-validated on read and write.
- **Abuse limits:** token bucket + daily token cap + daily image cap, all per user.
- **Companion safety:** admin operations are refused inside the character-driven mode.

---

## 10. Engineering practices

| Practice | Detail | Rationale (ADR) |
|----------|--------|-----------------|
| Routers everywhere | 29 Express Router modules off one hub | [ADR-001](./adr/001-express-router-migration.md) |
| `node:test`, not Jest (backend) | zero-dep, native runner | [ADR-002](./adr/002-node-test-over-jest.md) |
| Hand-built CSS system | `skr-` tokens, no Tailwind | [ADR-003](./adr/003-css-design-system-over-tailwind.md) |
| Flat `deps` DI object | testable, framework-free | [ADR-004](./adr/004-flat-deps-shape.md) |
| 500-line file cap | CI-enforced, forces decomposition | [ADR-005](./adr/005-file-length-limit.md) |
| Single `main` branch | backend + frontend + CDK consolidated | [ADR-006](./adr/006-branch-consolidation.md) |
| Companion panel pattern | over a Hiyori "corner" | [ADR-007](./adr/007-companion-panel-over-hiyori-corner.md) |

- **CI** (`.github/workflows/ci.yml`): three jobs — backend tests, frontend tests,
  file-length — on every push/PR to `main`.
- **Deploy** is one command and self-verifying: build → CDK deploy → Live2D `s3 sync` →
  6-check post-deploy sanity → 10-check Playwright UI smoke.
- **Lint/format:** ESLint + Prettier on both halves; `src/styles/` excluded from Prettier
  (compact single-line CSS notation).

---

## 11. Documentation map

| Doc | Purpose |
|-----|---------|
| [`state-of-the-art.md`](./state-of-the-art.md) | this file — the interview overview |
| [`architecture.md`](./architecture.md) | authoritative architecture + deploy + data model |
| [`api-spec.md`](./api-spec.md) | full endpoint inventory (public / user / admin) |
| [`architecture-current.mmd/.png`](./architecture-current.mmd) | rendered system diagram |
| [`adr/001`–`007`](./adr/) | the seven decisions behind the design |
| [`proposals/agent-mode-v0.md`](./proposals/agent-mode-v0.md) | Agent Mode plan (v1 shipped) |
| [`proposals/companion-mode-v0.md`](./proposals/companion-mode-v0.md) | Companion Mode plan (v0 shipped) |
| [`testing.md`](./testing.md) | quality gates + how to run them |
| `AGENTS.md` / `CONTRIBUTING.md` | collaboration rules + PR checklist |

---

## 12. Roadmap / next steps

**Companion Mode → v1** (parked, scoped in the proposal)
- 6 more tools: `open_story_session`, `read_scene`, `share_image`, `unshare_image`,
  `delete_image`, `change_brightness`, `sign_out`
- Tailored frontend cards for `view_my_creations` + `what_can_you_do`
  (today they fall through to the generic `ToolResultPanel`)
- Mobile polish, vision input, always-on mic, a "tell me a story" tool

**Agent Mode**
- **Streaming responses** via Lambda Function URL (the headline item — Converse currently
  blocks until the full turn completes)
- More manga panel primitives; `--ar 3:4` shorthand parsing

**Platform hardening**
- Lift backend coverage past ~40% (new routes are the thinnest)
- Decompose the still-large `story/illustration-routes.js`
- Confirm `design-fusion` / `design-pixnovel` `config.json` point at the `dev` API/Cognito

---

## 13. Interview talking points (the "why")

- **Why fully serverless?** The product has spiky, low-baseline traffic. Per-request
  billing means idle cost ≈ $0, and the absence of NAT/ALB/RDS removes the usual fixed
  monthly floor. Trade-off accepted: cold starts, which matter little for a creative tool.
- **Why a single DynamoDB table?** All access patterns are user-partitioned key lookups;
  SK namespacing covers media, memory, limits, and config without a GSI. Atomic `ADD`
  counters sidestep the lost-update race a relational counter would invite.
- **Why hand-rolled DI and `node:test`?** Minimize dependencies on a Lambda where cold-start
  weight and supply-chain surface both matter. The flat `deps` object makes every route a
  pure function of its inputs — tests just pass a mock object.
- **Why cap images separately from tokens?** They're different cost vectors with different
  abuse profiles; independent counters let each roll over and be tuned on its own.
- **Why validate prefs on read?** The value flows back into the system prompt — treating
  stored state as untrusted closes a self-injection loop most apps miss.
- **Why three modes off one backend?** The expensive part (tools, memory, limits, providers)
  is written once; dashboard/agent/companion are three presentations of the same engine,
  which is why companion mode shipped as a v0 skeleton in a single increment.
