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
| `mypy .` | clean (53 files) |
| `pytest` | **52 passed** (tree engine, validator, tenancy/IDOR regressions, roles, signals, headless auth flow) |
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
| 3 — Auth & Dashboard | 🟢 ~90% | **Pass 1 done:** allauth headless (`/_allauth/browser/v1/*`) behind session cookies (D3.2, D3.1 email/password only — email verification deferred, `ACCOUNT_EMAIL_VERIFICATION=none`); `/api/v1/me/` returns `default_workspace`; SPA login/signup/logout with React Hook Form + Zod; route guards + auth store. **Pass 2 done:** sites grid (create/rename/delete, live slug, empty states), post-create redirect → `/sites/:id/generate` (D0.1) with honest "agent arrives in Phase 5" stub + example-page seeder, theme token editor (first D2.2 consumer, Zod mirroring `theme.py`, server-side backstop in `SiteSerializer`), full-bleed draft preview with scoped site-theme CSS vars. **Remaining:** password-reset flow, dashboard polish |
| 4–10 | 🔴 0% | Editor, agent orchestrator/UX, publishing, media, billing, hardening |

### Decision log
Decided on 2026-09-28: **D0.1 = chat-first** (Lovable model), **D0.2 = OpenAI-compatible LLM endpoint** (env-configured; user-selectable model catalog with per-model credit pricing folds into Phase 5/D9.2), **D3.1 = email/password only**, **D3.2 = session cookies now, JWT with the public API later**, **D2.1 = 9 composites + 6 primitives** (ContactForm/LogoWall/ImageGallery deferred to Phase 8), **D2.2 = extended theme tokens** (accent/font/radius/heading-scale + section background variants). Remaining pending: `D0.3`, `D0.4`, `D1.1`, `D1.2`, `D4.1`–`D4.3`, `D5.1`–`D5.4`, `D6.1`, `D6.2`, `D7.1`–`D7.3`, `D8.1`, `D8.2`, `D9.1`, `D9.2`, `D10.1`, `D10.2`. Next gating: none — Phase 3 frontend work can start; **D5.1–D5.4** needed before the orchestrator.

### Note on the registry seed source
The plan's "parse `/shadcn/*.md` into schemas" pipeline was realized as **hand-curated JSON files in `apps/registry/components/`** (informed by the vendored shadcn docs — e.g. Button's variant/size enums) loaded by the repeatable `seed_components` command. The curated-JSON approach is more robust than parsing markdown for the 15-component launch catalog; the shadcn docs remain the reference for mapping components.

---

## 5. Next Steps (recommended order)

1. **Answer D5.1–D5.4** (streaming transport, model exposure, session/autonomy model) — gates the orchestrator; then Phase 5 backend (LLM adapter per D0.2, AgentSession/ToolRun models, tool loop) makes the generate screen live.
2. **Phase 4 decisions D4.1–D4.3** (inline editing, breakpoints, editor user) — then the three-panel visual editor reuses the Pass 2 `ComponentRenderer`/`COMPONENT_MAP` on the canvas.
3. **Phase 3 remainder:** password-reset flow + dashboard polish (can slot in any time).

---

## 6. Pass 2 implementation notes (2026-09-29)

- **Default workspace:** `workspaces/services.py::ensure_default_workspace(user)` is the idempotent guarantee (signal covers new users; superusers/fixtures created before the signal get one on demand). `SiteViewSet.perform_create` falls back to it when the body omits `workspace`; an explicit workspace hint is still accepted but always resolved against *writable* workspaces (foreign id → 404). `workspace` is now a read-only serializer field.
- **Theme backstop:** `SiteSerializer.validate_config` runs `validate_theme` on `config["theme"]` — invalid sheets are rejected 400 with field-level errors.
- **Generator fix:** `packages/schema/scripts/generate.mjs` emitted array-of-objects props (`items`, `plans`, `testimonials`, `links`) as single objects — now `({...})[]`; catalog regenerated.
- **Render engine:** `apps/web/src/render/` — `COMPONENT_MAP` (15/15 launch components on shadcn primitives), recursive `ComponentRenderer` with unknown-component fallback, `SiteThemeStyle` scoping `--primary`/`--ring`/`--radius`/font from `site.config.theme` (satoshi falls back to system until bundled — Fontshare-licensed).
- **Preview is read-only by design** (chat-first D0.1; interactive surface is Phase 4's editor). The generate stub's "Preview an example page" seeds 7 example sections through the real `tree/patch` API — exercises the engine + client-side `TreePatchOp` end to end.
