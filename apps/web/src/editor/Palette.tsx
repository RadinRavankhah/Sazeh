import { useMemo, useState } from "react"
import { useDraggable } from "@dnd-kit/core"
import { GripVerticalIcon, PlusIcon, SearchIcon } from "lucide-react"

import { CATALOG, type RegistryEntry } from "@sazeh/schema"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useEditorStore } from "@/stores/editor"

/**
 * Registry palette (Phase 4 task 3): searchable, grouped by category.
 * Drag a block onto the canvas, or click to append it to the page.
 */

const GROUPS: { category: RegistryEntry["category"]; heading: string }[] = [
  { category: "composite", heading: "Sections" },
  { category: "primitive", heading: "Blocks" },
]

function PaletteItem({ entry }: { entry: RegistryEntry }) {
  const insertComponent = useEditorStore((s) => s.insertComponent)
  const tree = useEditorStore((s) => s.tree)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${entry.name}`,
    data: { type: "palette", entry },
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "flex cursor-grab items-start gap-2 rounded-lg border bg-card p-2.5 text-left transition-colors outline-none select-none hover:border-ring/50 focus-visible:border-ring",
        isDragging && "opacity-40",
      )}
      onClick={() => {
        if (tree !== null) insertComponent(tree.id, null, entry)
      }}
      title={`Add ${entry.display_name}`}
    >
      <GripVerticalIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{entry.display_name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {entry.description}
        </span>
      </span>
      <PlusIcon
        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
        aria-hidden
      />
    </div>
  )
}

export function Palette() {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CATALOG.filter(
      (entry) =>
        q === "" ||
        entry.display_name.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q),
    )
  }, [query])

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r" aria-label="Component palette">
      <div className="border-b p-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search blocks"
            aria-label="Search components"
            className="pl-8"
          />
        </div>
      </div>
      <div className="flex flex-col gap-4 overflow-y-auto p-3">
        {GROUPS.map((group) => {
          const entries = filtered.filter((e) => e.category === group.category)
          if (entries.length === 0) return null
          return (
            <div key={group.category} className="flex flex-col gap-1.5">
              <p className="px-1 text-sm font-medium text-muted-foreground">
                {group.heading}
              </p>
              {entries.map((entry) => (
                <PaletteItem key={entry.name} entry={entry} />
              ))}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <p className="px-1 py-4 text-sm text-muted-foreground">
            Nothing matches “{query}”.
          </p>
        )}
      </div>
    </aside>
  )
}
