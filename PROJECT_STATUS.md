# Sazeh — Project Status

**Last updated:** 2026-09-30 (Phase 4 visual editor)
**Scope:** agent core + chat UI complete; visual editor (manual mode) built; 108 backend tests green.

---

## 1. Executive Summary

The backend is a **working, tested, committed baseline**: Django boots, all migrations exist, ruff/mypy/pytest pass (32 tests), and CI is wired up. The state corresponds to roughly **Phase 1 complete and Phase 2 ~60%** of `sazeh-dev-plan-v2.md`. The frontend (`apps/web`), `packages/schema`, agent orchestrator (Phase 5), publishing (Phase 7), media (Phase 8) and billing (Phase 9) do not exist yet.

This document was first written after an audit that found the project unable to boot; a repair pass (same day) fixed every finding. The repair log is in §3; remaining work is in §5.

---

## 2. Current State

### Backend inventory (`apps/backend/`)

| App | Contents | Status |
|---|---|---|
| `config/` | pydantic-settings-driven `settings.py`, `settings_test.py` (hermetic), celery, urls, asgi/wsgi | ✅ boots |
| `accounts` | Custom `User` (UUID PK, email login), admin, `POST/GET /api/v1/me/`, **signup signal → personal workspace** | ✅ |
| `workspaces` | `Workspace`/`WorkspaceMember`, owner-only update/destroy, `members` action (GET any member; POST/DELETE owner-only), `scoping.py` (`WorkspaceScopedMixin` + membership helpers) | ✅ |
| `registry` | `Component` model, cached `RegistryService`, list/detail API, `seed_components` command, 3 seed JSONs, **cache-invalidation signals** | ✅ |
| `sites` | `Site`/`Page` (label `sazeh_sites`), recursive JSON-Schema tree validator, atomic TreePatcher + `tree/patch` endpoint, nested routers | ✅ |
| `agent` | `AgentSession`/`AgentMessage`/`ToolRun` models only (orchestrator = Phase 5) | ✅ models |

### Quality gates

| Gate | Result |
|---|---|
| `manage.py check` | clean |
| `ruff check .` | clean |
| `mypy .` | clean (53 files) |
| `pytest` | **108 passed** (tree engine, validator, tenancy/IDOR regressions, roles, signals, headless auth flow, sites API, agent loop/tools/API) |
| `tsc -b` / `vite build` (apps/web) | clean (chunk >500 kB warning — code-split later) |
| Boot smoke | migrate OK; `/admin/login/` → 200; `/api/v1/me/` → 403 unauthenticated |
| CI | `.github/workflows/backend.yml` — ruff + mypy + check + pytest on Postgres 16 |

### Test isolation model
`config/settings_test.py`: in-memory SQLite + LocMem cache by default (no services needed locally); setting `DATABASE_URL` switches tests to real Postgres (CI does this).

---

## 3. Repair Log (2026-09-28)

Findings from the audit → what was done:

**Boot blockers (all fixed)**
1. `agent/models.py` syntax error + corrupted docstring → repaired.
2. Phantom `media_assets`/`publish`/`billing` apps in `INSTALLED_APPS`/`config/urls.py` → removed (re-added when Phases 7–9 start); dead `publish` action removed from `sites/views.py`.
3. Missing deps `dj-database-url`, `drf-nested-routers` → added to `requirements.txt` + `pyproject.toml`.
4. `apps.agent.urls` include (app has no urls module) → removed until Phase 5.
5. App-label collision `django.contrib.sites` vs `apps.sites` → local app relabeled `sazeh_sites`.

**Security / tenancy (all fixed, regression-tested)**
6. Page detail endpoints 403-for-everyone → permission classes now resolve `Page → site.workspace` (`scoping.resolve_workspace`).
7. IDOR: `?workspace_id=` query param leaked foreign sites → removed; queryset scoping via `WorkspaceScopedMixin` everywhere.
8. IDOR: page lists filtered by bare `site_pk` → scoped by membership.
9. `SiteViewSet.perform_create` combined two different-model querysets (crash) → single scoped `Workspace` queryset; non-members get 404.
10. Any member could update/delete the workspace → workspace write actions now owner-only.
11. `tree_patch`/`tree` endpoints confirmed 404 for non-members (tests).

