import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import {
  ChevronRightIcon,
  FilePlus2Icon,
  FileTextIcon,
  LayersIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { CATALOG, type ComponentInstance } from "@sazeh/schema"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { createPage, deletePage, slugify } from "@/lib/editor"
import type { PageResource } from "@/lib/sites"
import { cn } from "@/lib/utils"
import { useEditorStore } from "@/stores/editor"

/**
 * Editor sidebar (3-zone shell): pages + layers + the add-block entry
 * point. Collapses to an icon rail (Ctrl+B) so the canvas keeps the space.
 */

function displayName(component: string): string {
  return CATALOG.find((entry) => entry.name === component)?.display_name ?? component
}

// --- page dialogs -----------------------------------------------------------

function AddPageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const { siteId } = useParams<{ siteId: string }>()
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [busy, setBusy] = useState(false)

  async function onCreate() {
    if (siteId === undefined || title.trim() === "" || slug.trim() === "") return
    setBusy(true)
    try {
      const page = await createPage(siteId, { title: title.trim(), slug: slug.trim() })
      onOpenChange(false)
      navigate(`/sites/${siteId}/edit/${page.id}`)
    } catch (error) {
      toast.error(
        error instanceof Error && /slug/i.test(error.message)
          ? "That page address is already used on this site."
          : "Couldn't create the page — try again.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next) {
          setTitle("")
          setSlug("")
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New page</DialogTitle>
          <DialogDescription>
            Pages live in this site's side menu — for example Home, About, Pricing.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="new-page-title">Title</FieldLabel>
          <Input
            id="new-page-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setSlug(slugify(e.target.value))
            }}
            placeholder="About"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-page-slug">Web address (slug)</FieldLabel>
          <Input id="new-page-slug" className="font-mono" value={slug} onChange={(e) => setSlug(e.target.value)} />
          <FieldDescription>Lowercase letters, numbers, and dashes.</FieldDescription>
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void onCreate()} disabled={busy || title.trim() === "" || slug.trim() === ""}>
            Create page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeletePageDialog({
  page,
  onDeleted,
  onClosed,
}: {
  page: PageResource | null
  onDeleted: () => void
  onClosed: () => void
}) {
  const navigate = useNavigate()
  const { siteId } = useParams<{ siteId: string }>()
  const [busy, setBusy] = useState(false)

  async function onDelete() {
    if (siteId === undefined || page === null) return
    setBusy(true)
    try {
      await deletePage(siteId, page.id)
      onClosed()
      onDeleted()
      toast.success("Page deleted.")
      navigate(`/sites/${siteId}/edit`, { replace: true })
    } catch {
      toast.error("Couldn't delete the page — try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={page !== null} onOpenChange={(next) => { if (!next) onClosed() }}>
      {page !== null && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{page.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the page and everything on it. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep page</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onDelete()} disabled={busy}>
              Delete page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}

// --- layers ------------------------------------------------------------------

function LayerRow({ node, depth }: { node: ComponentInstance; depth: number }) {
  const selectedId = useEditorStore((s) => s.selectedId)
  const select = useEditorStore((s) => s.select)
  const selected = selectedId === node.id

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="sm"
          isActive={selected}
          onClick={() => select(node.id)}
          tooltip={displayName(node.component)}
          style={{ paddingLeft: 8 + depth * 14 }}
          className="group-data-[collapsible=icon]:pl-2!"
        >
          <ChevronRightIcon
            className={cn("size-3 shrink-0 text-muted-foreground", node.children.length > 0 && "rotate-90")}
          />
          <span>{displayName(node.component)}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {node.children.map((child) => (
        <LayerRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  )
}

// --- sidebar -----------------------------------------------------------------

export function EditorSidebar({
  pages,
  onPagesChanged,
  onAddBlock,
}: {
  pages: PageResource[]
  onPagesChanged: () => void
  onAddBlock: () => void
}) {
  const { pageId, siteId } = useParams<{ siteId: string; pageId: string }>()
  const tree = useEditorStore((s) => s.tree)
  const [addPageOpen, setAddPageOpen] = useState(false)
  const [deletingPage, setDeletingPage] = useState<PageResource | null>(null)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              variant="outline"
              tooltip="Add a block (Ctrl+K)"
              onClick={onAddBlock}
            >
              <PlusIcon />
              <span>Add block</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Pages</SidebarGroupLabel>
          <SidebarGroupAction
            title="New page"
            onClick={() => setAddPageOpen(true)}
            aria-label="New page"
          >
            <FilePlus2Icon />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {pages.map((page) => {
                const active = pageId === page.id
                return (
                  <SidebarMenuItem key={page.id} className="group/page-item">
                    <SidebarMenuButton
                      isActive={active}
                      render={siteId !== undefined ? <Link to={`/sites/${siteId}/edit/${page.id}`} /> : undefined}
                      tooltip={page.title}
                    >
                      <FileTextIcon />
                      <span>{page.title}</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      showOnHover
                      disabled={pages.length === 1}
                      aria-label={`Delete page ${page.title}`}
                      title={pages.length === 1 ? "A site needs at least one page" : undefined}
                      onClick={() => setDeletingPage(page)}
                    >
                      <Trash2Icon className="text-destructive" />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>
            <LayersIcon />
            Layers
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {tree !== null && <LayerRow node={tree} depth={0} />}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <AddPageDialog open={addPageOpen} onOpenChange={setAddPageOpen} />
      <DeletePageDialog
        page={deletingPage}
        onDeleted={onPagesChanged}
        onClosed={() => setDeletingPage(null)}
      />
    </Sidebar>
  )
}
