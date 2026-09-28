import type { ComponentInstance } from "@sazeh/schema"

import { COMPONENT_MAP } from "./COMPONENT_MAP"

/**
 * Recursive renderer (dev plan v2 Phase 2, tasks 5–6) — the same tree the
 * agent and the editor produce renders here, in the preview now and on the
 * canvas in Phase 4.
 */

export function ComponentRenderer({ node }: { node: ComponentInstance }) {
  const Registered = COMPONENT_MAP[node.component]
  if (Registered === undefined) {
    // Unknown component — validated trees never contain these, but a stale
    // registry must degrade visibly instead of crashing the page.
    return (
      <div
        role="note"
        className="my-4 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground"
      >
        Unknown component “{node.component}” — this registry entry isn’t available.
      </div>
    )
  }
  const children = node.children?.length
    ? node.children.map((child) => <ComponentRenderer key={child.id} node={child} />)
    : undefined
  return <Registered node={node} children={children} />
}

export function PageRenderer({ root }: { root: ComponentInstance }) {
  return <ComponentRenderer node={root} />
}
