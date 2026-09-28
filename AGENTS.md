# AGENTS.md

Agent-facing guidance for working in this repository. The authoritative plan is [`sazeh-dev-plan-v2.md`](./sazeh-dev-plan-v2.md) (which supersedes [`sazeh-dev-plan.md`](./sazeh-dev-plan.md) — v1 is kept only as a technical reference for deep-dive code). Treat v2 as the source of truth for product direction and phasing.

## What This Project Is

**Sazeh** is a hosted agentic site builder in the mold of **Base44 / Lovable / v0** — NOT a developer tool/API for external agents (Claude Code, Codex). The platform ships with its own built-in AI agent: users describe a site in a chat panel and the platform's agent service (LLM + tool-calling loop) builds it. Equally important: **users don't have to use AI at all** — they can build like WordPress, dragging and dropping pre-defined components, editing props, and publishing manually. Both paths write the same data model.

- Backend: Django 5 + DRF, PostgreSQL (JSONB page trees), Celery + Redis, multi-tenant (workspaces).
- Agent: platform-side "Agent Orchestrator" — an LLM with tool definitions executed server-side, streamed to the browser (SSE); LLM usage metered as credits.
- Frontend: React 18 + TypeScript on Vite, with three areas: a marketing/auth shell, a dashboard (sites, publish history, usage/billing), and a visual page editor (three-panel drag-and-drop editor with a schema-driven prop inspector and an agent chat panel).
- The agent and the visual editor are two clients of the same validated JSON page-tree engine: `ComponentInstance` nodes validated against a component registry seeded from shadcn/ui docs.

## Settled Decisions (do not re-litigate)

| Decision | Choice |
|---|---|
| UI component library | **shadcn/ui** |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Forms | React Hook Form + Zod |
| Drag-and-drop | @dnd-kit |
| Backend | Django 5 + DRF |
| Repo layout | Monorepo: `apps/backend`, `apps/web`, `packages/schema` |

### shadcn/ui is the component library

- All UI is built with shadcn/ui components added via `npx shadcn@latest add ...`. Do not propose or introduce alternative component libraries (MUI, Chakra, Ant Design, Radix Themes, etc.).
- The [`shadcn/`](./shadcn) directory contains vendored shadcn component docs (one `.md` per component, fetched by `download_shadcn_components.py`). Use these as the local reference for component APIs and props.
- This choice is architectural, not just cosmetic: the platform's component registry is seeded from shadcn docs (dev plan §6), and composite site sections (`HeroSection`, `FeatureGrid`, ...) are built on top of shadcn primitives.
- Never ship shadcn components in default state: theme them through Tailwind v4 CSS variables/tokens to match the project design.
- Icons: shadcn's default `lucide-react` is acceptable in this repo.
- Tailwind v4 note: use `@tailwindcss/postcss` or the Vite plugin; do not use the legacy `tailwindcss` PostCSS plugin.

## Frontend Skills — Which One to Use

Two frontend skills are installed in `.opencode/skills/`. They have different scopes; pick per surface:

- **`frontend-design`** — default for **all product UI** in this repo: dashboard, visual page editor, forms, tables, dialogs. It is general design guidance (aesthetic direction, typography, copy, restraint) and does not exclude any UI type.
- **`design-taste-frontend`** — use only for the **marketing/auth shell** (public landing/marketing pages). It is explicitly scoped to landing pages/portfolios/redesigns and declares dashboards and dense product UI out of scope (its Section 13), but it pairs explicitly with shadcn/ui and has strong anti-slop checks for marketing surfaces.

Rule of thumb: building or restyling anything inside the app shell → `frontend-design`. Building the public landing page → `design-taste-frontend`. Neither skill overrides the shadcn decision above.

## Repo Layout

```
sazeh-dev-plan-v2.md           # Authoritative development plan (vision, architecture, phases 0-10, decision log)
sazeh-dev-plan.md              # V1 plan (superseded; kept as technical reference for deep-dive code)
shadcn/                        # Vendored shadcn/ui component docs
download_shadcn_components.py  # Fetches the docs in shadcn/
.opencode/skills/              # opencode skills (git-staged-commit, frontend-design, design-taste-frontend)
apps/backend/                  # (planned) Django project
apps/web/                      # (planned) React + Vite frontend
packages/schema/               # (planned) shared TS types generated from JSON schemas
```

## Conventions

- Read the relevant phase section in `sazeh-dev-plan-v2.md` before starting work; §14 lists settled decisions and all open `[DECISION NEEDED]` blocks — never implement past a pending decision without asking.
- Frontend code is TypeScript strict. Editor state lives in Zustand stores; schema-driven forms are generated from registry JSON Schemas.
- Backend: Python with ruff + mypy + pytest; API under `/api/v1/`; workspace isolation via `WorkspaceScopedMixin` — never accept tenant/workspace IDs from request bodies or URLs.
