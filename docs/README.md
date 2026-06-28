# Whisk Studio — Documentation Index

Every Markdown file in the repo belongs to exactly one of four buckets. Two **tracks** carry the
primary docs — **AI** (optimised for agent discovery: dense context + rules) and **Human** (narrative,
onboarding, the "why") — each with a **brief** and a **detailed** entry. The rest is **shared
reference** (one source of truth per topic, both audiences) or **operational scaffolding**.

## The two tracks

|              | **Brief** (orient in ~2 min)            | **Detailed** (full reference)                          |
|--------------|------------------------------------------|--------------------------------------------------------|
| **Human**    | [`/README.md`](../README.md) — what it is, quickstart, live stacks | [`architecture.md`](./architecture.md) — layers, diagrams, data model, deploy |
| **AI agent** | [`/AGENTS.md`](../AGENTS.md) — rules, stack map, read order | [`ai-context.md`](./ai-context.md) — dense paths, SK namespaces, invariants |

The two **brief** docs are the front doors; the two **detailed** docs are the same system at full
resolution for their audience. Start a coding agent at the AI column, a person at the Human column.

## Shared reference (single source of truth per topic — link, don't restate)
| Doc | Authority for | Audience |
|-----|---------------|----------|
| [`api-spec.md`](./api-spec.md) | every HTTP endpoint — shapes, access levels | both |
| [`testing.md`](./testing.md) | quality gates: how to run/write each test layer | both |
| [`state-of-the-art.md`](./state-of-the-art.md) | interview deep dive: cost, security, **roadmap**, the "why" | human |
| [`../frontend/ARCHITECTURE.md`](../frontend/ARCHITECTURE.md) | frontend component tree, hook graph, contexts | human |
| [`../frontend/THEMES.md`](../frontend/THEMES.md) | the 10-palette × dark/light theme system | human |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | code style, PR checklist, commit format | human |
| [`adr/`](./adr/) | the 7 architecture decisions (001–007) — immutable records | both |
| [`architecture-current.mmd`](./architecture-current.mmd) · [`agent-turn-loop.mmd`](./agent-turn-loop.mmd) | diagram sources → `bash scripts/render-diagrams.sh` | both |
| [`proposals/`](./proposals/) | historical design records (shipped) — the *why*, plus still-parked work | both |
| [`../IDEAS.md`](../IDEAS.md) | live registry of deployed idea stacks (auto-maintained) | both |

## Operational scaffolding (per-idea, required by the idea-environment policy)
`ideas/<id>/{README,DECISIONS,RUNBOOK,STATUS,IMPROVEMENTS}.md` and `/IMPROVEMENTS.md` track each
deployed prototype. They are not product docs — see [`AGENTS.md`](../AGENTS.md) "Idea Environment
Policy". `STATUS.md` files are partly auto-maintained by `idea-env.js`.

## Anti-duplication rules
To keep the set non-redundant, each repeated fact has ONE home; other docs link rather than restate:
- **Deploy commands & modes** → `architecture.md` §4
- **Quality gates** → `testing.md`
- **Cognito single-source-of-truth + trap** → `AGENTS.md` (rule) / `architecture.md` §6 (detail)
- **Roadmap / parked work** → `state-of-the-art.md` §12 (proposals link to it)
- **Live stack URLs** → `IDEAS.md`
- **API contracts** → `api-spec.md`
- **Per-version feature history** → git log (not the proposals)
