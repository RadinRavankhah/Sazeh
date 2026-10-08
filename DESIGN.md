# Sazeh — Design System

Implemented in `apps/web/src/index.css` (Tailwind v4 `@theme` + CSS variables
consumed by shadcn/ui, base-nova style). Deep detail: `apps/web/DESIGN_TOKENS.md`
(color/type/radius/motion/density spec) — that sheet is authoritative for tokens;
this file records how product surfaces apply them.

## Direction — "precise tool"

A calm, serious instrument for non-technical founders. Cool-graphite neutrals,
one cobalt accent (`--primary`), Geist Variable for UI + Geist Mono for data
(slugs, timestamps, credit counts). `--radius: 0.75rem`. Light default + full
dark mode via `.dark` (next-themes, init from `prefers-color-scheme`).
MOTION 3: 150–250ms ease-out on hover/focus/state only; no entrance
choreography. No pure black/white anywhere.

## Layout laws

- **Dashboard shell**: 64px single-line nav (wordmark + user menu), content
  `max-w-[1400px]`, `px-6 py-12` page gutters.
- **Editor shell (3-zone)**: one collapsible left `Sidebar` (Pages, Layers,
  Add block) → canvas hero → one right dock with **Selection | Chat tabs**.
  At most 3 columns; canvas gets ≥55% at 1280px. 48px header inside the
  editor: breadcrumb, save state, undo/redo, breakpoint, draft badge,
  preview.
- **Blocks palette** lives in a Command popover, never a permanent column.
- **Auth shell**: quiet form left, one bold editor-showcase panel right.

## shadcn usage rules

- Base-nova components via CLI; styled through tokens — never ship default
  state unthemed.
- **React 18 convention**: every `ui/` wrapper that delegates to a Base UI
  primitive (or native element) and can receive a ref from forms must use
  `React.forwardRef` with explicit ref pass-through. The CLI overwrites this
  on `shadcn add` — re-apply after every registry update.
- Icons: `lucide-react`, `size-4` default, `data-icon="inline-start"` on
  labeled buttons.

## Copy rules

Sentence case. Buttons name their action ("Save page details", "Delete
page"). Errors name the problem and the recovery, no codes, no apology.
Composites are **Sections**, primitives are **Blocks**, agent conversations
are **Chats**. A slug is a "web address".