**Correctness / cleanup (fixed)**
12. Duplicate dead tree engine `sites/services.py` (conflicting op format) → deleted; `tree.py` + `validators.py` are canonical.
13. `allowed_children: []` was treated as "anything allowed" → now means "no children" (`["*"]` = anything), matching the seed data intent.
14. Registry cache never invalidated on admin edits → `post_save`/`post_delete` signals.
15. Missing Phase 1 signup signal (auto personal workspace + owner membership) → implemented with collision-safe slug.
16. Unused imports/serializers, long lines, import sorting → ruff-clean; `request` typing on the mixin for mypy.

**Docs / repo hygiene**
17. `sazeh-dev-plan.md` corrupted code fence repaired (fence fix kept); `shadcn/components.md` absolute URLs restored.
18. `.gitignore` extended (generated index artifacts, Python/env/Django files); repo committed in logical commits (git-staged-commit workflow).

**Found by manual testing (2026-09-29, fixed)**
19. Login/signup blocked with Zod's `Invalid input: expected string, received undefined` on both fields → shadcn **base-style** components are written for React 19 ref-as-prop semantics, but the app runs React 18.3, where React strips `ref` before it reaches a plain function component. `ui/input.tsx` (a plain function component) dropped RHF's `register()` ref → `onChange` overwrote `defaultValues` with `undefined` → resolver saw `{}`. Fix: `ui/input.tsx` and `ui/button.tsx` wrapped in `React.forwardRef` with explicit ref pass-through to the Base UI primitive. **Convention while on React 18: every `ui/` wrapper that delegates to a primitive (or native element) and can receive a ref from forms must use `forwardRef` — adding new form primitives (textarea, checkbox, …) requires it.** Known latent inconsistency: `@types/react` is still 19 on a React 18.3 runtime (this is what masked the bug from `tsc`); aligning types is churn — revisit if React-19-only typing errors appear.
20. Follow-up 403 on allauth POSTs (CSRF HTML page, 2855 bytes): the SPA on `localhost:5173` can't read the `csrftoken` cookie Django sets for `127.0.0.1:8000` (different hosts; cookies ignore ports). **Decision (user): no Vite proxy — the dev convention is to browse the SPA at `http://127.0.0.1:5173`** so SPA and API share the host; CORS/CSRF settings already cover it. Documented in README; `localhost:5173` will 403 by design.

---

## 4. Plan Phase Scorecard (updated)

