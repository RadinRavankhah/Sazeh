import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import type { SiteResource } from "@sazeh/schema"

import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const createSchema = z.object({
  name: z.string().min(2, "Use at least 2 characters.").max(80, "Keep it under 80 characters."),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and dashes."),
})

type CreateValues = z.infer<typeof createSchema>

export function CreateSiteDialog({
  open,
  onOpenChange,
  onCreate,
  busy,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (input: { name: string; slug: string }) => Promise<unknown>
  busy: boolean
}) {
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", slug: "" },
  })

  const nameValue = form.watch("name")

  const onNameChange = (next: string) => {
    if (!form.getFieldState("slug").isDirty) {
      form.setValue("slug", slugify(next), { shouldValidate: false })
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await onCreate(values)
      form.reset()
      onOpenChange(false)
    } catch {
      setFormError("Could not create the site. Try again.")
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a site</DialogTitle>
          <DialogDescription>
            Name it now — you can build it with the agent or by hand.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={form.formState.errors.name ? true : undefined}>
              <FieldLabel htmlFor="site-name">Site name</FieldLabel>
              <Input
                id="site-name"
                placeholder="Acme Studio"
                autoComplete="off"
                aria-invalid={form.formState.errors.name ? true : undefined}
                {...form.register("name", { onChange: (e) => onNameChange(e.target.value) })}
              />
              {form.formState.errors.name && (
                <FieldError>{form.formState.errors.name.message}</FieldError>
              )}
            </Field>
            <Field data-invalid={form.formState.errors.slug ? true : undefined}>
              <FieldLabel htmlFor="site-slug">URL slug</FieldLabel>
              <Input
                id="site-slug"
                autoComplete="off"
                aria-invalid={form.formState.errors.slug ? true : undefined}
                {...form.register("slug")}
              />
              {form.formState.errors.slug ? (
                <FieldError>{form.formState.errors.slug.message}</FieldError>
              ) : (
                <p className="font-mono text-xs text-muted-foreground">
                  {slugify(nameValue) || "…"} — editable
                </p>
              )}
            </Field>
            {formError !== null && (
              <p className="text-sm text-destructive" role="alert">{formError}</p>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner data-icon="inline-start" />}
              Create site
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function RenameSiteDialog({
  site,
  onOpenChange,
  onRename,
  busy,
}: {
  site: SiteResource | null
  onOpenChange: (open: boolean) => void
  onRename: (id: string, name: string) => Promise<unknown>
  busy: boolean
}) {
  const open = site !== null
  const [name, setName] = useState(site?.name ?? "")
  const [key, setKey] = useState("")

  // Sync the field when a different site opens.
  if (site !== null && key !== site.id) {
    setKey(site.id)
    setName(site.name)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename site</DialogTitle>
          <DialogDescription>The URL slug stays the same.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (site === null) return
            const trimmed = name.trim()
            if (trimmed.length < 2 || trimmed.length > 80) return
            void onRename(site.id, trimmed)
          }}
          noValidate
        >
          <Field>
            <FieldLabel htmlFor="rename-site">Site name</FieldLabel>
            <Input
              id="rename-site"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || name.trim().length < 2}>
              Save name
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteSiteDialog({
  site,
  onOpenChange,
  onDelete,
  busy,
}: {
  site: SiteResource | null
  onOpenChange: (open: boolean) => void
  onDelete: (id: string) => Promise<unknown>
  busy: boolean
}) {
  const open = site !== null
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{site?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The site and all of its pages are permanently deleted. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={() => {
              if (site !== null) void onDelete(site.id)
            }}
          >
            Delete site
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
