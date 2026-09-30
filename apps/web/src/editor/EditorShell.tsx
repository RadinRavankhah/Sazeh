import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  ArrowLeftIcon,
  MessageSquareIcon,
  MonitorIcon,
  Redo2Icon,
  SmartphoneIcon,
  Undo2Icon,
} from "lucide-react"
import { toast } from "sonner"

import type { ComponentInstance, RegistryEntry } from "@sazeh/schema"
import { CATALOG } from "@sazeh/schema"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { updatePage } from "@/lib/editor"
import { getPageTree, listPages, type PageResource, type SiteResource } from "@/lib/sites"
import { Canvas } from "@/editor/Canvas"
import { ChatDock } from "@/editor/ChatDock"
import { Inspector } from "@/editor/Inspector"
import { Palette } from "@/editor/Palette"
import { PagesRail } from "@/editor/PagesRail"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"
import {
  canRedo,
  canUndo,
  findTreeNode,
  locateNode,
  redoEdit,
  undoEdit,
  useEditorStore,
} from "@/stores/editor"

type DragData =
  | { type: "palette"; entry: RegistryEntry }
  | { type: "section"; nodeId: string }

const SAVE_LABEL: Record<string, string> = {
  saved: "All changes saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  error: "Save failed",
}

export function EditorShell() {
  const { siteId, pageId } = useParams<{ siteId: string; pageId: string }>()
  const navigate = useNavigate()

  const [site, setSite] = useState<SiteResource | null>(null)
  const [pages, setPages] = useState<PageResource[]>([])
  const [page, setPage] = useState<PageResource | null>(null)
  const [missing, setMissing] = useState(false)

  const tree = useEditorStore((s) => s.tree)
  const selectedId = useEditorStore((s) => s.selectedId)
  const breakpoint = useEditorStore((s) => s.breakpoint)
  const setBreakpoint = useEditorStore((s) => s.setBreakpoint)
  const saveState = useEditorStore((s) => s.saveState)
  const bootstrap = useEditorStore((s) => s.bootstrap)
  const markSaving = useEditorStore((s) => s.markSaving)
  const markSaved = useEditorStore((s) => s.markSaved)
  const markError = useEditorStore((s) => s.markError)

  const [dragLabel, setDragLabel] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)

  const mutationTick = useChatStore((s) => s.mutationTick)
  const agentStreaming = useChatStore((s) => s.streaming)
  const replaceTree = useEditorStore((s) => s.replaceTree)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const reloadPages = useCallback(async () => {
    if (siteId === undefined) return
    try {
      setPages(await listPages(siteId))
    } catch {
      /* the page itself keeps the error state; the rail just stays stale */
    }
  }, [siteId])

  // Load site + pages + the focused page's tree.
  useEffect(() => {
    if (siteId === undefined) return
    let cancelled = false
    setMissing(false)
    async function load() {
      try {
        const site = await api<SiteResource>(`/api/v1/sites/${siteId}/`)
        const pageList = await listPages(siteId!)
        const target =
          (pageId !== undefined ? pageList.find((p) => p.id === pageId) : undefined) ??
          pageList.find((p) => p.slug === "home") ??
          pageList[0]
        if (cancelled) return
        setSite(site)
        setPages(pageList)
        if (target === undefined) {
          setMissing(true)
          return
        }
        setPage(target)
        const envelope = await getPageTree(siteId!, target.id)
        if (cancelled) return
        const loadedTree = (envelope.tree as ComponentInstance | null) ?? {
          id: crypto.randomUUID(),
          component: "Section",
          props: {},
          children: [],
        }
        bootstrap(loadedTree)
        useEditorStore.temporal.getState().clear()
      } catch {
        if (!cancelled) setMissing(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [siteId, pageId, bootstrap])

  // Redirect when the rail points at a page that no longer exists.
  useEffect(() => {
    if (missing && siteId !== undefined) navigate(`/sites/${siteId}/edit`, { replace: true })
  }, [missing, siteId, navigate])

  useEffect(() => {
    document.title = site !== null && page !== null ? `${page.title} — ${site.name}` : "Sazeh"
  }, [site, page])

  // Debounced autosave: the editor PATCHes the whole tree (validated
  // server-side); zundo snapshots make undo/redo just another tree change.
  useEffect(() => {
    if (saveState !== "dirty" || tree === null || siteId === undefined || page === null) return
    const timer = setTimeout(() => {
      markSaving()
      updatePage(siteId, page.id, { tree })
        .then(() => markSaved())
        .catch(() => {
          markError()
          toast.error("Changes couldn't be saved — check your connection and try again.")
        })
    }, 800)
    return () => clearTimeout(timer)
  }, [tree, saveState, siteId, page, markSaving, markSaved, markError])

  // Agent mutations stream in → pull the changed tree into the editor store.
  // zundo snapshots every tree set, so agent edits are ordinary undo steps.
  useEffect(() => {
    if (mutationTick === 0) return
    const timer = setTimeout(() => {
      const { tree: current, saveState } = useEditorStore.getState()
      const currentPageId = page?.id
      if (
        current === null ||
        currentPageId === undefined ||
        saveState === "dirty" // local work in flight — next tick will retry
      ) {
        return
      }
      void getPageTree(siteId!, currentPageId)
        .then((envelope) => {
          const fresh = envelope.tree as ComponentInstance | null
          if (fresh !== null) replaceTree(fresh)
        })
        .catch(() => {
          /* transient; the next tick or run_completed retries */
        })
      void reloadPages()
    }, 250)
    return () => clearTimeout(timer)
    // page?.id intentionally read fresh via getState-like closure (page prop)
  }, [mutationTick, siteId, page?.id, replaceTree, reloadPages])

  // Keyboard: undo/redo outside of form fields.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "z") return
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      event.preventDefault()
      if (event.shiftKey) {
        redoEdit()
      } else {
        undoEdit()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current as DragData | undefined
    if (data === undefined) return
    if (data.type === "palette") {
      setDragLabel(data.entry.display_name)
      return
    }
    const node = tree !== null ? findTreeNode(tree, data.nodeId) : null
    const name = node !== null
      ? (CATALOG_NAME(node.component) ?? "Section")
      : "Section"
    setDragLabel(name)
  }

  function onDragEnd(event: DragEndEvent) {
    setDragLabel(null)
    const { active, over } = event
    if (!over || tree === null) return
    const activeData = active.data.current as DragData | undefined
    const overData = over.data.current as { index?: number } | undefined
    if (activeData === undefined || overData?.index === undefined) return

    const targetIndex = overData.index
    if (activeData.type === "palette") {
      useEditorStore.getState().insertComponent(tree.id, targetIndex, activeData.entry)
      return
    }
    // Section reorder — removing from its old index shifts later slots.
    const located = locateNode(tree, activeData.nodeId)
    if (located === null) return
    if (located.index === targetIndex || located.index + 1 === targetIndex) return
    const effective = targetIndex > located.index ? targetIndex - 1 : targetIndex
    useEditorStore.getState().moveNode(activeData.nodeId, tree.id, effective)
  }

  if (missing || (site !== null && page === null && pages.length === 0)) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <p className="text-muted-foreground">This site doesn’t exist or you don’t have access.</p>
          <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
            Back to dashboard
          </Button>
        </div>
      </div>
    )
  }

  if (site === null || page === null || tree === null) {
    return (
      <div className="flex h-dvh flex-col bg-background">
        <div className="flex h-12 items-center gap-3 border-b px-4">
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="flex min-h-0 flex-1">
          <Skeleton className="w-52 rounded-none" />
          <Skeleton className="w-64 rounded-none" />
          <div className="flex-1 p-6">
            <Skeleton className="h-full w-full" />
          </div>
          <Skeleton className="w-80 rounded-none" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link to="/" />}
            title="Back to dashboard"
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Dashboard
          </Button>
          <span className="truncate text-sm text-muted-foreground">
            {site.name} / {page.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {SAVE_LABEL[saveState]}
          </span>
          <div className="flex items-center rounded-lg border">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              disabled={!canUndo()}
              onClick={() => undoEdit()}
            >
              <Undo2Icon />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
              disabled={!canRedo()}
              onClick={() => redoEdit()}
            >
              <Redo2Icon />
            </Button>
          </div>
          <div className="flex items-center rounded-lg border" role="group" aria-label="Preview width">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Desktop width"
              aria-pressed={breakpoint === "desktop"}
              className={cn(breakpoint === "desktop" && "bg-accent")}
              onClick={() => setBreakpoint("desktop")}
            >
              <MonitorIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Mobile width"
              aria-pressed={breakpoint === "mobile"}
              className={cn(breakpoint === "mobile" && "bg-accent")}
              onClick={() => setBreakpoint("mobile")}
            >
              <SmartphoneIcon />
            </Button>
          </div>
          <Badge variant="secondary" className="hidden lg:inline-flex">
            Draft
          </Badge>
          {agentStreaming && (
            <Badge className="animate-pulse">Agent editing…</Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            aria-pressed={chatOpen}
            onClick={() => setChatOpen((open) => !open)}
            title="Toggle the agent chat panel"
          >
            <MessageSquareIcon data-icon="inline-start" />
            Chat
          </Button>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link to={`/sites/${siteId}/preview`} />}
            title="Open the full-page preview"
          >
            Preview
          </Button>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragLabel(null)}
      >
        <div className="flex min-h-0 flex-1">
          <PagesRail pages={pages} onPagesChanged={() => void reloadPages()} />
          <Palette />
          <Canvas site={site} />
          <Inspector
            site={site}
            page={page}
            onSaved={() => void reloadPages()}
          />
          {chatOpen && (
            <ChatDock
              site={site}
              page={page}
              selection={
                selectedId !== null && tree !== null && selectedId !== tree.id
                  ? { page: page.id, node: selectedId }
                  : null
              }
              selectionNodeLabel={
                selectedId !== null && tree !== null
                  ? (() => {
                      const node = findTreeNode(tree, selectedId)
                      if (node === null || node.id === tree.id) return null
                      return CATALOG_NAME(node.component)
                    })()
                  : null
              }
              onClose={() => setChatOpen(false)}
            />
          )}
        </div>
        <DragOverlay>
          {dragLabel !== null ? (
            <div className="rounded-lg border bg-background px-3 py-1.5 text-sm font-medium shadow-md">
              {dragLabel}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function CATALOG_NAME(component: string): string | null {
  return CATALOG.find((entry) => entry.name === component)?.display_name ?? null
}