| Phase | Status | Notes |
|---|---|---|
| 0 — Scaffolding | 🟢 done | `apps/web` scaffolded (Vite + React 18.3 + TS 6 strict + Tailwind v4 via Vite plugin + shadcn base-nova); design-token sheet delivered (`apps/web/DESIGN_TOKENS.md` + themed `index.css`); `@sazeh/schema` consumed via path alias |
| 1 — Accounts & Data Layer | 🟢 done | Models, migrations, signals, tenancy, admin, tests |
| 2 — Registry & Engine | 🟢 done | Launch catalog (9 composites + 6 primitives, D2.1) seeded with example payloads; schemas Draft-07 with `additionalProperties: false`; `example_payload` field; theme tokens (D2.2, `apps/sites/theme.py`); `packages/schema` strict TS types; **React `ComponentRenderer`/`PageRenderer` + `COMPONENT_MAP` (all 15 components) + read-only preview harness** (Phase 2 tasks 5–6). Generator bug fixed: array-of-objects props now emit as arrays |
| 3 — Auth & Dashboard | 🟢 done | **Pass 1 done:** allauth headless (`/_allauth/browser/v1/*`) behind session cookies (D3.2, D3.1 email/password only — email verification deferred, `ACCOUNT_EMAIL_VERIFICATION=none`); `/api/v1/me/` returns `default_workspace`; SPA login/signup/logout with React Hook Form + Zod; route guards + auth store. **Pass 2 done:** sites grid (create/rename/delete, live slug, empty states), post-create redirect → `/sites/:id/generate` (D0.1), theme token editor (first D2.2 consumer), full-bleed draft preview. **Password reset done:** `ForgotPasswordPage` + `ResetPasswordPage` (SPA routes per `HEADLESS_FRONTEND_URLS`, console email backend in dev); only cosmetic dashboard polish remains |
| 4 — Visual Editor | 🟢 built | **D4.1–D4.3 decided:** inspector-only editing (no inline canvas text for MVP), desktop+mobile read-only preview toggle, non-technical founder as primary user. Three-panel editor at `/sites/:id/edit/:pageId?`: pages rail, searchable palette (dnd-kit drag or click-to-append), canvas with section selection/drag/chrome reusing `ComponentRenderer` via an opt-in `decorateChildren` hook, schema-driven inspector (RHF forms generated from registry JSON Schemas, array-of-objects lists, layers outline), page settings with SEO fields, debounced autosave + zundo undo/redo, breakpoint width toggle. Backend: subtree `insert` op (server reassigns ids recursively — duplicate/paste), `meta_title`/`meta_description` on Page. Pending: real-user manual test |
| 5 — Agent Core | 🟢 done (backend) | **D5.1–D5.5 decided (see plan §14).** Hand-rolled orchestrator loop (`apps/agent/orchestrator.py`): per-session Redis lock, budgets at turn boundaries (25 turns / 100k total / 32k output / 2 self-heal / 300s wall — env `AGENT_*`), cooperative cancel, incremental counters, ToolRun snapshots, graceful exhaustion. OpenAI-SDK adapter (D0.2, env-configured) + scripted `FakeLLM` for tests. 6 tools over the service layer; context builder = agentic retrieval (compact catalog / get_component / tree summaries). REST: sessions CRUD + messages, SSE `/agent/runs/{id}/events/` (loop drives the stream), cancel, revert. `AgentRun` model + `apps/usage.UsageEvent` metering. structlog JSON logging (run-scoped). 102 backend tests (108 total with the editor suite) |
| 6 — Agent UX | 🟢 done | **Chat UI live:** per-site chat page (`/sites/:id/generate`, the D0.1 onboarding surface) with sessions side menu (new chat, auto-title, resume), streaming text, tool activity feed, focused-page switcher, Stop + "Restore to before this run" actions, starter prompts, example-page seeder. **Docked in the editor (this pass):** ChatDock panel in the editor shell reusing the shared `components/chat/` primitives; selection-aware messages (D6.1 — selected node rides the run into the prompt); agent mutations stream onto the canvas via `mutationTick` refetches and enter zundo history (agent changes are ordinary undo steps); full-screen chat remains for first-draft onboarding. Deferred: credit preview (Phase 9) |
| 7–10 | 🔴 0% | Publishing, media/templates, billing, hardening |

### Decision log
Settled through 2026-09-30 (16 of 28): **D0.1** chat-first (Lovable model), **D0.2** OpenAI-compatible LLM endpoint (env-configured; per-model credit pricing folds into Phase 5/D9.2), **D2.1** 9 composites + 6 primitives, **D2.2** extended theme tokens, **D3.1** email/password only, **D3.2** session cookies now / JWT with the public API later, **D4.1** inspector-only editing, **D4.2** desktop+mobile read-only preview toggle, **D4.3** non-technical founder, **D5.1** direct apply + revert, **D5.2** SSE, **D5.3** per-site chats with page switching, **D5.4** env-tunable budgets, **D5.5** hand-rolled loop + OpenAI SDK + structlog, **D6.1** selection-aware chat at launch, **D6.2** per-run restore only. Remaining pending: `D0.3`, `D0.4`, `D1.1`, `D1.2`, `D7.1`–`D7.3`, `D8.1`, `D8.2`, `D9.1`, `D9.2`, `D10.1`, `D10.2`. Next gating: none.

### Note on the registry seed source
The plan's "parse `/shadcn/*.md` into schemas" pipeline was realized as **hand-curated JSON files in `apps/registry/components/`** (informed by the vendored shadcn docs — e.g. Button's variant/size enums) loaded by the repeatable `seed_components` command. The curated-JSON approach is more robust than parsing markdown for the 15-component launch catalog; the shadcn docs remain the reference for mapping components.

---

## 5. Next Steps (recommended order)

