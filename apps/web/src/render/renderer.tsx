import { cloneElement, type ReactElement, type ReactNode } from "react"

import type { ComponentInstance } from "@sazeh/schema"

import { COMPONENT_MAP } from "./COMPONENT_MAP"

/**
 * Recursive renderer (dev plan v2 Phase 2, tasks 5–6) — the same tree the
 * agent and the editor produce renders here, in the preview now and on the
 * canvas in Phase 4.
 *
 * `decorateChildren` is the Phase 4 editor hook: when provided, each direct
 * child element is handed to it (the canvas wraps sections in selection
 * chrome). The preview/agent paths never pass it, so they render unchanged.
 */

export type ChildDecorator = (
  element: ReactElement,
  childNode: ComponentInstance,
) => ReactElement

export function ComponentRenderer({
  node,
  decorateChildren,
}: {
  node: ComponentInstance
  decorateChildren?: ChildDecorator
}) {
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
  let children: ReactNode = undefined
  if (node.children?.length) {
    children = node.children.map((child) => {
      const element = (
        <ComponentRenderer node={child} decorateChildren={decorateChildren} />
      )
      if (!decorateChildren) return element
      // The decorator's wrapper joins the mapped array — it carries the key.
      return cloneElement(decorateChildren(element, child), { key: child.id })
    })
  }
  return <Registered node={node} children={children} />
}

export function PageRenderer({
  root,
  decorateChildren,
}: {
  root: ComponentInstance
  decorateChildren?: ChildDecorator
}) {
  return <ComponentRenderer node={root} decorateChildren={decorateChildren} />
}
