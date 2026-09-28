import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { EyeIcon, InfoIcon, SparklesIcon, WandSparklesIcon } from "lucide-react"

import { CATALOG, type SiteResource, type TreePatchOp } from "@sazeh/schema"

import { api } from "@/lib/api"
import { getPageTree, patchTree } from "@/lib/sites"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"

const EXAMPLE_SECTIONS = [
  "NavBar",
  "HeroSection",
  "FeatureGrid",
  "PricingTable",
  "FAQAccordion",
  "CtaBanner",
  "Footer",
] as const

function useSite(siteId: string | undefined) {
  const [site, setSite] = useState<SiteResource | null>(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (siteId === undefined) return
    api<SiteResource>(`/api/v1/sites/${siteId}/`)
      .then((s) => {
        if (!cancelled) setSite(s)
      })
      .catch(() => {
        if (!cancelled) setMissing(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [siteId])

  return { site, loading, missing }
}

/**
 * Onboarding stub for the chat-first flow (D0.1). The agent orchestrator
 * lands in Phase 5 — this screen is honest about that instead of faking it.
 */
export function GeneratePage() {
  const { siteId } = useParams<{ siteId: string }>()
  const { site, loading, missing } = useSite(siteId)
  const [description, setDescription] = useState("")
  const [seeding, setSeeding] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    document.title = site ? `${site.name} — build` : "Sazeh"
  }, [site])

  async function seedExample() {
    if (siteId === undefined) return
    setSeeding(true)
    try {
      const pages = await api<{ results: { id: string; slug: string }[] }>(
        `/api/v1/sites/${siteId}/pages/`,
      )
      const home = pages.results.find((p) => p.slug === "home") ?? pages.results[0]
      if (home === undefined) throw new Error("no home page")
      const envelope = await getPageTree(siteId, home.id)
      const root = envelope.tree as { id: string } | null
      if (root === null) throw new Error("no tree")

      const operations: TreePatchOp[] = EXAMPLE_SECTIONS.map((name) => {
        const entry = CATALOG.find((c) => c.name === name)
        return {
          op: "insert",
          parent_id: root.id,
          component: name,
          props: (entry?.example_payload ?? {}) as Record<string, unknown>,
        }
      })
      await patchTree(siteId, home.id, operations)
      toast.success("Example page added — open the preview to see it.")
      void navigate(`/sites/${siteId}/preview`)
    } catch {
      toast.error("Could not add the example page. Try again.")
    } finally {
      setSeeding(false)
    }
  }

  if (loading || (site === null && !missing)) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  }

  if (missing || site === null) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-muted-foreground">This site doesn’t exist or you don’t have access.</p>
        <Button variant="outline" render={<Link to="/" />}>
          Back to dashboard
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <SparklesIcon className="size-4" />
          {site.name}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Describe the site you want
        </h1>
        <p className="text-sm text-muted-foreground">
          The agent will build it section by section, and you can refine it in
          the chat as you go.
        </p>
      </header>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="site-description">Your description</FieldLabel>
          <textarea
            id="site-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="A landing page for a pottery studio: hero with workshop photo, class schedule and pricing, a short about section, and a contact CTA."
            className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </Field>
      </FieldGroup>

      <div className="flex items-start gap-3 rounded-xl border border-dashed px-4 py-3">
        <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="text-sm">
          <p className="font-medium">The AI agent isn’t wired up yet</p>
          <p className="text-muted-foreground">
            It arrives in the next milestone. Your description is kept in this
            form only. Meanwhile you can style the site’s theme or preview a
            fully composed example page.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={seeding}
          onClick={() => void seedExample()}
        >
          <EyeIcon data-icon="inline-start" />
          {seeding ? "Composing…" : "Preview an example page"}
        </Button>
        <Button variant="outline" render={<Link to={`/sites/${siteId}/settings`} />}>
          <WandSparklesIcon data-icon="inline-start" />
          Theme settings
        </Button>
        <Button variant="ghost" render={<Link to="/" />}>
          Back to sites
        </Button>
      </div>
    </div>
  )
}
