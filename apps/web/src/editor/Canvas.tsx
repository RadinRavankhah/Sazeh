import { type ReactNode } from "react"
import {
  useDndContext,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BlocksIcon,
  CopyIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { CATALOG, type ComponentInstance } from "@sazeh/schema"

import { Button } from "@/components/ui/button"
import { SiteThemeStyle } from "@/render/SiteThemeStyle"
import { PageRenderer } from "@/render/renderer"
import type { SiteResource } from "@/lib/sites"
import { cn } from "@/lib/utils"
import { locateNode, useEditorStore } from "@/stores/editor"

/**
 * Canvas (3-zone shell): the page is the hero. Sections get selection,
 * drag and insert affordances that straddle the section's top edge so they
 * never cover the rendered content. Only the root's direct children get
 * chrome — nested blocks are selected from the Layers list. Mobile mode is
 * a read-only width preview (D4.2).
 */

function displayName(component: string): string {
  return CATALOG.find((entry) => entry.name === component)?.display_name ?? component
}

/** Insert point between sections. While dragging: a drop line. Otherwise:
 *  a hover-revealed "+" button that opens the block palette at this index. */
function InsertSlot({ index, onAdd }: { index: number; onAdd: (index: number) => void }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${index}`,
    data: { index },
  })
  const dragging = useDndContext().active !== null

  if (dragging) {
    return (
      <div ref={setNodeRef} className="relative h-5">
        <div
          className={cn(
            "absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 rounded-full transition-colors",
            isOver ? "bg-primary" : "bg-border",
          )}
        />
      </div>
    )
  }

  return (
    <div className="group/slot relative z-30 h-0">
      <div className="absolute inset-x-10 -top-2.5 h-5" aria-hidden />
      <button
        type="button"
        aria-label={`Add a block at position ${index + 1}`}
        onClick={() => onAdd(index)}
        className="absolute top-0 left-1/2 flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity outline-none hover:border-ring/60 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 group-hover/slot:opacity-100"
      >
        <PlusIcon className="size-3" />
      </button>
    </div>
  )
}

function SectionChrome({
  node,
  children,
}: {
  node: ComponentInstance
  children: ReactNode
}) {
  const tree = useEditorStore((s) => s.tree)
  const selected = useEditorStore((s) => s.selectedId === node.id)
  const select = useEditorStore((s) => s.select)
  const duplicateNode = useEditorStore((s) => s.duplicateNode)
  const removeNode = useEditorStore((s) => s.removeNode)
  const moveNode = useEditorStore((s) => s.moveNode)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `node:${node.id}`,
    data: { type: "section", nodeId: node.id },
  })

  const rootId = tree?.id
  const located = tree !== null ? locateNode(tree, node.id) : null
  const index = located?.index ?? 0

  return (
    <div
      ref={setNodeRef}
      data-node-id={node.id}
      className={cn("group/section relative", isDragging && "opacity-40")}
    >
      {children}

      {/* Click-catcher above the rendered component: clicks select instead of
          following links; the outline doubles as hover/selected feedback. */}
      <button
        type="button"
        aria-label={`Select ${displayName(node.component)} section`}
        onClick={(e) => {
          e.stopPropagation()
          select(node.id)
        }}
        className={cn(
          "absolute inset-0 z-10 cursor-pointer outline-none",
          selected
            ? "ring-2 ring-ring ring-inset"
            : "opacity-0 ring-1 ring-ring/50 ring-inset transition-opacity group-hover/section:opacity-100 focus-visible:opacity-100",
        )}
      />

      {/* Drag label + section actions straddle the top edge so they never
          cover the rendered content (Webflow/Framer pattern). */}
      {rootId !== undefined && (
        <div
          {...attributes}
          {...listeners}
          title="Drag to move this section"
          className={cn(
            "absolute -top-3 left-4 z-20 flex cursor-grab items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs font-medium shadow-sm outline-none select-none",
            selected ? "" : "opacity-0 transition-opacity group-hover/section:opacity-100",
          )}
        >
          <GripVerticalIcon className="size-3 text-muted-foreground" />
          {displayName(node.component)}
        </div>
      )}

      {rootId !== undefined && selected && (
        <div
          className="absolute -top-3 right-4 z-20 flex items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Move section up"
            title="Move up"
            disabled={index === 0}
            onClick={() => moveNode(node.id, rootId, index - 1)}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Move section down"
            title="Move down"
            disabled={located === null || index >= located.parent.children.length - 1}
            onClick={() => moveNode(node.id, rootId, index + 1)}
          >
            <ArrowDownIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Duplicate section"
            title="Duplicate"
            onClick={() => duplicateNode(node.id)}
          >
            <CopyIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Delete section"
            title="Delete"
            className="text-destructive hover:text-destructive"
            onClick={() => removeNode(node.id)}
          >
            <Trash2Icon />
          </Button>
        </div>
      )}
    </div>
  )
}

export function Canvas({
  site,
  onAddAt,
}: {
  site: SiteResource | null
  onAddAt: (index: number) => void
}) {
  const tree = useEditorStore((s) => s.tree)
  const breakpoint = useEditorStore((s) => s.breakpoint)
  const select = useEditorStore((s) => s.select)

  if (tree === null) return null

  return (
    <div
      className="editor-canvas min-w-0 flex-1 overflow-y-auto p-8"
      onClick={() => select(null)}
    >
      <div
        className={cn(
          "mx-auto bg-background shadow-sm ring-1 ring-border transition-[width] duration-200",
          breakpoint === "mobile" ? "w-[390px]" : "w-full max-w-[1200px]",
        )}
      >
        <SiteThemeStyle theme={site?.config?.theme}>
          {tree.children.length === 0 ? (
            <EmptyCanvas onAdd={() => onAddAt(0)} />
          ) : (
            <PageRenderer
              root={tree}
              decorateChildren={(element, childNode) => {
                // Interleave insert slots: one before the first section and
                // one after the last, one between every pair.
                const located = locateNode(tree, childNode.id)
                const index = located?.index ?? 0
                const isLast = located !== null && index === tree.children.length - 1
                return (
                  <>
                    {index === 0 && <InsertSlot index={0} onAdd={onAddAt} />}
                    <SectionChrome node={childNode}>{element}</SectionChrome>
                    {isLast && <InsertSlot index={index + 1} onAdd={onAddAt} />}
                  </>
                )
              }}
            />
          )}
        </SiteThemeStyle>
      </div>
    </div>
  )
}

function EmptyCanvas({ onAdd }: { onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "slot:0",
    data: { index: 0 },
  })

  return (
    <div ref={setNodeRef} className="px-6 py-16" onClick={(e) => e.stopPropagation()}>
      <div
        className={cn(
          "mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center",
          isOver ? "border-primary bg-accent/40" : "border-border",
        )}
      >
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          <BlocksIcon className="size-5 text-muted-foreground" />
        </div>
        <p className="font-medium">Build this page</p>
        <p className="text-sm text-muted-foreground">
          Add a ready-made section — or describe the page in the agent chat
          and let it build.
        </p>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <PlusIcon data-icon="inline-start" />
          Add section
        </Button>
      </div>
    </div>
  )
}
