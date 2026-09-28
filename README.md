# Sazeh

A hosted agentic site builder — describe a site in chat and watch the built-in
agent assemble it, or skip AI entirely and build by dragging and dropping
components. Both paths write the same validated page-tree engine.

**Status:** backend Phase 1–2 complete (tenanted core, component registry,
validation engine, 52 tests); frontend Phase 3 Pass 1 complete (auth +
design tokens). See [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) for the live
scorecard and [`sazeh-dev-plan-v2.md`](./sazeh-dev-plan-v2.md) for the
authoritative product/development plan.

---

## Stack

| Layer | Choice |
|---|---|
| Backend | Django 5 + DRF, Python 3.12 |
| Database | PostgreSQL 16 (JSONB page trees) |
| Queue / cache | Celery + Redis |
| Auth | allauth headless — session cookies (email/password for MVP) |
| Frontend | Vite + React 18 + TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui (base style, themed) |
| Shared types | `packages/schema` — TS types generated from the component registry |

## Repository Layout

```
apps/backend/     Django project (config/ + apps/{accounts,workspaces,registry,sites,agent})
apps/web/         React SPA (auth shell done; dashboard/editor land next)
packages/schema/  TS types generated from the backend component registry
shadcn/           Vendored shadcn/ui docs (reference for the component registry)
PROJECT_STATUS.md Current progress, phase scorecard, repair log
sazeh-dev-plan-v2.md  Authoritative plan (phases 0–10, decision log)
```

---

## Prerequisites

- **Python 3.12**
- **Node.js 22** + npm
- **Docker** (for Postgres + Redis; tests use in-memory SQLite instead)

## Backend Setup

```bash
cd apps/backend

# 1. Virtual environment + dependencies
python -m venv .venv
source .venv/bin/activate            # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt  # runtime deps + ruff/mypy/pytest

# 2. Environment
cp .env.example .env                 # defaults work for local dev

# 3. Services (Postgres + Redis)
docker compose up -d db redis

# 4. Database + component registry seed
python manage.py migrate
python manage.py seed_components

# 5. Run
python manage.py runserver           # http://127.0.0.1:8000
```

The API lives under `/api/v1/` (session-cookie auth via allauth headless at
`/_allauth/browser/v1/*`). Django admin is at `/admin/` — create a superuser
with `python manage.py createsuperuser`.

Celery is wired but unused until the publishing/agent phases:

```bash
celery -A config worker -l info
```

### Docker Compose (full stack)

```bash
docker compose up           # db, redis, worker, web (runserver)
docker compose run --rm web python manage.py migrate
```

### Environment Variables (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DJANGO_SECRET_KEY` | dev value | Set a real secret outside dev |
| `DJANGO_DEBUG` | `false` | Enable for local dev |
| `DATABASE_URL` | `postgres://sazeh:sazeh@localhost:5432/sazeh` | Postgres DSN (SQLite accepted for tests) |
| `REDIS_URL` | `redis://localhost:6379/0` | Cache + Celery result backend |
| `CELERY_BROKER_URL` | `redis://localhost:6379/1` | Celery broker |
| `LLM_PROVIDER` / `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | OpenAI-compatible | Agent LLM config (Phase 5; any OpenAI-compatible gateway) |
| `AWS_*` | — | S3 for media/publishing (Phase 7–8) |

## Frontend Setup

```bash
cd apps/web
npm install
npm run dev          # http://localhost:5173 (talks to the backend on :8000)
```

Auth is session-cookie based: sign up at `http://localhost:5173/signup`.
CORS/CSRF for the 5173→8000 dev pairing are pre-configured on the backend.

## Shared Types (`packages/schema`)

The component registry (`apps/backend/apps/registry/components/*.json`) is the
single source of truth. Regenerate the TypeScript catalog after editing any
component JSON:

```bash
cd packages/schema
npm install
npm run generate     # emits src/generated/catalog.ts + catalog.json
npm run check        # typecheck
```

`apps/web` consumes it through the `@sazeh/schema` path alias (no build step).

---

## Quality Gates

Backend (from `apps/backend/`):

```bash
python -m pytest          # 52 tests; in-memory SQLite + LocMem cache, no services needed
ruff check .
mypy .
```

Tests run hermetically by default. To validate against real Postgres, set
`DATABASE_URL` before running pytest. CI (`.github/workflows/backend.yml`)
runs ruff + mypy + system checks + pytest on Postgres 16 for every backend
change.

Frontend (from `apps/web/`):

```bash
npx tsc -b            # typecheck (strict + noUncheckedIndexedAccess)
npm run build         # production build
npm run lint          # oxlint
```

---

## Working on This Repo

- **Read [`AGENTS.md`](./AGENTS.md) first** if an AI agent works here; it
  points at the authoritative v2 plan and the settled decisions (shadcn/ui,
  Tailwind v4, Zustand, React Hook Form + Zod, @dnd-kit).
- **Don't re-litigate settled decisions**; open decisions live in the
  `[DECISION NEEDED]` blocks of `sazeh-dev-plan-v2.md` §14 (6 of 28 answered).
- **Tenant isolation:** every queryset is scoped via
  `apps/workspaces/scoping.py` (`WorkspaceScopedMixin`) — never accept
  workspace IDs from request bodies or query params.
- **Components:** all UI is shadcn/ui themed through the token sheet in
  [`apps/web/DESIGN_TOKENS.md`](./apps/web/DESIGN_TOKENS.md) — never shipped
  in default state.
- **Registry changes:** edit the JSON files, re-run `seed_components`
  (backend) and `npm run generate` (packages/schema).
