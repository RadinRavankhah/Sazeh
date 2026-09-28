# @sazeh/schema

Shared TypeScript types for the Sazeh SPA, generated from the backend
component registry (`apps/backend/apps/registry/components/*.json` — the
single source of truth, decision D2.1).

## Usage

```bash
npm install        # once (typescript only)
npm run generate   # regenerate src/generated/ from the backend catalog
npm run check      # typecheck
```

`src/generated/` is committed so the SPA can consume it without touching the
backend. Re-run `generate` after editing any component JSON.

## Exports

- `CATALOG` — full registry bundle (schemas, default props, example payloads)
- `ComponentName`, `ComponentInstance`, `RegistryEntry`, `TreePatchOp` — tree + patch types (mirror backend `apps/sites/tree.py`)
- `SiteTheme` — theme tokens (mirror backend `apps/sites/theme.py`, decision D2.2)
- Per-component props interfaces, e.g. `HeroSectionProps`, `FeatureGridProps`
