import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import {
  CircleAlertIcon,
  EyeIcon,
  LayoutTemplateIcon,
  MoreHorizontalIcon,
  MousePointerClickIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import type { SiteResource } from "@sazeh/schema"

import { useSiteMutations, useSites } from "@/lib/sites"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { CreateSiteDialog, DeleteSiteDialog, RenameSiteDialog } from "@/components/site-dialogs"

function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  const units: [number, string][] = [
    [60, "just now"],
    [3600, "minutes"],
    [86400, "hours"],
    [86400 * 30, "days"],
    [86400 * 365, "months"],
  ]
  if (seconds < 60) return units[0]![1]
  for (let i = 1; i < units.length; i++) {
    if (seconds < units[i]![0]) {
      const n = Math.floor(seconds / units[i - 1]![0])
      return `${n} ${units[i]![1]} ago`
    }
  }
  return `${Math.floor(seconds / (86400 * 365))} years ago`
}

function SiteCard({ site }: { site: SiteResource }) {
  const navigate = useNavigate()
  const { rename, remove, busy } = useSiteMutations()
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  return (
    <Card className="group relative overflow-hidden py-0 transition-all hover:shadow-md hover:ring-ring/40 focus-within:ring-ring/40">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => navigate(`/sites/${site.id}/edit`)}
          className="block w-full cursor-pointer rounded-[inherit] text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={`Open ${site.name} in the visual editor`}
        >
          {/* Monogram tile — the card's face */}
          <div className="relative grid h-28 place-items-center border-b bg-accent/50">
            <span
              aria-hidden
              className="font-heading text-5xl font-semibold tracking-tight text-foreground/15 select-none"
            >
              {site.name.charAt(0).toUpperCase() || "S"}
            </span>
            <Badge
              variant={site.status === "published" ? "default" : "secondary"}
              className="absolute top-3 right-3"
            >
              {site.status === "published" ? "Published" : "Draft"}
            </Badge>
            <span className="absolute bottom-2 left-3 font-mono text-[0.7rem] text-muted-foreground">
              /{site.slug}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 p-4 pr-12">
            <div className="min-w-0">
              <h3 className="truncate font-medium tracking-tight">{site.name}</h3>
              <p className="text-xs text-muted-foreground">Updated {relativeTime(site.updated_at)}</p>
            </div>
          </div>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Site options for ${site.name}`}
                className="absolute right-2 bottom-2.5"
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => navigate(`/sites/${site.id}/generate`)}>
              <SparklesIcon /> Build with agent
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/sites/${site.id}/edit`)}>
              <MousePointerClickIcon /> Edit in visual editor
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/sites/${site.id}/preview`)}>
              <EyeIcon /> Preview
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/sites/${site.id}/settings`)}>
              <SettingsIcon /> Theme settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setRenaming(true)}>
              <PencilIcon /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
              <Trash2Icon /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>

      <RenameSiteDialog
        site={renaming ? site : null}
        onOpenChange={(open) => setRenaming(open)}
        onRename={async (id, name) => {
          await rename(id, name)
          setRenaming(false)
        }}
        busy={busy}
      />
      <DeleteSiteDialog
        site={deleting ? site : null}
        onOpenChange={(open) => setDeleting(open)}
        onDelete={async (id) => {
          await remove(id)
        }}
        busy={busy}
      />
    </Card>
  )
}

export function DashboardPage() {
  const { sites, loading, error, refresh } = useSites()
  const { create, busy } = useSiteMutations()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    document.title = "Sazeh"
  }, [])

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Sites</h1>
          <p className="text-sm text-muted-foreground">
            Every site starts empty. Build it with the agent or drag and drop later.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon data-icon="inline-start" />
          New site
        </Button>
      </header>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : error !== null ? (
        <Empty className="border" data-testid="sites-error">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleAlertIcon />
            </EmptyMedia>
            <EmptyTitle>Couldn't load your sites</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => void refresh()}>
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      ) : sites.length === 0 ? (
        <Empty className="border py-16" data-testid="sites-empty">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayoutTemplateIcon />
            </EmptyMedia>
            <EmptyTitle>No sites yet</EmptyTitle>
            <EmptyDescription>
              Create your first site, then describe what you want — the agent
              builds it with you.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => setCreating(true)}>
              <PlusIcon data-icon="inline-start" />
              Create your first site
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <SiteCard key={site.id} site={site} />
          ))}
        </div>
      )}

      <CreateSiteDialog
        open={creating}
        onOpenChange={setCreating}
        busy={busy}
        onCreate={async (input) => {
          const site = await create(input)
          if (site && typeof site === "object" && "id" in site) {
            navigate(`/sites/${(site as { id: string }).id}/generate`)
          } else {
            void refresh()
          }
        }}
      />
    </div>
  )
}
