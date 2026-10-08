import { useEffect, useMemo, useState } from "react"
import {
  Controller,
  useFieldArray,
  useForm,
  type Control,
  type UseFormRegister,
} from "react-hook-form"
import { Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { CATALOG, type ComponentInstance, type RegistryEntry } from "@sazeh/schema"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { updatePage, type PageSettingsPatch } from "@/lib/editor"
import type { PageResource, SiteResource } from "@/lib/sites"
import { findTreeNode, useEditorStore } from "@/stores/editor"

/**
 * Inspector (Phase 4 tasks 6–7): schema-driven prop forms (D4.1 —
 * inspector-only editing) + page settings with SEO fields. Layers live in
 * the editor sidebar now. Copy targets a non-technical founder (D4.3).
 */

// --- registry schema narrowing ---------------------------------------------

interface PropSchema {
  type?: string
  enum?: string[]
  maxLength?: number
  format?: string
  default?: unknown
  items?: PropSchema & { properties?: Record<string, PropSchema> }
  properties?: Record<string, PropSchema>
  required?: string[]
}

const LABEL_OVERRIDES: Record<string, string> = {
  cta_text: "Button text",
  cta_href: "Button link",
  secondary_cta_text: "Second button text",
  secondary_cta_href: "Second button link",
  image_url: "Image URL",
  image_alt: "Image description",
  src: "Image URL",
  alt: "Image description",
  href: "Link target",
}

function labelFor(key: string): string {
  if (LABEL_OVERRIDES[key] !== undefined) return LABEL_OVERRIDES[key]!
  return key
    .split("_")
    .map((w) => (w === "cta" ? "CTA" : w === "url" ? "URL" : w === "seo" ? "SEO" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
}

// --- prop cleaning (form values → registry-valid props) ----------------------

function cleanItem(
  item: Record<string, unknown>,
  itemSchema?: PropSchema,
): Record<string, unknown> {
  const properties = itemSchema?.properties ?? {}
  const out: Record<string, unknown> = {}
  for (const [key, schema] of Object.entries(properties)) {
    const raw = item?.[key]
    if (schema.type === "array") {
      // Nested arrays (footer columns → links) round-trip as JSON strings.
      if (typeof raw === "string") {
        try {
          out[key] = JSON.parse(raw === "" ? "[]" : raw)
        } catch {
          out[key] = raw
        }
      } else if (raw !== undefined && raw !== null) {
        out[key] = raw
      }
      continue
    }
    if (schema.type === "boolean") {
      out[key] = raw === true
      continue
    }
    if (schema.type === "number" || schema.type === "integer") {
      const n = typeof raw === "number" ? raw : Number(raw)
      if (raw !== "" && raw !== undefined && Number.isFinite(n)) out[key] = n
      continue
    }
    out[key] = typeof raw === "string" ? raw : (raw ?? "")
  }
  return out
}

function cleanProps(
  values: Record<string, unknown>,
  properties: Record<string, PropSchema>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, schema] of Object.entries(properties)) {
    const raw = values[key]
    if (schema.type === "boolean") {
      out[key] = raw === true
      continue
    }
    if (schema.type === "number" || schema.type === "integer") {
      const n = typeof raw === "number" ? raw : Number(raw)
      if (raw !== "" && raw !== undefined && Number.isFinite(n)) out[key] = n
      continue
    }
    if (schema.type === "array") {
      const items = Array.isArray(raw) ? raw : []
      out[key] = items.map((item) => cleanItem(item as Record<string, unknown>, schema.items))
      continue
    }
    // Strings and enums. An unset enum is omitted (empty string isn't a
    // member of any enum); empty strings are valid values for string props.
    if (schema.enum !== undefined) {
      if (typeof raw === "string" && raw !== "") out[key] = raw
      continue
    }
    out[key] = typeof raw === "string" ? raw : (raw ?? "")
  }
  return out
}

// --- form fields -------------------------------------------------------------

function EnumField({
  value,
  onChange,
  options,
}: {
  value: unknown
  onChange: (value: string) => void
  options: string[]
}) {
  const current = typeof value === "string" ? value : ""
  return (
    <Select value={current === "" ? null : current} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger className="w-full" aria-invalid={current === ""}>
        <SelectValue placeholder="Choose…" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {labelFor(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

type ArrayItem = Record<string, unknown>

function ArrayField({
  name,
  schema,
  control,
  register,
}: {
  name: string
  schema: PropSchema
  control: Control<Record<string, unknown>>
  register: UseFormRegister<Record<string, unknown>>
}) {
  const { fields, append, remove } = useFieldArray({ control, name: name as never })
  const itemProperties = schema.items?.properties ?? {}
  const subKeys = Object.keys(itemProperties)

  function blankItem(): ArrayItem {
    const item: ArrayItem = {}
    for (const [key, sub] of Object.entries(itemProperties)) {
      if (sub.type === "boolean") {
        item[key] = false
      } else if (sub.type === "number" || sub.type === "integer") {
        item[key] = sub.default ?? ""
      } else if (sub.type === "array") {
        item[key] = "[]"
      } else {
        item[key] = (sub.default as string | undefined) ?? (sub.enum !== undefined ? sub.enum[0] : "")
      }
    }
    return item
  }

  return (
    <div className="flex flex-col gap-2">
      {fields.map((field, index) => (
        <div key={field.id} className="rounded-lg border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Item {index + 1}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove item ${index + 1}`}
              onClick={() => remove(index)}
            >
              <Trash2Icon className="text-destructive" />
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            {subKeys.map((subKey) => {
              const sub = itemProperties[subKey]!
              const subName = `${name}.${index}.${subKey}`
              const label = labelFor(subKey)
              if (sub.type === "array") {
                // Nested arrays round-trip as JSON — power-user escape hatch.
                return (
                  <Field key={subKey}>
                    <FieldLabel htmlFor={subName}>{label} (JSON)</FieldLabel>
                    <Textarea id={subName} rows={3} className="font-mono text-xs" {...register(subName as never)} />
                  </Field>
                )
              }
              if (sub.enum !== undefined) {
                return (
                  <Field key={subKey}>
                    <FieldLabel>{label}</FieldLabel>
                    <ControlledEnum
                      name={subName as never}
                      control={control as never}
                      options={sub.enum}
                    />
                  </Field>
                )
              }
              return (
                <Field key={subKey}>
                  <FieldLabel htmlFor={subName}>{label}</FieldLabel>
                  <Input
                    id={subName}
                    type={sub.type === "number" || sub.type === "integer" ? "number" : "text"}
                    maxLength={sub.maxLength}
                    {...register(subName as never, sub.type === "number" || sub.type === "integer" ? { valueAsNumber: true } : undefined)}
                  />
                </Field>
              )
            })}
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => append(blankItem() as never)}
      >
        Add item
      </Button>
    </div>
  )
}

function ControlledEnum({
  name,
  control,
  options,
}: {
  name: never
  control: never
  options: string[]
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <EnumField
          value={field.value}
          onChange={(v) => field.onChange(v)}
          options={options}
        />
      )}
    />
  )
}

// --- schema form -------------------------------------------------------------

function fallbackValue(schema: PropSchema): unknown {
  if (schema.type === "boolean") return false
  if (schema.type === "array") return []
  if (schema.default !== undefined) return schema.default
  if (schema.enum !== undefined) return schema.enum[0]
  return ""
}

function SchemaForm({ node }: { node: ComponentInstance }) {
  const entry = CATALOG.find((candidate) => candidate.name === node.component)
  const replaceProps = useEditorStore((s) => s.replaceProps)
  const select = useEditorStore((s) => s.select)

  if (entry === undefined) {
    return <p className="p-3 text-sm text-muted-foreground">This component isn’t in the registry.</p>
  }

  const registrySchema = entry.schema as {
    properties?: Record<string, PropSchema>
    required?: string[]
  }
  const properties = registrySchema.properties ?? {}
  const defaults = (entry.default_props ?? {}) as Record<string, unknown>

  return (
    <SchemaFormInner
      key={node.id}
      entry={entry}
      node={node}
      schemaRequired={registrySchema.required ?? []}
      properties={properties}
      defaults={defaults}
      replaceProps={replaceProps}
      deselect={() => select(null)}
    />
  )
}

function SchemaFormInner({
  entry,
  node,
  schemaRequired,
  properties,
  defaults,
  replaceProps,
  deselect,
}: {
  entry: RegistryEntry
  node: ComponentInstance
  schemaRequired: string[]
  properties: Record<string, PropSchema>
  defaults: Record<string, unknown>
  replaceProps: (nodeId: string, props: Record<string, unknown>) => void
  deselect: () => void
}) {
  const { control, register, watch } = useForm<Record<string, unknown>>({
    defaultValues: useMemo(() => {
      const out: Record<string, unknown> = {}
      for (const [key, schema] of Object.entries(properties)) {
        const value = node.props[key] ?? defaults[key]
        out[key] = value === undefined ? fallbackValue(schema) : value
      }
      return out
    }, [node, properties, defaults]),
  })
  const values = watch()

  useEffect(() => {
    const timer = setTimeout(() => {
      replaceProps(node.id, cleanProps(values, properties))
    }, 400)
    return () => clearTimeout(timer)
  }, [values, node.id, properties, replaceProps])

  const required = new Set(schemaRequired)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{entry.display_name}</p>
          <Button type="button" variant="ghost" size="xs" onClick={deselect}>
            Done
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{entry.description}</p>
      </div>

      <FieldGroup>
        {Object.entries(properties).map(([key, schema]) => {
          if (schema.type === "array") {
            return (
              <Field key={key}>
                <FieldLabel>{labelFor(key)}</FieldLabel>
                <ArrayField
                  name={key}
                  schema={schema}
                  control={control}
                  register={register}
                />
              </Field>
            )
          }
          if (schema.enum !== undefined) {
            return (
              <Field key={key}>
                <FieldLabel htmlFor={key}>
                  {labelFor(key)}
                  {required.has(key) ? " *" : ""}
                </FieldLabel>
                <ControlledEnum
                  name={key as never}
                  control={control as never}
                  options={schema.enum}
                />
              </Field>
            )
          }
          const isLong = (schema.maxLength ?? 0) > 80
          return (
            <Field key={key}>
              <FieldLabel htmlFor={key}>
                {labelFor(key)}
                {required.has(key) ? " *" : ""}
              </FieldLabel>
              {isLong ? (
                <Textarea id={key} rows={3} maxLength={schema.maxLength} {...register(key as never)} />
              ) : (
                <Input
                  id={key}
                  type={schema.type === "number" || schema.type === "integer" ? "number" : schema.format !== undefined ? "url" : "text"}
                  maxLength={schema.maxLength}
                  {...register(key as never, schema.type === "number" || schema.type === "integer" ? { valueAsNumber: true } : undefined)}
                />
              )}
            </Field>
          )
        })}
      </FieldGroup>
      <FieldDescription>Changes save automatically.</FieldDescription>
    </div>
  )
}

// --- page settings -----------------------------------------------------------

const pageSchema = z.object({
  title: z.string().min(1, "Give the page a title.").max(255),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers, and dashes."),
  meta_title: z.string().max(255, "Keep it under 255 characters."),
  meta_description: z.string().max(500, "Keep it under 500 characters."),
})

type PageForm = z.infer<typeof pageSchema>

function PageSettingsForm({
  site,
  page,
  onSaved,
}: {
  site: SiteResource
  page: PageResource
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const { register, handleSubmit, formState } = useForm<PageForm>({
    defaultValues: {
      title: page.title,
      slug: page.slug,
      meta_title: page.meta_title ?? "",
      meta_description: page.meta_description ?? "",
    },
  })

  async function onSubmit(values: PageForm) {
    setSaving(true)
    try {
      const patch: PageSettingsPatch = {
        title: values.title,
        slug: values.slug,
        meta_title: values.meta_title,
        meta_description: values.meta_description,
      }
      await updatePage(site.id, page.id, patch)
      toast.success("Page details saved.")
      onSaved()
    } catch {
      toast.error("Couldn't save page details — try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold">Page settings</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The page title shows in the browser tab; the slug sets its web address.
        </p>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="page-title">Title</FieldLabel>
          <Input id="page-title" {...register("title")} aria-invalid={formState.errors.title ? true : undefined} />
          {formState.errors.title && (
            <FieldDescription>{formState.errors.title.message}</FieldDescription>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="page-slug">Web address (slug)</FieldLabel>
          <Input id="page-slug" className="font-mono" {...register("slug")} aria-invalid={formState.errors.slug ? true : undefined} />
          {formState.errors.slug ? (
            <FieldDescription>{formState.errors.slug.message}</FieldDescription>
          ) : (
            <FieldDescription>/{page.slug} today</FieldDescription>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="page-meta-title">Search result title</FieldLabel>
          <Input id="page-meta-title" maxLength={255} {...register("meta_title")} />
          <FieldDescription>Shown by search engines instead of the title when set.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="page-meta-description">Search result description</FieldLabel>
          <Textarea id="page-meta-description" rows={3} maxLength={500} {...register("meta_description")} />
          <FieldDescription>One or two sentences describing the page for search results.</FieldDescription>
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={saving} className="self-start">
        Save page details
      </Button>
    </form>
  )
}

// --- inspector panel ---------------------------------------------------------

export function InspectorPanel({
  site,
  page,
  onSaved,
}: {
  site: SiteResource
  page: PageResource
  onSaved: () => void
}) {
  const tree = useEditorStore((s) => s.tree)
  const selectedId = useEditorStore((s) => s.selectedId)

  const node = tree !== null && selectedId !== null ? findTreeNode(tree, selectedId) : null
  const isRoot = node !== null && tree !== null && node.id === tree.id

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {node !== null && !isRoot ? (
        <SchemaForm node={node} />
      ) : (
        <PageSettingsForm site={site} page={page} onSaved={onSaved} />
      )}
    </div>
  )
}
