# Sazeh — Project Status

**Last updated:** 2026-09-28 (post-repair baseline)
**Scope:** backend audit + full repair pass; all quality gates green.

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
| `mypy .` | clean (49 files) |
| `pytest` | **32 passed** (tree engine, validator, tenancy/IDOR regressions, roles, signals) |
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

---

## 4. Plan Phase Scorecard (updated)

| Phase | Status | Notes |
|---|---|---|
| 0 — Scaffolding | 🟢 ~90% | Missing: design-token sheet, `apps/web`, `packages/schema` |
| 1 — Accounts & Data Layer | 🟢 done | Models, migrations, signals, tenancy, admin, tests |
| 2 — Registry & Engine | 🟡 ~60% | Validator/patcher/seed done + tested; missing: shadcn-docs parser for primitives, more composites, `packages/schema` TS types, render harness |
| 3 — Auth & Dashboard | 🔴 0% | Decided (D3.2): session cookies for the SPA. allauth is currently server-rendered only → needs SPA wiring (headless/custom views + CSRF endpoint) |
| 4–10 | 🔴 0% | Editor, agent orchestrator/UX, publishing, media, billing, hardening |

### Decision log
Decided on 2026-09-28: **D0.1 = chat-first** (Lovable model; chat screen is the default surface after "create site"), **D0.2 = OpenAI-compatible LLM endpoint** (env-configured base URL/key/model; user-selectable model catalog with per-model credit pricing folds into Phase 5/D9.2 — `LLM_BASE_URL` already added to settings), **D3.1 = email/password only at launch**, **D3.2 = session cookies now, JWT with the public API later**. The remaining 24 decisions (`D0.3`–`D10.2`) are still pending per §14 of the plan. Next gating decisions: **D2.1** (launch component catalog) and **D2.2** (theme token granularity) for the Phase 2 remainder; **D5.1–D5.4** before the orchestrator.

---

## 5. Next Steps (recommended order)

1. Answer **D2.1 / D2.2** (needed to finish Phase 2) and later **D5.1–D5.4** before the orchestrator.
2. Phase 2 remainder: extend `seed_components` to parse `/shadcn/*.md` primitives; hand-curate the launch composite set (D2.1); start `packages/schema`.
3. Scaffold `apps/web` (Vite + React 18 + TS strict + Tailwind v4 + shadcn init) and the design-token sheet (Phase 0 leftover). Chat-first (D0.1) makes the generate/chat screen the first UI target after auth (D3.2: session cookies).
4. Then proceed per plan phases 3→5.
