import { useMemo } from "react"

import { CATALOG, type RegistryEntry } from "@sazeh/schema"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { useEditorStore } from "@/stores/editor"

/**
 * Blocks palette (replaces the permanent palette column): a searchable
 * command dialog. Click or Enter inserts the block at `index` (null = end
 * of the page). Opened from the sidebar's "Add block", the canvas's
 * "+ Add section" buttons, or Ctrl+K.
 */

const GROUPS: { category: RegistryEntry["category"]; heading: string }[] = [
  { category: "composite", heading: "Sections" },
  { category: "primitive", heading: "Blocks" },
]

export function AddBlockDialog({
  open,
  index,
  onOpenChange,
}: {
  open: boolean
  index: number | null
  onOpenChange: (open: boolean) => void
}) {
  const tree = useEditorStore((s) => s.tree)

  const filtered = useMemo(() => {
    const groups = GROUPS.map((group) => ({
      ...group,
      entries: CATALOG.filter((entry) => entry.category === group.category),
    }))
    return groups.filter((group) => group.entries.length > 0)
  }, [])

  function insert(entry: RegistryEntry) {
    if (tree !== null) {
      useEditorStore.getState().insertComponent(tree.id, index, entry)
    }
    onOpenChange(false)
  }

  return (
    <CommandDialog
      title="Add a block"
      description="Choose a section or block to add to this page."
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-lg"
    >
      <Command>
        <CommandInput placeholder="Search sections and blocks…" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          {filtered.map((group) => (
            <CommandGroup key={group.category} heading={group.heading}>
              {group.entries.map((entry) => (
                <CommandItem
                  key={entry.name}
                  value={`${entry.display_name} ${entry.description}`}
                  onSelect={() => insert(entry)}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium">{entry.display_name}</span>
                    <span className="truncate text-xs text-muted-foreground">{entry.description}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
        <p className="flex items-center gap-1.5 border-t px-3 py-2 text-xs text-muted-foreground">
          {index === null ? "Adds to the end of the page." : `Adds at position ${index + 1}.`}
          <span className="ml-auto flex items-center gap-1">
            <Kbd>Enter</Kbd> to add
          </span>
        </p>
      </Command>
    </CommandDialog>
  )
}