1. **Phase 4/5 polish from real usage:** run the E2E loop with a real `LLM_API_KEY`; tune the system prompt + budgets off `ToolRun`/`UsageEvent` data (queryable in admin); editor usability pass against the Phase 4 exit criterion.
2. **Phase 7 — Publishing pipeline** (next build phase): needs D7.1–D7.3 answered first.
3. **Cosmetic:** dashboard polish (relative-time consistency, publish status on cards), `@types/react` alignment (known latent inconsistency).

---

## 6. Pass 2 implementation notes (2026-09-29)

- **Default workspace:** `workspaces/services.py::ensure_default_workspace(user)` is the idempotent guarantee (signal covers new users; superusers/fixtures created before the signal get one on demand). `SiteViewSet.perform_create` falls back to it when the body omits `workspace`; an explicit workspace hint is still accepted but always resolved against *writable* workspaces (foreign id → 404). `workspace` is now a read-only serializer field.
- **Theme backstop:** `SiteSerializer.validate_config` runs `validate_theme` on `config["theme"]` — invalid sheets are rejected 400 with field-level errors.
- **Generator fix:** `packages/schema/scripts/generate.mjs` emitted array-of-objects props (`items`, `plans`, `testimonials`, `links`) as single objects — now `({...})[]`; catalog regenerated.
- **Render engine:** `apps/web/src/render/` — `COMPONENT_MAP` (15/15 launch components on shadcn primitives), recursive `ComponentRenderer` with unknown-component fallback, `SiteThemeStyle` scoping `--primary`/`--ring`/`--radius`/font from `site.config.theme` (satoshi falls back to system until bundled — Fontshare-licensed).
- **Preview is read-only by design** (chat-first D0.1; interactive surface is Phase 4's editor). The chat empty state's "Fill the Home page with an example" seeds 7 example sections through the real `tree/patch` API — exercises the engine + client-side `TreePatchOp` end to end.

---

## 7. Pass 3 implementation notes (2026-09-29)

- **Decisions locked:** D5.1 (a) direct apply + revert, D5.2 (a) SSE, D5.3 (c) per-site chats with page-context switching, D5.4 budgets (25 / 100k / 32k / 2 / 300s, env `AGENT_*`), **D5.5 (new) hand-rolled loop + OpenAI SDK + structlog** — all recorded in `sazeh-dev-plan-v2.md` §14.
- **Workflow in one line:** message → `AgentRun` (pending) → SSE connect acquires the session lock and drives the loop → per turn: assemble context (system prompt + compact catalog + site overview + focused tree + trimmed history) → stream LLM → execute tool calls against the service layer (validated; snapshot into `ToolRun`) → feed results back → final message + `UsageEvent`. Termination: done / cancelled / failed / budget_exhausted — all with a persisted assistant summary.
- **Glossary:** chat=session, run=one send→reply unit of work, turn=one LLM round-trip (cap counts these), tool call=one requested action (audit: `ToolRun`), event=one SSE tick. See `apps/agent/orchestrator.py` module docstring for invariants.
- **Analyzability:** full prompts/responses/tool args live in DB rows (admin-browsable), log files carry only ids/statuses/latencies — future tuning is SQL over `ToolRun`/`UsageEvent`/`AgentRun`.

---

## 8. Pass 4 implementation notes (2026-09-30)

- **D4 answers:** inspector-only editing (D4.1), desktop+mobile read-only width preview (D4.2), non-technical founder copy/guarded defaults (D4.3) — recorded in plan §14.
- **Editor store (`stores/editor.ts`):** Zustand + zundo temporal middleware tracking the tree only (`partialize` + JSON equality so save-state churn never pollutes history, limit 64). All mutations are pure structural copies guarded by a no-op check. `replaceProps` (inspector) vs `updateProps` (merge) — the inspector owns the full prop set so cleared optional fields actually clear.
- **Autosave is full-tree PATCH, not op streaming:** the plan's `tree/patch`-per-edit design fights undo/redo (restored snapshots no longer know their ops). The editor debounces 800ms and PATCHes the whole tree through `PageViewSet` (validated server-side); undo/redo is just another tree change. The op endpoint remains the agent's write path; conflict semantics are last-write-wins either way.
- **Renderer stays preview-clean:** `ComponentRenderer`/`PageRenderer` gained an optional `decorateChildren` hook — the canvas wraps the root's direct children in selection chrome (click-catcher button above the rendered component so links don't navigate, hover/selected rings, drag handle chip, move/duplicate/delete controls). Nested blocks are selected from the inspector's layers outline, dodging layout-breaking wrappers on every node.
- **DnD:** @dnd-kit with a 6px activation distance; palette items drag onto interleave slots (`slot:{index}` droppables) or click to append; sections drag by their chip with move-index shift math (remove-then-insert). DragOverlay shows a labeled card, not a live component.
- **Inspector forms:** generated from the registry's Draft-07 schemas — string (textarea when maxLength > 80), enum (Base UI Select, unset enums omitted from saves), number (`valueAsNumber`), uri, boolean (native checkbox), array-of-objects (`useFieldArray` one level deep; nested arrays like footer columns → links round-trip as JSON textareas). `blankItem()` seeds new items from sub-schemas.
- **Backend:** `insert` ops may carry a `children` subtree — `TreePatcher._materialize_subtree` reassigns ids recursively (client ids ignored; duplicate can't collide with the original) and `validate_tree` re-checks the whole result. `Page.meta_title`/`meta_description` added (migration `0002`), exposed in `PageSerializer` and edited from the inspector's page settings.
- **Deps:** `@dnd-kit/core`, `@dnd-kit/sortable`, `zundo` on the frontend. `generate.mjs` note: the emitted types live inside a template literal — no backticks in comments there (it broke once already).

---

## 9. Pass 5 implementation notes (2026-09-30)

- **D6 decisions:** selection-aware chat at launch (D6.1), per-run restore only (D6.2), credit preview deferred to Phase 9, password reset in this pass — recorded in plan §14.
- **Selection context:** `AgentRun.selection_node_id` (Char, not UUID — synthetic root ids exist); `POST …/messages/` accepts `selection: {page, node}` validated against the session's site and the page's tree; `context.build_messages(session, run)` appends a "Currently selected element" block (full subtree JSON, 4k char cap). Selection never rides in message content — history replay feeds content dicts straight to the LLM wire format.
- **Docked chat:** `components/chat/` primitives (SessionSidebar/MessageList/Composer/EmptyState) extracted from `GeneratePage` and shared with `editor/ChatDock.tsx`. The dock's focused page follows the editor's current page; the composer shows an "Editing: …" chip and the selection rides along (clearing = deselect in the editor).
- **Canvas live updates:** mutating `tool_succeeded` events (and `run_completed`/revert) bump `chat.mutationTick`; the shell debounces 250ms and `replaceTree`s the refetched page — a zundo history entry, so **agent changes are ordinary undo steps** (Ctrl+Z restores the pre-agent tree; the autosave PATCH reverts server-side). Refetch is skipped while local unsaved edits exist (next tick retries).
- **Password reset:** allauth headless `auth/password/request` + `auth/password/reset` — no custom adapter needed (`HEADLESS_FRONTEND_URLS` already pointed the email at the SPA). Console email backend in `DEBUG` (reset emails print to the runserver terminal). Gotchas encoded in tests: the anonymous reset success answers **401** (never auto-login), and unknown emails may get a courtesy notice but never a reset link.
- **Hotfix — pages endpoint collision (found by real testing, 2026-09-30):** `GET /api/v1/sites/{id}/pages/` resolved to the `SiteViewSet.pages` action (bare array) instead of the nested `PageViewSet.list` (paginated) — the SPA's `listPages()` got `undefined` and preview + editor showed "This site doesn't exist or you don't have access." even for owners. Fix: action removed; `PageViewSet.get_queryset` resolves the site against memberships (foreign site → 404, never an empty 200); the auto `UniqueTogetherValidator` (from `unique_together = ["site", "slug"]`) was dropped — it demanded `site` in the body — and per-site slug uniqueness moved into `validate_slug` with the site id injected via `get_serializer_context`. Tests: owner list → `{count, results}`, outsider → 404, member create → 201.
- **Editor discoverability:** the site card now opens the editor directly (`/sites/:id/edit`); preview stays in the card menu; load errors distinguish "different account" (403) from "site missing" (404).
- **Tests:** 118 backend (was 108).
