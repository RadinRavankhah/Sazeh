import { type ReactNode } from "react"
import {
  useDndContext,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  GripVerticalIcon,
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
 * Canvas (Phase 4 tasks 4–5): the read-only renderer dressed in editor
 * chrome. Only the root's direct children (the page's sections) get
 * selection/drag affordances — nested blocks are selected from the layers
 * list in the inspector. Mobile mode is a read-only width preview (D4.2).
 */

function displayName(component: string): string {
  return CATALOG.find((entry) => entry.name === component)?.display_name ?? component
}

function DropSlot({ index }: { index: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${index}`,
    data: { index },
  })
  const dragging = useDndContext().active !== null

  return (
    <div ref={setNodeRef} className={cn("relative", dragging ? "h-5" : "h-0")}>
      {dragging && (
        <div
          className={cn(
            "absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 rounded-full transition-colors",
            isOver ? "bg-primary" : "bg-border",
          )}
        />
      )}
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

      {rootId !== undefined && selected && (
        <div
          className="absolute top-2 right-2 z-20 flex items-center gap-1 rounded-lg border bg-background p-1 shadow-sm"
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

      {rootId !== undefined && (
        <div
          className={cn(
            "absolute top-2 left-2 z-20 flex items-center",
            selected ? "" : "opacity-0 transition-opacity group-hover/section:opacity-100",
          )}
        >
          <div
            {...attributes}
            {...listeners}
            title="Drag to move this section"
            className="flex cursor-grab items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs font-medium shadow-sm outline-none select-none"
          >
            <GripVerticalIcon className="size-3 text-muted-foreground" />
            {displayName(node.component)}
          </div>
        </div>
      )}
    </div>
  )
}

export function Canvas({ site }: { site: SiteResource | null }) {
  const tree = useEditorStore((s) => s.tree)
  const breakpoint = useEditorStore((s) => s.breakpoint)
  const select = useEditorStore((s) => s.select)

  if (tree === null) return null

  return (
    <div
      className="min-w-0 flex-1 overflow-y-auto bg-muted/40 p-6"
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
            <EmptyCanvas />
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
                    {index === 0 && <DropSlot index={0} />}
                    <SectionChrome node={childNode}>{element}</SectionChrome>
                    {isLast && <DropSlot index={index + 1} />}
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

function EmptyCanvas() {
  const { setNodeRef, isOver } = useDroppable({
    id: "slot:0",
    data: { index: 0 },
  })
  const tree = useEditorStore((s) => s.tree)
  const rootId = tree?.id

  return (
    <div ref={setNodeRef} className="px-6 py-24" onClick={(e) => e.stopPropagation()}>
      <div
        className={cn(
          "mx-auto flex max-w-md flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center",
          isOver ? "border-primary bg-accent/40" : "border-border",
        )}
      >
        <p className="font-medium">This page is empty</p>
        <p className="text-sm text-muted-foreground">
          Drag a section from the left palette to start building — or let the
          agent draft one for you from the chat page.
        </p>
      </div>
      {rootId !== undefined && <span className="sr-only">Drop target index 0 of {rootId}</span>}
    </div>
  )
}
