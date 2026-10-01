import { useEffect, useState } from "react"
import { Link, useParams } from "react-router"
import { ArrowLeftIcon } from "lucide-react"

import type { ComponentInstance } from "@sazeh/schema"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getPageTree, listPages, type PageResource, type SiteResource } from "@/lib/sites"
import { api, ApiError } from "@/lib/api"
import { PageRenderer } from "@/render/renderer"
import { SiteThemeStyle } from "@/render/SiteThemeStyle"

/** Reads fail with 403 when the session belongs to a different account —
 *  that copy must not claim the site is missing. */
function loadErrorMessage(error: unknown): string {
  return error instanceof ApiError && error.status === 403
    ? "You're logged in with a different account than the one that owns this site."
    : "This site doesn't exist or you don't have access."
}

/**
 * Read-only render harness (Phase 2 tasks 5–6): renders the Home page tree
 * with the site's theme tokens applied. The ancestor of the editor canvas.
 */
export function SitePreviewPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const [site, setSite] = useState<SiteResource | null>(null)
  const [tree, setTree] = useState<ComponentInstance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const site = await api<SiteResource>(`/api/v1/sites/${siteId}/`)
        const pages: PageResource[] = await listPages(siteId!)
        const home = pages.find((p) => p.slug === "home") ?? pages[0]
        if (cancelled) return
        setSite(site)
        if (home) {
          const envelope = await getPageTree(siteId!, home.id)
          if (cancelled) return
          setTree((envelope.tree as ComponentInstance | null) ?? null)
        }
      } catch (error) {
        if (!cancelled) setError(loadErrorMessage(error))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [siteId])

  useEffect(() => {
    document.title = site ? `${site.name} — preview` : "Sazeh"
  }, [site])

  if (loading) {
    return (
      <div className="min-h-dvh bg-background px-6 py-16">
        <div className="mx-auto max-w-6xl space-y-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  if (error !== null || site === null) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
            Back to dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 flex h-12 items-center justify-between border-b bg-background/90 px-4 backdrop-blur">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Dashboard
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{site.name}</span>
          <Badge variant="secondary">Draft preview</Badge>
        </div>
      </header>
      {tree !== null ? (
        <SiteThemeStyle theme={site.config?.theme}>
          <PageRenderer root={tree} />
        </SiteThemeStyle>
      ) : (
        <div className="px-6 py-24 text-center text-muted-foreground">
          This site has no pages yet.
        </div>
      )}
    </div>
  )
}
