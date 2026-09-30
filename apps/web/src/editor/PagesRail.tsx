import { useState } from "react"
import { useNavigate, useParams } from "react-router"
import { FilePlus2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { createPage, deletePage, slugify } from "@/lib/editor"
import type { PageResource } from "@/lib/sites"
import { cn } from "@/lib/utils"

/**
 * Pages rail (Phase 4 task 7): switch pages, add, delete. Rename and SEO
 * fields live in the inspector's page settings.
 */

function AddPageDialog({ onCreated }: { onCreated: (page: PageResource) => void }) {
  const navigate = useNavigate()
  const { siteId } = useParams<{ siteId: string }>()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [busy, setBusy] = useState(false)

  async function onCreate() {
    if (siteId === undefined || title.trim() === "" || slug.trim() === "") return
    setBusy(true)
    try {
      const page = await createPage(siteId, { title: title.trim(), slug: slug.trim() })
      setOpen(false)
      onCreated(page)
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
        setOpen(next)
        if (next) {
          setTitle("")
          setSlug("")
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="w-full justify-start">
            <FilePlus2Icon data-icon="inline-start" />
            New page
          </Button>
        }
      />
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
          <Button variant="ghost" onClick={() => setOpen(false)}>
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
  isLast,
  onDeleted,
}: {
  page: PageResource
  isLast: boolean
  onDeleted: () => void
}) {
  const navigate = useNavigate()
  const { siteId } = useParams<{ siteId: string }>()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onDelete() {
    if (siteId === undefined) return
    setBusy(true)
    try {
      await deletePage(siteId, page.id)
      setOpen(false)
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
    <AlertDialog open={open} onOpenChange={setOpen}>
      {isLast ? (
        // A site keeps at least one page — deletion is blocked, not confirmed.
        <span
          className="inline-flex size-6 cursor-not-allowed items-center justify-center rounded-md text-muted-foreground/40"
          title="A site needs at least one page"
        >
          <Trash2Icon className="size-3" />
        </span>
      ) : (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Delete page ${page.title}`}
          className="opacity-0 transition-opacity group-hover/page-row:opacity-100"
          onClick={() => setOpen(true)}
        >
          <Trash2Icon className="text-destructive" />
        </Button>
      )}
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
    </AlertDialog>
  )
}

export function PagesRail({
  pages,
  onPagesChanged,
}: {
  pages: PageResource[]
  onPagesChanged: () => void
}) {
  const { pageId, siteId } = useParams<{ siteId: string; pageId: string }>()
  const navigate = useNavigate()

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r" aria-label="Pages">
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-0.5">
          {pages.map((page) => {
            const active = pageId === page.id
            return (
              <div
                key={page.id}
                className={cn(
                  "group/page-row flex items-center gap-1 rounded-lg px-1",
                  active ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (siteId !== undefined) navigate(`/sites/${siteId}/edit/${page.id}`)
                  }}
                  className="min-w-0 flex-1 cursor-pointer rounded-md py-1.5 pl-2 text-left outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <span className="block truncate text-sm">{page.title}</span>
                  <span className="block truncate font-mono text-[0.7rem] text-muted-foreground">
                    /{page.slug}
                  </span>
                </button>
                <DeletePageDialog
                  page={page}
                  isLast={pages.length === 1}
                  onDeleted={onPagesChanged}
                />
              </div>
            )
          })}
        </div>
      </div>
      <div className="border-t p-2">
        <AddPageDialog onCreated={onPagesChanged} />
      </div>
    </aside>
  )
}
