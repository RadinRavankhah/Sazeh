# Sazeh — Product Context

## What this is

Sazeh is a hosted agentic site builder in the mold of Base44 / Lovable / v0.
Users describe a site in a chat panel and the platform's agent service builds
it. Equally important: users don't have to use AI at all — they can build like
WordPress, dragging and dropping pre-defined components onto a visual page
editor. Both paths write the same validated JSON page tree.

## Audience

Non-technical founders and indie builders (D4.3). They have never heard of
"props" or "JSON schemas". Copy targets plain language: a slug is a "web
address", a component is a "section" or "block", editing is automatic and
reversible. The product must feel calm and serious — a precise tool, not a toy
and not a hype machine.

## Primary jobs per surface

- **Dashboard** — orient ("what do I own, what changed") and act (open a site
  in the mode they want: agent chat, visual editor, preview).
- **Agent chat** (`/sites/:id/generate`) — first-draft onboarding surface.
  Land here after creating a site; describe what to build; watch it happen.
- **Visual editor** (`/sites/:id/edit/:pageId?`) — the precise tool. Pages +
  layers on the left, the page itself center-stage, the selected element or
  the agent chat docked on the right. Autosave, undo/redo everywhere.
- **Theme settings** — brand tokens (accent, typeface, radius, heading scale)
  for the whole site.
- **Preview** — the draft site full-bleed, no editor chrome.

## Success criteria

- Canvas is the visual star of the editor; chrome never competes with it.
- Every destructive action is confirmed; every editing action is undoable.
- The same words mean the same thing everywhere: **Sections** (composites),
  **Blocks** (primitives), **Pages**, **Chats**, **Preview**.
- Non-technical users never need the docs to recover from a mistake.
