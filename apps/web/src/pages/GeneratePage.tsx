import { useEffect, useState } from "react"
import { Link, useParams } from "react-router"
import { ArrowLeftIcon, EyeIcon, MousePointerClickIcon } from "lucide-react"

import { api } from "@/lib/api"
import type { PageResource, SiteResource } from "@/lib/sites"
import { useChatStore } from "@/stores/chat"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Composer,
} from "@/components/chat/Composer"
import { EmptyState } from "@/components/chat/EmptyState"
import { MessageList } from "@/components/chat/MessageList"
import { SessionSidebar } from "@/components/chat/SessionSidebar"

/**
 * Full-screen agent chat (D0.1 onboarding surface — the editor's docked
 * panel reuses the same primitives). After creating a site, users land here.
 */
export function GeneratePage() {
  const { siteId } = useParams<{ siteId: string }>()
  const [site, setSite] = useState<SiteResource | null>(null)
  const [missing, setMissing] = useState(false)
  const { activeSessionId, messages, focusedPageId, pages, setPages, loadSessions, switchPage } =
    useChatStore()

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
    return () => {
      cancelled = true
    }
  }, [siteId])

  useEffect(() => {
    if (siteId === undefined) return
    void loadSessions(siteId)
    api<{ count: number; results: PageResource[] }>(`/api/v1/sites/${siteId}/pages/`)
      .then((page) => setPages(page.results.map((p) => ({ id: p.id, title: p.title }))))
      .catch(() => setPages([]))
  }, [siteId, loadSessions, setPages])

  useEffect(() => {
    document.title = site ? `${site.name} — chat` : "Sazeh"
  }, [site])

  if (missing || (site === null && missing)) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-muted-foreground">This site doesn’t exist or you don’t have access.</p>
        <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
          Back to dashboard
        </Button>
      </div>
    )
  }

  if (site === null) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl gap-8">
      <SessionSidebar siteId={siteId!} />
      <div className="flex min-h-[70dvh] flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b pb-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link to="/" />}>
              <ArrowLeftIcon />
            </Button>
            <Select value={focusedPageId} onValueChange={(v) => void switchPage(v as string)}>
              <SelectTrigger className="w-52" aria-label="Focused page">
                <SelectValue placeholder="Pick a page to focus" />
              </SelectTrigger>
              <SelectContent>
                {pages.map((page) => (
                  <SelectItem key={page.id} value={page.id}>
                    {page.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link to={`/sites/${siteId}/edit`} />}>
              <MousePointerClickIcon data-icon="inline-start" />
              Open in editor
            </Button>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link to={`/sites/${siteId}/preview`} />}>
              <EyeIcon data-icon="inline-start" />
              Preview
            </Button>
          </div>
        </header>

        {activeSessionId === null || messages.length === 0 ? (
          <EmptyState siteId={siteId!} />
        ) : (
          <MessageList />
        )}

        <Composer siteId={siteId!} />
      </div>
    </div>
  )
}
