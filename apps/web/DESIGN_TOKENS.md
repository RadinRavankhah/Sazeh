# Sazeh Design Tokens — "Precise Tool"

The single source of truth for Sazeh's product UI (dashboard, editor, chat).
Implemented in `src/index.css` (Tailwind v4 `@theme` + CSS variables consumed
by shadcn/ui). **Never ship shadcn default state** — components read these
tokens. The marketing/landing shell may extend but not contradict this sheet.

**Design read:** hosted site builder for non-technical founders and indie
builders — a calm, serious tool. Light default + full dark mode. Dials:
VARIANCE 5 / MOTION 3 / DENSITY 4.

## Color

One palette, cool-graphite family, one accent. No pure black (`#000`) or
pure white (`#fff`) anywhere; no second accent, no AI-purple.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--background` | `oklch(0.988 0.002 255)` | `oklch(0.165 0.008 255)` | App surface |
| `--foreground` | `oklch(0.21 0.008 255)` | `oklch(0.965 0.004 255)` | Body text (graphite) |
| `--card` | `oklch(1 0 0)` | `oklch(0.205 0.01 255)` | Elevated surfaces |
| `--primary` | `oklch(0.52 0.19 258)` | `oklch(0.66 0.17 258)` | **Cobalt — the accent** |
| `--primary-foreground` | `oklch(0.985 0.005 258)` | `oklch(0.145 0.01 255)` | Text on accent |
| `--muted` / `--muted-foreground` | `0.965` / `0.525` L | `0.25` / `0.7` L | Secondary text/surfaces |
| `--accent` | `oklch(0.955 0.006 255)` | `oklch(0.26 0.012 255)` | Hover/selected surfaces |
| `--destructive` | `oklch(0.577 0.215 27)` | `oklch(0.7 0.19 25)` | Errors only |
| `--border` / `--input` | `oklch(0.912 0.004 255)` | `white / 12%` | Hairlines, input edges |
| `--ring` | cobalt | cobalt (lifted) | Focus rings |

Chart ramp (`--chart-1..5`): cobalt shades, L 0.88→0.27 — reads as one family.

## Typography

| Role | Face | Notes |
|---|---|---|
| Display + body | **Geist Variable** (`--font-sans`) | Self-hosted via `@fontsource-variable/geist`; `tracking-tight` for headlines |
| Data / code / slugs | **Geist Mono** (`--font-mono`) | Slugs, URLs, credit counts, timestamps |

Scale: Tailwind defaults; headlines `text-2xl/3xl tracking-tight font-semibold`
in product surfaces. Body copy max ~70ch. Sentence case everywhere — no
all-caps eyebrows, no letter-spaced labels.

## Radius

`--radius: 0.75rem` (12px). shadcn derives `sm→4xl` from it: cards land at
12px, buttons/inputs at ~9–10px. One radius system across the product; no
pill buttons.

## Motion

Restrained (MOTION 3): 150–250ms `ease-out` transitions on hover/focus/state
changes only. No entrance choreography, no infinite loops, no parallax.
`prefers-reduced-motion` collapses everything to instant.

## Density & layout

Standard product spacing (`py-10`–`py-16` page gutters, `gap-4`–`gap-6`
grids). 64px app nav, single line. Content max-width: `max-w-[1400px]`.
Forms: label above input, error below, `Field`/`FieldGroup` composition.

## Dark mode

`.dark` class on `<html>`, initialized from `prefers-color-scheme` (manual
toggle later). Hierarchy parity with light: if a surface pops in light, its
dark counterpart pops identically. Never invert a single section.
