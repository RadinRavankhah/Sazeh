# Sazeh — Development Plan v2
## Hosted Agentic Site Builder (Lovable / Base44 / v0 model)

> **This plan supersedes `sazeh-dev-plan.md` (v1).** V1 is retained as a technical reference for deep-dive code (data models, validation engine, publishing tasks, shell HTML generation) that carries over unchanged. Where v2 references "v1 §N", it points into that document.
>
> **The pivot from v1:** V1 designed an *agent-facing API* — external agents (Claude Code, Codex, custom LLM pipelines) would call our REST API with API keys. V2 designs a *hosted agentic platform*: our own built-in AI agent lives inside the product. Users sign up, describe a site in a chat panel, our agent service orchestrates an LLM and builds the site. Users can equally ignore AI entirely and build by drag-and-drop, WordPress-style. Both paths write the same page-tree data model through the same validation layer.

---

## Table of Contents

1. [Product Vision (Revised)](#1-product-vision-revised)
2. [Core Concepts](#2-core-concepts)
3. [Technology Stack](#3-technology-stack)
4. [System Architecture](#4-system-architecture)
5. [Data Models](#5-data-models)
6. [Component Registry](#6-component-registry)
7. [Core API & Agent Tool Layer](#7-core-api--agent-tool-layer)
8. [Agent Orchestrator](#8-agent-orchestrator)
9. [Frontend Architecture](#9-frontend-architecture)
10. [Tenancy, Auth & Access](#10-tenancy-auth--access)
11. [Publishing Pipeline](#11-publishing-pipeline)
12. [Plans, Credits & Metering](#12-plans-credits--metering)
13. [Phase-by-Phase Development Plan](#13-phase-by-phase-development-plan)
14. [Decision Log](#14-decision-log)
15. [Post-Launch Backlog](#15-post-launch-backlog)

---

## 1. Product Vision (Revised)

**Sazeh is a hosted web platform where anyone can build and publish a website — by chatting with a built-in AI agent, by dragging and dropping pre-built components themselves, or by interleaving both.**

The reference points are **Base44, Lovable, and v0** — not Claude Code or Codex:

| Aspect | V1 (wrong model) | V2 (correct model) |
|---|---|---|
| Who runs the agent | External agents, owned by users | **Our platform runs the agent** |
| How agents authenticate | Per-tenant API keys | **User sessions; the agent acts on the user's behalf** |
| Primary surface | REST API for machines | **Web app: chat panel + visual editor** |
| Users | Developers wiring agents up | **Non-technical founders, indie builders — anyone** |
| Monetization | SaaS seats + rate limits | **Plans + AI message credits (Lovable-style)** |

### Two equal input paths, one engine

1. **Agent mode (built-in).** The user types "Build a landing page for my coffee shop with a menu and testimonials." The platform's Agent Orchestrator prompts an LLM with tool definitions (fetch registry, create page, patch tree, set theme, publish). The LLM's tool calls are executed server-side against our validated page-tree engine, streamed back to the user's browser as they happen, and rendered live on their canvas.

2. **Manual mode (WordPress-style).** The user opens the visual editor: picks sections from a component palette, drags them into place, edits every prop through a schema-driven inspector, manages pages, and publishes. **No AI involvement required at any point.**

Both paths are first-class product surfaces, not one being a fallback for the other. The critical architectural property: **the agent is just another client of the same internal API and the same validation engine the visual editor uses.** The reliability floor is the component registry, not the LLM.

### What we are NOT building (anymore)

- No public agent-facing API in the MVP. API keys, scopes, external agent docs → demoted to post-launch backlog (§15).
- No arbitrary code generation. The "no raw frontend code" constraint from v1 §2 is unchanged and still the project's most important decision.

---

## 2. Core Concepts

- **Page tree.** A page is a JSON array of `ComponentInstance` nodes (`{ id, component, props, children }`), stored in Postgres JSONB. Unchanged from v1 §5.
- **Component registry.** A DB table of available components — primitives (shadcn mappings: Button, Card, Input...) and composite sections (HeroSection, FeatureGrid, PricingTable...) — each with a Draft-07 JSON Schema for its props (`additionalProperties: false`). Seeded from the vendored shadcn docs in `/shadcn`. Unchanged from v1 §6.
- **Two writers, one engine.** The visual editor mutates the tree via the REST API. The agent mutates the tree via tool calls that hit the same service layer. Identical validation, identical audit trail, identical undo semantics.
- **Agent Orchestrator.** The platform-side service that owns the LLM conversation: assembles context, calls the LLM with tools, executes tool calls, streams events to the browser, records history and usage. Detailed in §8.
- **Workspace (tenant).** The isolation unit: one account owns a workspace containing its sites, media, chat history, and usage. Detail in §10.

---

## 3. Technology Stack

Carried over from v1 §3 with additions for the agent platform:

| Layer | Choice | Reason |
|---|---|---|
| Backend | Django 5.x + DRF | Mature SaaS framework; admin for bootstrapping |
| Database | PostgreSQL 16+ | JSONB page trees |
| Task queue | Celery + Redis | Async publishing, exports |
| Cache / rate limits | Redis | Sessions, throttling, orchestrator locks |
| Auth | Django Allauth (+ JWT or session — see Phase 3 decision) | Human users only in MVP |
| Storage | S3-compatible | Media uploads, static exports, ZIPs |
| **LLM integration** | **Anthropic SDK + OpenAI SDK behind a provider abstraction** | Built-in agent; provider choice is a Phase 0 decision |
| **Realtime** | **SSE (or WebSocket — Phase 5 decision)** | Streaming agent responses to the editor |
| **Billing** | **Stripe (or merchant-of-record alternative — Phase 9 decision)** | Plans + credits |
| Frontend | React 18 + TypeScript (strict), Vite | Unchanged |
| Styling | Tailwind CSS v4 | Unchanged |
| Components | **shadcn/ui** — settled decision, do not re-litigate | Registry seed + all app UI |
| State | Zustand (+ zundo for undo/redo) | Editor + agent chat state |
| Forms | React Hook Form + Zod | Schema-driven inspector |
| Drag-and-drop | @dnd-kit | Visual editor |
| Infra | Docker Compose → Fly.io | v1 §15 locked |

---

## 4. System Architecture

```
                        ┌──────────────────────────────┐
                        │        React SPA (Vite)      │
                        │  Marketing │ Dashboard │ Editor (canvas + chat)
                        └──────┬───────────────┬───────┘
                    REST/JSON  │               │  SSE stream
                               ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Django / DRF Backend                        │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌───────────────────────────┐  │
│  │  Sites API │  │ Pages API  │  │  Agent Orchestrator       │  │
│  │ (CRUD)     │  │ (tree CRUD)│  │  sessions · context ·     │  │
│  └─────┬──────┘  └─────┬──────┘  │  tool loop · streaming    │  │
│        │               │         └──────┬──────────┬─────────┘  │
│        ▼               ▼                │          │            │
│  ┌─────────────────────────────┐        │          │            │
│  │  Validation Engine          │◀───────┘   LLM Provider        │
│  │  (JSON Schema, tree ops)    │                Adapter         │
│  └─────────────────────────────┘                │ (Anthropic /  │
│                                                  │  OpenAI)      │
│  ┌──────────┐  ┌─────────────┐  ┌────────────┐  └──────────────┤
│  │ Registry │  │ Activity /  │  │ Usage &    │               │
│  │ Service  │  │ Audit Log   │  │ Credits    │               │
│  └──────────┘  └─────────────┘  └────────────┘               │
└───────────────┬──────────────────────────┬────────────────────┘
                │                          │
        ┌───────▼──────┐            ┌──────▼───────┐     ┌──────────────┐
        │  PostgreSQL  │            │    Redis     │     │ Celery       │
        │  (JSONB)     │            │  (cache/lock)│     │ Workers      │
        └──────────────┘            └──────────────┘     │ - publishing │
                                                          │ - exports    │
        ┌──────────────┐            ┌──────────────┐      │ - zip build  │
        │     S3       │            │  LLM APIs    │      └──────────────┘
        │ media+exports│            │ (external)   │
        └──────────────┘            └──────────────┘
```

**The one-sentence architecture:** a Django monolith that serves a validated JSON-tree engine; the React editor and the built-in LLM agent are two clients of that engine; Celery handles anything slow.

---

## 5. Data Models

Condensed; full field-level code for unchanged models is in v1 §5.

### `User` and `Workspace` (replaces v1's Tenant/User/TenantMembership trio for MVP)

```python
class User(AbstractUser):
    email = models.EmailField(unique=True)
    # allauth handles OAuth identities

class Workspace(models.Model):          # the tenant
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    plan = models.CharField(default="free")          # free | pro (Phase 9)
    credits_balance = models.IntegerField(default=...)  # Phase 9
    created_at / updated_at

class WorkspaceMember(models.Model):    # teams later; owner row auto-created
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    role = models.CharField(default="owner")         # owner | editor | viewer
```

`Site`, `Page`, `ComponentRegistryEntry`, `PublishJob` — unchanged from v1 §5. `ApiKey` is **deferred** (backlog).

### New models for the agent platform

```python
class AgentSession(models.Model):
    """One chat conversation, scoped to a site (and optionally a page)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="agent_sessions")
    page = models.ForeignKey(Page, null=True, blank=True, on_delete=models.SET_NULL)
    title = models.CharField(max_length=255, blank=True)   # auto-named from first msg
    status = models.CharField(default="active")            # active | archived
    created_at / updated_at

class AgentMessage(models.Model):
    """Every message in a session, human and assistant."""
    session = models.ForeignKey(AgentSession, related_name="messages", on_delete=models.CASCADE)
    role = models.CharField()          # user | assistant | tool
    content = models.JSONField()       # text blocks, tool_use blocks, tool_result blocks
    model_name = models.CharField(blank=True)
    tokens_in / tokens_out = models.PositiveIntegerField(default=0)
    created_at

class ToolRun(models.Model):
    """Record of one tool call the agent executed (the audit trail)."""
    message = models.ForeignKey(AgentMessage, related_name="tool_runs", on_delete=models.CASCADE)
    tool_name = models.CharField()                # "patch_page_tree", "set_site_theme", ...
    args = models.JSONField()
    result_status = models.CharField()            # success | validation_error | error
    result_summary = models.JSONField()           # e.g. node ids touched, errors for retry
    tree_snapshot_before = models.JSONField(null=True)   # enables rollback/history
    created_at

class UsageEvent(models.Model):        # metering, Phase 9
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE)
    kind = models.CharField()          # llm_tokens | publish | media_storage
    amount = models.IntegerField()     # tokens or units
    meta = models.JSONField(default=dict)
    created_at

class MediaAsset(models.Model):        # Phase 8
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE)
    file = models.FileField(upload_to=...)
    kind = models.CharField()          # image | other
    alt_text = models.CharField(blank=True)
    width / height = models.PositiveIntegerField(null=True)
    created_at
```

`AgentAction` from v1 is absorbed by `ToolRun` (agent actions) plus a light `ActivityLog` for human editor actions — both write through the same service layer.

---

## 6. Component Registry

Unchanged in substance from v1 §6. Summary:

- Seeded by a repeatable management command parsing `/shadcn/*.md` into JSON Schemas; composite sections (HeroSection, FeatureGrid, PricingTable, FAQAccordion, Testimonials, NavBar, Footer, ContactForm, ...) are hand-curated on top of the primitives (v1 §16 holds the four canonical seed schemas).
- Two tiers: primitives for fine-grained editor control, composite sections as the primary unit agents and users assemble.
- Validation via `jsonschema` library at the API boundary, recursive over the tree (v1 §6 "Schema Validation in Python").
- Versioning rule from v1 §13.4: additive-only prop changes post-launch; breaking changes = new component name.
- The registry is served to **both** clients: REST for the editor's palette/inspector, and injected (as a subset) into the agent's system prompt.

---

## 7. Core API & Agent Tool Layer

One internal API under `/api/v1/`, consumed by the SPA. The **agent's tools are a thin wrapper over the same service functions the REST views use** — one validation path, one audit path. There is no separate "agent API".

### REST surface (SPA-facing)

```
Auth        /auth/*                      (allauth/session or JWT — Phase 3 decision)
Registry    GET  /registry/components/   ?category= ?search=
            GET  /registry/components/{name}/
Sites       CRUD /sites/                 (theme config, publish status)
Pages       CRUD /sites/{id}/pages/      (full tree validation on write)
Tree patch  POST /sites/{id}/pages/{pid}/tree/patch/    (atomic ops, v1 §18 TreePatcher)
Agent       POST /agent/sessions/                       (create chat)
            POST /agent/sessions/{id}/messages/         (user msg → streams reply)
            GET  /agent/sessions/{id}/events/           (SSE stream)
            POST /agent/runs/{id}/cancel/
Media       POST /media/upload-url/      (S3 pre-signed direct upload, Phase 8)
            POST /media/complete/
Publish     POST /sites/{id}/publish/    → job id
Jobs        GET  /jobs/{job_id}/         (polling)
```

### Agent tool definitions (what the LLM gets)

| Tool | Wraps | Notes |
|---|---|---|
| `list_components` | Registry service | Compact schema output by default (token efficiency, v1 §13.5) |
| `get_component` | Registry service | Full schema for one component |
| `get_page` | Page service | Current tree (possibly summarized for long pages) |
| `create_page` | Page service | Validated tree create |
| `patch_page_tree` | TreePatcher (v1 §18) | The workhorse: update_props / insert / delete / move |
| `set_site_theme` | Site service | Writes `site.config.theme` tokens |
| `attach_media` | Media service | Attaches an existing uploaded asset to a node prop |
| `request_publish` | Publish service | Only suggests; confirmable by user in UI |

Tool results are returned to the LLM as structured JSON (success + touched node ids, or validation errors so the model can self-correct — see §8).

---

## 8. Agent Orchestrator

The heart of the pivot. A Django service module (same process, same DB transactional guarantees as the rest of the API).

### The loop

```
1. User message arrives (REST) → persist AgentMessage(role=user)
2. Orchestrator assembles context:
   - system prompt: platform rules + design guidelines + output constraints
   - registry subset relevant to the task (composite sections, compact schemas)
   - current site config (theme tokens)
   - current page tree (or the subtree around the user's selection)
   - recent conversation history (trimmed to token budget)
3. Create a Run; acquire a per-session Redis lock (one generation at a time)
4. Call LLM with tool definitions (streaming on)
5. For each tool_use block from the LLM:
   a. Execute against the service layer (validation enforced)
   b. Persist ToolRun (+ tree_snapshot_before)
   c. Stream tool_started/tool_succeeded events to the client
   d. Feed tool_result back to the LLM
   - On validation_error: the error text IS the tool_result → the model retries
     (self-healing loop, max N retries per tool call)
6. Persist final assistant message + token usage (UsageEvent)
7. Stream run_completed; release lock
```

### Streaming event protocol (SSE payload shapes)

```
event: message_delta      data: { text_delta }
event: tool_started       data: { run_id, tool_name, args_summary }
event: tool_succeeded     data: { run_id, touched_node_ids }
event: tool_failed        data: { run_id, error }        # model will retry
event: run_completed      data: { message_id, tokens_in, tokens_out }
event: error              data: { code, message }
```

The editor applies tool events optimistically to the Zustand tree store as they arrive — the user watches the site build itself, and **every agent mutation is an ordinary undoable history step** (zundo), so "undo what the AI did" is Ctrl+Z.

### Guards and limits

- Max tool-call iterations per run (e.g. 25) and token budget per run — hard stop with a friendly message.
- Per-session Redis lock; a new message cancels/queues (Phase 5 decision on cancel semantics).
- Timeouts on LLM calls; Celery-style retry only for idempotent reads.
- Validation is the floor: the agent can produce a *poor* page, never a *broken* one.
- Prompt-injection stance: page content and site copy are data, never instructions; tool args are schema-validated regardless of what the model says.

### Context strategy (token efficiency)

- Compact registry by default; `get_component` for full schema on demand.
- Tree summaries: for pages > N nodes, send section names + first-line props, full subtree only around the user's selection.
- Example payloads per composite section (copy-modify pattern, v1 §13.5) stored on the registry entry.

---

## 9. Frontend Architecture

Three areas (unchanged from v1 §8) plus the agent chat as an editor citizen:

1. **Marketing/auth shell** — landing, pricing, login/signup.
2. **Dashboard** — sites grid, settings, publish history, usage/credits (Phase 9).
3. **Editor** — three-panel: palette | canvas | inspector, plus a **chat panel** (dockable left/right or full-screen "generate" mode).

Key stores (Zustand):

```ts
// tree store — same shape as v1 §8
interface EditorStore {
  tree: ComponentInstance[];
  selectedNodeId: string | null;
  // ...updateNodeProps, insertNode, deleteNode, moveNode
}

// agent store — new
interface AgentStore {
  sessionId: string | null;
  messages: AgentMessage[];
  isStreaming: boolean;
  activeToolRuns: ToolRun[];      // drives canvas highlights + activity feed
  sendMessage: (text: string) => void;
  cancelRun: () => void;
}
```

- **Canvas rendering:** `ComponentRenderer` recursive renderer, same-page render (v1 §8 Option B) for MVP.
- **Inspector:** `SchemaFormRenderer` from JSON Schema (v1 §8); consider `@rjsf/core` base.
- **Agent UX integration:** tool events highlight nodes on the canvas as they mutate; selection context ("make this section darker") injects `selectedNodeId` subtree into the message.
- Editor tooling rules: all product UI via `frontend-design` skill; marketing shell additionally via `design-taste-frontend` (see AGENTS.md).

---

## 10. Tenancy, Auth & Access

- **Workspace = tenant.** Personal workspace auto-created at signup; team members are a WorkspaceMember row away but team features are post-MVP unless decided otherwise (Phase 1 decision).
- **Isolation:** every queryset filtered by `request.workspace` via a `WorkspaceScopedMixin` (v1 §9 pattern). Resolve from session/auth — never from URL/body.
- **Auth:** Allauth (email/password + OAuth). v1 locked JWT via SimpleJWT — for a same-domain SPA, session cookies are simpler and safer; **Phase 3 carries a decision block** on session vs JWT.
- **API keys / external access:** deferred to backlog (§15).

---

## 11. Publishing Pipeline

Unchanged in substance from v1 §11 (platform hosting, ZIP download, GitHub commit via Git Trees API; shell HTML generation per v1 §20). Triggered by `POST /sites/{id}/publish/` → `PublishJob` → Celery. All v1 code (GitHubTreePublisher, exporter) carries over.

One **new** consideration v1 dodged: a hosted site builder lives or dies by basic SEO. CSR-only output (v1's MVP stance) is weak. Phase 7 carries a decision block on whether pre-rendered HTML at publish time (SSG-lite) is a launch requirement or a fast-follow.

---

## 12. Plans, Credits & Metering

Modeled on Lovable/Base44:

- **Credit unit:** one agent message ≈ one credit (plus per-tool token accounting in `UsageEvent` for analytics; overage policy is a Phase 9 decision).
- Free tier: N credits/month, M sites, Sazeh subdomain publishing only.
- Pro: more credits, more sites, GitHub publishing, higher media limits.
- Metering writes `UsageEvent` rows from the orchestrator, publishing tasks, and media endpoints; a periodic task reconciles `workspace.credits_balance`.
- Plan gates: registry entries above plan return `is_locked: true` (v1 §15) — the agent sees them but must tell the user to upgrade.

---

## 13. Phase-by-Phase Development Plan

Estimates assume one developer working with AI-assisted tooling; they are planning aids, not commitments. Each phase ends with **exit criteria** — do not start the next phase until they pass. Every `[DECISION NEEDED]` block is collected in §14; write your answer inside the block as you go.

---

### Phase 0 — Product Definition & Scaffolding (Week 1)

**Goal:** Lock the decisions that are expensive to change, and stand up the empty monorepo.

**Tasks**
1. Create repo structure: `apps/backend` (Django 5 + DRF), `apps/web` (Vite + React 18 + TS strict + Tailwind v4 + shadcn init), `packages/schema` (shared TS types).
2. Docker Compose: Postgres, Redis, Django runserver, Celery worker, Vite dev server.
3. CI (GitHub Actions): ruff, mypy, pytest on backend; tsc + build on web. PR-only main.
4. Settings: `pydantic-settings` env management, `.env.example`, secret handling conventions.
5. Write the design-token sheet (OKLCH neutral ramp + one accent, light/dark variable sets) — needed before any UI phase.
6. Write a one-page product spec: target user, the two input paths, launch scope (this plan §1).

**Exit criteria:** `docker compose up` boots everything; CI green on a skeleton commit; design tokens documented.

**Decisions**

> **[DECISION NEEDED] D0.1 — Primary UX order: chat-first or editor-first?**
> Lovable/Base44 open on "describe your site" chat; v0 is prompt-first; classic WordPress/Squarespace open on the editor. This decides which experience is the default landing surface after "create site", and how much of Phase 4 vs Phase 6 gets prioritized/built first.
> (a) Chat-first — agent builds the first draft, editor is for refinement (Lovable model)
> (b) Editor-first — drag-and-drop is the product, chat is an assistant panel (WordPress+AI model)
> (c) Both at once — generate + edit in one canvas from day one (most work)
>
> **[YOUR ANSWER]:** **(a) Chat-first** — agent builds the first draft, editor is for refinement (Lovable model). After "create site", the default surface is the generate/chat screen; Phase 6 (chat in editor) is prioritized alongside Phase 5, Phase 4's editor follows.

> **[DECISION NEEDED] D0.2 — LLM provider strategy at launch.**
> (a) Anthropic Claude only — strongest tool-calling, fastest to build
> (b) OpenAI only
> (c) Provider-agnostic adapter from day one (Anthropic + OpenAI), slight build-time cost
> Affects SDK choice, prompt format, and streaming implementation in Phase 5.
>
> **[YOUR ANSWER]:** **OpenAI-compatible endpoint, platform-configured** — we set our own base URL, API key, and model name via environment (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`), so any OpenAI-compatible gateway (OpenAI, Azure, OpenRouter, self-hosted vLLM) works behind one adapter. The adapter only needs to speak the OpenAI wire format (chat completions + tool calling + streaming). Roadmap (Phase 5 adapter design + Phase 9 pricing, folds into D9.2): expose a **model catalog** so users can pick which model powers their Sazeh agent, with per-model credit pricing — usage metered per selected model via `UsageEvent`.

> **[DECISION NEEDED] D0.3 — Deployment target confirmation.**
> V1 locked Fly.io. Confirm, or pick Railway/Render (managed Postgres/Redis can save setup time pre-PMF).
>
> **[YOUR ANSWER]:** _(pending)_

> **[DECISION NEEDED] D0.4 — Product name/domain confirmation.**
> Is "Sazeh" the shipping name? Domain/subdomain strategy for the app itself (`sazeh.app`?) and for published sites (D7.1 depends on this).
>
> **[YOUR ANSWER]:** _(pending)_

---

### Phase 1 — Accounts, Workspaces & Core Data Layer (Weeks 1–2)

**Goal:** Every table that later phases depend on exists, migrated, and tested.

**Tasks**
1. Custom `User` (email login), allauth installed; no UI yet (admin only).
2. `Workspace` + `WorkspaceMember`; signal auto-creates a personal workspace on signup.
3. `Site` and `Page` models with JSONB `tree` (v1 §5 field-for-field).
4. `WorkspaceScopedMixin` + base viewsets (empty serializers fine) wired to `request.workspace`.
5. Django admin for all models.
6. `ComponentRegistryEntry` model + migration (seeding is Phase 2).
7. Model/service unit tests; factory fixtures (`factory-boy`).

**Exit criteria:** A user created in admin automatically owns a workspace and can (via shell) create a site and page whose tree round-trips through validation stubs.

**Decisions**

> **[DECISION NEEDED] D1.1 — Teams at launch or single-user workspaces?**
> (a) Single-user workspaces only (simplest; add teams later — the model already has WorkspaceMember)
> (b) Teams from day one (invites, roles) — significant scope add
>
> **[YOUR ANSWER]:** _(pending)_

> **[DECISION NEEDED] D1.2 — Free-plan site/page limits (numbers, not mechanism).**
> E.g. 3 sites, 10 pages/site? These are enforced starting Phase 9 but the product spec should state them now.
>
> **[YOUR ANSWER]:** _(pending)_

---

### Phase 2 — Component Registry & Rendering Engine (Weeks 2–3)

**Goal:** The registry is seeded, validation is bulletproof, and a tree renders to React.

**Tasks**
1. `seed_registry` management command parsing `/shadcn/*.md` → primitive entries with JSON Schemas (v1 §6 pipeline).
2. Hand-curate the launch composite sections with Draft-07 schemas (v1 §16 has four; extend to the full launch set) + example payloads.
3. Validation engine: `validate_component_instance` / `validate_page_tree` (v1 §6) + `TreePatcher` (v1 §18) with full test coverage (unknown component, extra props, bad enum, deep nesting, atomic patch rollback).
4. `packages/schema`: generate TS types (`ComponentInstance`, registry types) from the schemas.
5. React `ComponentRenderer` / `PageRenderer` + `COMPONENT_MAP` (v1 §8) for every launch section.
6. A render test harness (static route that renders any stored tree) — the ancestor of the editor canvas and the published-site engine.

**Exit criteria:** A page tree seeded via fixture renders correctly in the browser; a hand-corrupted tree is rejected by the API with field-level 422 errors (v1 §7 error shape).

**Decisions**

> **[DECISION NEEDED] D2.1 — Launch section list (the actual catalog).**
> Proposed launch composites: HeroSection, FeatureGrid, PricingTable, FAQAccordion, TestimonialSection, CtaBanner, LogoWall, TextSection, ContactForm, NavBar, Footer, ImageGallery. Confirm / add / cut. This defines what BOTH the agent and the palette can build with at launch.
>
> **[YOUR ANSWER]:** _(pending)_

> **[DECISION NEEDED] D2.2 — Theme token granularity.**
> How much can a user/agent restyle a site? (a) Minimal: accent color + font + radius (v1 config shape); (b) Extended: + section background variants, heading scale; (c) Full token sheet per site (approaching a mini design system editor). Affects `set_site_theme` tool + settings UI scope.
>
> **[YOUR ANSWER]:** _(pending)_

---

### Phase 3 — Auth & Dashboard (Weeks 3–4)

**Goal:** A user can sign up, land in a dashboard, and manage sites — no editor yet.

**Tasks**
1. Allauth flows: signup, login, logout, password reset; OAuth if D3.1 says yes.
2. SPA↔Django auth wiring per D3.2 (session cookie vs JWT).
3. Dashboard shell: sites grid (cards with publish status, updated-at), create-site flow (name + slug + starter choice), site settings page (theme tokens editor writing `site.config` — first consumer of D2.2), delete/rename.
4. Empty states + copy pass (`frontend-design` skill applies from here on).
5. Onboarding stub: after "create site" → redirect target depends on D0.1 (chat screen vs editor).

**Exit criteria:** Full loop in the browser: signup → create site → edit theme tokens → persists.

**Decisions**

> **[DECISION NEEDED] D3.1 — OAuth providers.**
> (a) Email/password only at launch; (b) + GitHub; (c) + Google; (d) both.
>
> **[YOUR ANSWER]:** **(a) Email/password only at launch.** OAuth may be added later; not an MVP concern.

> **[DECISION NEEDED] D3.2 — SPA auth mechanism.**
> V1 locked SimpleJWT. For a same-domain Vite SPA, HttpOnly session cookies are simpler and CSRF-manageable; JWT helps if a future public API is planned (backlog §15).
> (a) Session cookies (recommended for MVP) (b) JWT per v1 (c) Sessions now, add JWT with the public API later.
>
> **[YOUR ANSWER]:** **(c) Sessions now, JWT later.** MVP SPA uses HttpOnly session cookies (simplest and the more secure choice for a browser-only SPA: no token in JS-reachable storage; CSRF via SameSite + Django middleware). JWT arrives with the public API (§15), where its stateless/flexible properties actually pay off. Phase 3 wires allauth for the SPA with session cookies.

---

### Phase 4 — Visual Editor, Manual Mode (Weeks 4–7)

**Goal:** The WordPress-mode product: a user builds and edits a complete site with zero AI.

**Tasks**
1. Editor route + three-panel layout (palette | canvas | inspector), sidebar for pages.
2. Zustand tree store + zundo undo/redo (v1 §15 lock).
3. Palette: registry components grouped by category, searchable (served from Phase 2 registry API).
4. Canvas: `ComponentRenderer` preview, click-to-select, hover outlines, selection overlays, add/delete/duplicate section controls.
5. Drag-and-drop: @dnd-kit for palette→canvas insert and section reorder.
6. Inspector: `SchemaFormRenderer` handling string / enum / boolean / number / uri / array-of-objects (v1 §8), bound to the tree store, writing through the debounced autosave.
7. Page management: add/delete/rename pages, page SEO fields (meta title/description), slug rules.
8. Autosave: debounced PATCH via tree/patch endpoint; dirty-state indicator; optimistic updates.
9. Breakpoint preview toggle (desktop/tablet/mobile) — scope per D4.2.

**Exit criteria:** A non-technical user can, without docs: create a page, assemble a 5-section landing page from the palette, edit every prop, reorder, undo, and have it autosave. This is the "users don't have to use agents" guarantee.

**Decisions**

> **[DECISION NEEDED] D4.1 — Inline text editing on canvas?**
> Double-click-a-headline-to-edit inline (Squarespace-like, adds significant complexity) vs inspector-only editing for MVP.
>
> **[YOUR ANSWER]:** _(pending)_

> **[DECISION NEEDED] D4.2 — Breakpoint preview scope.**
> (a) Desktop canvas only at launch; (b) desktop + mobile preview toggles (read-only scaling); (c) per-breakpoint prop overrides in the schema model (big data-model change — needs registry schema support).
>
> **[YOUR ANSWER]:** _(pending)_

> **[DECISION NEEDED] D4.3 — Primary editor user.**
> Carried from v1 §14: non-technical founder (needs more guidance copy, guarded defaults) vs semi-technical builder (denser UI, more control). Shapes inspector labels, palette descriptions, empty states.
>
> **[YOUR ANSWER]:** _(pending)_

---

### Phase 5 — Agent Core: Orchestrator & Tool Loop (Weeks 6–8, overlaps Phase 4)

**Goal:** Server-side agent can conversationally build a page, with all mutations validated and auditable. No UI work — tested via API tests and admin.

**Tasks**
1. LLM provider adapter per D0.2 (streaming, tool/function calling, usage reporting).
2. `AgentSession` / `AgentMessage` / `ToolRun` models + migrations.
3. System-prompt builder: platform rules, design guidelines (typed, section-based composition, no raw code), registry subset, site config, tree context, selection context.
4. Tool implementations wrapping the service layer (§7 table) with structured success/validation-error results.
5. Orchestrator loop (§8): streaming, tool-result feedback, self-healing retry on validation errors, iteration/token guards, per-session lock, cancellation endpoint.
6. UsageEvent writes (tokens per run).
7. Test suite: fake LLM adapter (scripted tool-call sequences) — deterministic tests of the loop, guards, rollback on failure.

**Exit criteria:** Via API test client: a scripted/fake LLM session that patches a page produces a valid tree, ToolRun records, usage events, and a clean failure path when the LLM hallucinates a component (error fed back, model retried, hard cap enforced).

**Decisions**

> **[DECISION NEEDED] D5.1 — Agent autonomy: apply directly or propose-then-approve?**
> (a) Direct apply — changes land on the canvas immediately; user undoes via history (Lovable-like, feels magical)
> (b) Approve-diff — agent proposes; user reviews a before/after and accepts (safer, slower feel)
> (c) Hybrid — direct apply for small patches, approval gate for page creation/deletion.
>
> **[YOUR ANSWER]:** _(pending)_

> **[DECISION NEEDED] D5.2 — Streaming transport.**
> (a) SSE (one-way, simple, fits token streaming; actions go via normal REST) — recommended
> (b) WebSocket (bidirectional; more infra/complexity than needed for MVP).
>
> **[YOUR ANSWER]:** _(pending)_

> **[DECISION NEEDED] D5.3 — Conversation scope.**
> Chat scoped per (a) site (one thread knows the whole site), or (b) per page, or (c) per site with page-context switching. Affects context assembly and UI.
>
> **[YOUR ANSWER]:** _(pending)_

> **[DECISION NEEDED] D5.4 — Run budgets (numbers).**
> Max tool iterations per run, max tokens per run, max retries per failed tool call (proposed: 25 / ~100k / 2).
>
> **[YOUR ANSWER]:** _(pending)_

---

### Phase 6 — Agent UX: Chat in the Editor (Weeks 8–10)

**Goal:** The Lovable moment — users watch their site get built/edited by chat, live.

**Tasks**
1. Chat panel UI in the editor (dockable; full-screen "generate" mode for first-draft onboarding per D0.1).
2. SSE client wired to the agent store; streaming text render; tool activity feed ("Adding HeroSection…").
3. Canvas integration: optimistic application of `patch_page_tree` events; node highlight during mutation; agent changes are normal undo steps.
4. Selection-aware messages: selected node id + subtree injected into message context ("make THIS darker") — per D6.1.
5. Session sidebar: past conversations, resume, auto-titling.
6. Pre-agent-run tree snapshot (via ToolRun/tree_snapshot) + "restore to before this run" action — scope per D6.2.
7. Credit preview: message composer shows remaining credits (real metering lands Phase 9; UI now).
8. Prompt library / starter prompts in empty chat state.

**Exit criteria:** E2E demo: user types a site brief → watches sections stream onto the canvas → clicks undo → agent change reverts → selects a section and asks for a targeted edit → correct node mutates.

**Decisions**

> **[DECISION NEEDED] D6.1 — Selection-aware chat at launch?**
> (a) Yes — selection context is a core differentiator, ship in v1
> (b) Later — plain chat first.
>
> **[YOUR ANSWER]:** _(pending)_

> **[DECISION NEEDED] D6.2 — Version history scope.**
> (a) Per-agent-run snapshots with restore only
> (b) Full version history panel (named versions, diff view, any-point restore) — bigger scope, big trust win.
>
> **[YOUR ANSWER]:** _(pending)_

---

### Phase 7 — Publishing Pipeline (Weeks 10–12)

**Goal:** Sites go live on the internet. Carries over v1 §11/§19/§20 essentially intact.

**Tasks**
1. `PublishJob` + Celery pipeline: render → write static bundle → upload → status updates.
2. Platform hosting path: shell HTML + `_site.json` + `_manifest.json` (v1 §20), S3/CDN serving at the D7.1 subdomain scheme; workspace/site slug routing.
3. ZIP export path: bundle + README, pre-signed URL download.
4. GitHub path: OAuth connect, encrypted token storage, `GitHubTreePublisher` (v1 §19).
5. SPA: publish modal (target picker), job progress polling, result link, publish history table.
6. Republish-diff behavior: republishing overwrites the bundle; old versions retained? (D7.3).

**Exit criteria:** A real site built in the editor is reachable on its public subdomain; ZIP downloads and opens; a GitHub repo receives a clean single commit.

**Decisions**

> **[DECISION NEEDED] D7.1 — Published-site URL scheme.**
> V1 locked `{tenant}-{site}.platform.app`. Confirm, or prefer `{site}.{tenant}.platform.app`, or single-tenant-style `{site}.platform.app` with global uniqueness (simpler DNS, but name-squatting issues).
>
> **[YOUR ANSWER]:** _(pending)_

> **[DECISION NEEDED] D7.2 — SEO posture at launch (important).**
> V1 accepted client-side-rendered output (bad SEO) for MVP. For a site builder this is a product weakness competitors will exploit.
> (a) Ship CSR at launch, SSG fast-follow
> (b) SSG-lite at launch: pre-render each page's static HTML from the tree at publish time (needs a Node render worker — scope/time cost)
> (c) Hybrid: pre-render critical pages (home, landing) only.
>
> **[YOUR ANSWER]:** _(pending)_

> **[DECISION NEEDED] D7.3 — Publish retention.**
> Keep previous publish bundles for rollback (storage cost, better UX) or overwrite-only?
>
> **[YOUR ANSWER]:** _(pending)_

---

### Phase 8 — Media, Templates & Onboarding (Weeks 12–14)

**Goal:** Sites get real images; new users get a great first five minutes.

**Tasks**
1. `MediaAsset` + S3 pre-signed direct uploads (`POST /media/upload-url/` per v1 §15) + media picker integrated into the inspector (image props) and canvas.
2. Alt-text prompts + width/height capture (CLS safety).
3. Stock imagery source for users without assets (per D8.1) — search/insert flow.
4. Templates: 3–5 starter sites as fixture trees; template gallery in create-site flow; "remix" (copy template into workspace).
5. Onboarding flow per D0.1: signup → create site → (template pick | "describe your site" chat) → editor with content already present.
6. Onboarding checklist (add a page, publish, connect domain later) as growth scaffolding.

**Exit criteria:** New user goes signup → published site with real imagery in under 10 minutes, choosing either the template path or the agent path.

**Decisions**

> **[DECISION NEEDED] D8.1 — Imagery strategy.**
> (a) Stock integration only (Unsplash/Pexels API — license-safe, fast to build)
> (b) AI image generation built in (differentiator; provider/cost decisions needed)
> (c) Uploads only at launch, stock later.
>
> **[YOUR ANSWER]:** _(pending)_

> **[DECISION NEEDED] D8.2 — Template count and style range at launch.**
> How many starter sites, and covering which verticals (portfolio, local business, SaaS, restaurant, ...)?
>
> **[YOUR ANSWER]:** _(pending)_

---

### Phase 9 — Plans, Credits & Billing (Weeks 14–16)

**Goal:** Revenue paths and cost controls exist before public launch.

**Tasks**
1. Billing provider integration per D9.1: checkout, subscription lifecycle, webhook handling, plan sync to `workspace.plan`.
2. Credit metering: orchestrator + publish + storage write `UsageEvent`; periodic reconciliation to `credits_balance`; per-plan monthly grant.
3. Enforcement: agent message composer blocks at 0 credits with upgrade prompt; publish/media limits enforced server-side.
4. Upgrade prompts inside the chat flow (when the agent hits a locked component: `is_locked` handling per v1 §15).
5. Dashboard billing page: current plan, usage this month, invoices link.
6. Admin: workspace lookup, credit grant/adjust, comping.

**Exit criteria:** A workspace can be upgraded through real checkout; a 0-credit workspace is blocked from agent messages but retains full manual editor access (manual mode is never credit-gated — recommend locking this as policy).

**Decisions**

> **[DECISION NEEDED] D9.1 — Billing provider.**
> (a) Stripe (max control, more work: tax/VAT is on you)
> (b) Merchant-of-record (Lemon Squeezy/Paddle — global tax handled, less control, revenue share).
>
> **[YOUR ANSWER]:** _(pending)_

> **[DECISION NEEDED] D9.2 — Pricing model and numbers.**
> Credits/month per plan, overage behavior (hard stop vs throttled vs paid top-up), plan prices, what Pro adds (GitHub publishing? more sites? AI image gen?). **Recommend: manual editing and publishing are never credit-gated; credits gate only AI messages.**
>
> **[YOUR ANSWER]:** _(pending)_

---

### Phase 10 — Hardening, Beta & Launch (Weeks 16–18)

**Goal:** Trustworthy enough to put in front of strangers.

**Tasks**
1. E2E tests (Playwright): signup → template → manual edit → publish; signup → chat build → undo → publish.
2. Load test: 100 concurrent page writes with tree validation; orchestrator concurrency (N parallel runs).
3. Error-envelope audit across all endpoints (v1 §7 shapes).
4. Security review: CORS/CSP, session security, upload validation (type/size), rate limits (per-user agent message limits especially — LLM cost protection), prompt-injection review, S3 bucket policies.
5. LLM cost model review: tokens/site, p95 run cost; tune compact-registry and context trimming.
6. Marketing site (this is where the `design-taste-frontend` skill gets used) + docs/tutorials for both modes.
7. Beta program: analytics events (signup, first site, first agent message, first publish), feedback widget, bug triage flow.
8. Launch: status page, error tracking (Sentry), uptime checks.

**Exit criteria:** Beta cohort can complete the core loop unassisted; p95 publish and agent-run latencies within targets; no critical security findings open.

**Decisions**

> **[DECISION NEEDED] D10.1 — Beta posture.**
> (a) Invite-only waitlist (controlled, Lovable-style) (b) Open beta with limits (c) Quiet launch to a small circle.
>
> **[YOUR ANSWER]:** _(pending)_

> **[DECISION NEEDED] D10.2 — Analytics tooling.**
> (a) PostHog (product analytics + session replay + flags — recommended for this product)
> (b) Plausible (privacy-first, lighter)
> (c) GA4.
>
> **[YOUR ANSWER]:** _(pending)_

---

## 14. Decision Log

All `[DECISION NEEDED]` blocks, in one place. Fill in answers here or inline in Phase sections (keep them in sync).

| ID | Phase | Topic | Answer |
|---|---|---|---|
| D0.1 | 0 | Chat-first vs editor-first UX | **(a) Chat-first (Lovable model)** |
| D0.2 | 0 | LLM provider strategy | **OpenAI-compatible endpoint (env-configured base URL/key/model); user-selectable model catalog with per-model credit pricing later (folds into D9.2)** |
| D0.3 | 0 | Deployment target | _(pending)_ |
| D0.4 | 0 | Product name/domain | _(pending)_ |
| D1.1 | 1 | Teams vs single-user workspaces | _(pending)_ |
| D1.2 | 1 | Free-plan site/page limits | _(pending)_ |
| D2.1 | 2 | Launch component catalog | _(pending)_ |
| D2.2 | 2 | Theme token granularity | _(pending)_ |
| D3.1 | 3 | OAuth providers | **(a) Email/password only at launch** |
| D3.2 | 3 | SPA auth: session vs JWT | **(c) Sessions now (HttpOnly cookies), JWT with the public API later** |
| D4.1 | 4 | Inline text editing on canvas | _(pending)_ |
| D4.2 | 4 | Breakpoint preview scope | _(pending)_ |
| D4.3 | 4 | Primary editor user | _(pending)_ |
| D5.1 | 5 | Agent autonomy: apply vs approve | _(pending)_ |
| D5.2 | 5 | Streaming transport: SSE vs WS | _(pending)_ |
| D5.3 | 5 | Conversation scope | _(pending)_ |
| D5.4 | 5 | Run budgets (iterations/tokens) | _(pending)_ |
| D6.1 | 6 | Selection-aware chat | _(pending)_ |
| D6.2 | 6 | Version history scope | _(pending)_ |
| D7.1 | 7 | Published-site URL scheme | _(pending)_ |
| D7.2 | 7 | SEO posture: CSR vs SSG at launch | _(pending)_ |
| D7.3 | 7 | Publish bundle retention | _(pending)_ |
| D8.1 | 8 | Imagery: stock vs AI-gen vs uploads | _(pending)_ |
| D8.2 | 8 | Template count/verticals | _(pending)_ |
| D9.1 | 9 | Billing provider | _(pending)_ |
| D9.2 | 9 | Pricing model and numbers | _(pending)_ |
| D10.1 | 10 | Beta posture | _(pending)_ |
| D10.2 | 10 | Analytics tooling | _(pending)_ |

**Pre-settled decisions (carried from v1 §15 or this plan — listed so they are not re-asked):** monorepo layout; shadcn/ui as the component library (never default-state); Tailwind v4; Zustand + zundo undo/redo; @dnd-kit; registry gating via `is_locked`; S3 pre-signed media uploads; GitHub OAuth App for publishing; custom domains deferred post-launch; external/public API deferred post-launch.

---

## 15. Post-Launch Backlog (not in any phase)

- **Public API + API keys** — the v1 concept (external agents like Claude Code/Codex calling Sazeh). Still a good idea; after launch it is nearly free because external agents will consume the same REST surface the SPA does.
- Custom code component escape hatch (sandboxed slot) — v1 §2 tradeoff.
- SSG/SSR proper (if D7.2 defers it), i18n for published sites, blog engine deepening (posts as data, not trees), forms/submissions backend for published sites, team workspaces (if D1.1 defers), custom domains, marketplace for community sections, analytics for published sites (`PageView`), white-label agency mode.
