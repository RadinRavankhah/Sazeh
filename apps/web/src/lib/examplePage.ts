import { toast } from "sonner"

import { CATALOG, type TreePatchOp } from "@sazeh/schema"

import { getPageTree, listPages, patchTree } from "./sites"

const EXAMPLE_SECTIONS = [
  "NavBar",
  "HeroSection",
  "FeatureGrid",
  "PricingTable",
  "FAQAccordion",
  "CtaBanner",
  "Footer",
] as const

/**
 * Seeds the Home page with example sections (built from the registry's
 * example payloads) through the real tree/patch API. A data-level demo
 * affordance for sites without a configured LLM — the preview stays
 * read-only.
 */
export async function seedExamplePage(siteId: string): Promise<void> {
  const pages = await listPages(siteId)
  const home = pages.find((p) => p.slug === "home") ?? pages[0]
  if (home === undefined) throw new Error("No pages in this site.")
  const envelope = await getPageTree(siteId, home.id)
  const root = envelope.tree as { id: string } | null
  if (root === null) throw new Error("Page has no tree.")

  const operations: TreePatchOp[] = EXAMPLE_SECTIONS.map((name) => ({
    op: "insert",
    parent_id: root.id,
    component: name,
    props: (CATALOG.find((c) => c.name === name)?.example_payload ??
      {}) as Record<string, unknown>,
  }))
  await patchTree(siteId, home.id, operations)
  toast.success("Example page added — open the preview to see it.")
}
