import { create } from "zustand"
import { temporal } from "zundo"

import type { ComponentInstance, RegistryEntry } from "@sazeh/schema"

export type Breakpoint = "desktop" | "mobile"
export type SaveState = "saved" | "dirty" | "saving" | "error"

interface EditorState {
  tree: ComponentInstance | null
  selectedId: string | null
  breakpoint: Breakpoint
  saveState: SaveState

  bootstrap: (tree: ComponentInstance) => void
  select: (nodeId: string | null) => void
  setBreakpoint: (bp: Breakpoint) => void
  markSaved: () => void
  markSaving: () => void
  markError: () => void

  updateProps: (nodeId: string, props: Record<string, unknown>) => void
  replaceProps: (nodeId: string, props: Record<string, unknown>) => void
  insertComponent: (parentId: string, index: number | null, entry: RegistryEntry) => void
  duplicateNode: (nodeId: string) => void
  removeNode: (nodeId: string) => void
  moveNode: (nodeId: string, newParentId: string, index: number | null) => void
}

// --- pure tree helpers (mirror apps/sites/tree.py semantics) ---------------

function freshId(): string {
  return crypto.randomUUID()
}

function findNode(
  tree: ComponentInstance,
  nodeId: string,
): ComponentInstance | null {
  if (tree.id === nodeId) return tree
  for (const child of tree.children) {
    const found = findNode(child, nodeId)
    if (found !== null) return found
  }
  return null
}

function findParent(
  tree: ComponentInstance,
  nodeId: string,
): { parent: ComponentInstance; index: number } | null {
  for (let i = 0; i < tree.children.length; i++) {
    if (tree.children[i]!.id === nodeId) return { parent: tree, index: i }
    const found = findParent(tree.children[i]!, nodeId)
    if (found !== null) return found
  }
  return null
}

/** Deep clone with fresh ids at every level (the editor is id-authoritative
 *  client-side; the server re-issues ids for subtree inserts). */
function cloneFresh(node: ComponentInstance): ComponentInstance {
  return {
    id: freshId(),
    component: node.component,
    props: { ...node.props },
    children: node.children.map(cloneFresh),
  }
}

/** Immutably apply a mutation to the tree; returns the new tree or null when
 *  the mutation is a no-op (missing node, root delete, …). */
function commit(
  tree: ComponentInstance,
  fn: (draft: ComponentInstance) => void,
): { tree: ComponentInstance; saveState: SaveState } | null {
  const draft = structuredClone(tree)
  fn(draft)
  // No-op mutations must not pollute history or trigger autosaves.
  if (JSON.stringify(draft) === JSON.stringify(tree)) return null
  return { tree: draft, saveState: "dirty" }
}

// --- store -------------------------------------------------------------------

export const useEditorStore = create<EditorState>()(
  temporal(
    (set) => ({
      tree: null,
      selectedId: null,
      breakpoint: "desktop",
      saveState: "saved",

      bootstrap: (tree) => set({ tree, selectedId: null, saveState: "saved" }),
      select: (nodeId) => set({ selectedId: nodeId }),
      setBreakpoint: (breakpoint) => set({ breakpoint }),
      markSaved: () => set({ saveState: "saved" }),
      markSaving: () => set({ saveState: "saving" }),
      markError: () => set({ saveState: "error" }),

      updateProps: (nodeId, props) =>
        set(({ tree }) => {
          if (tree === null) return {}
          return commit(tree, (draft) => {
            const node = findNode(draft, nodeId)
            if (node !== null) node.props = { ...node.props, ...props }
          }) ?? {}
        }),

      // The inspector edits the complete prop set — it replaces wholesale so
      // cleared optional fields actually clear (merge would keep stale keys).
      replaceProps: (nodeId, props) =>
        set(({ tree }) => {
          if (tree === null) return {}
          return commit(tree, (draft) => {
            const node = findNode(draft, nodeId)
            if (node !== null) node.props = structuredClone(props)
          }) ?? {}
        }),

      insertComponent: (parentId, index, entry) =>
        set(({ tree }) => {
          if (tree === null) return {}
          return commit(tree, (draft) => {
            const parent = findNode(draft, parentId)
            if (parent === null) return
            const node: ComponentInstance = {
              id: freshId(),
              component: entry.name,
              props: { ...(entry.default_props as Record<string, unknown>) },
              children: [],
            }
            if (index === null || index >= parent.children.length) {
              parent.children.push(node)
            } else {
              parent.children.splice(Math.max(0, index), 0, node)
            }
          }) ?? {}
        }),

      duplicateNode: (nodeId) =>
        set(({ tree }) => {
          if (tree === null) return {}
          const source = findNode(tree, nodeId)
          const located = findParent(tree, nodeId)
          if (source === null || located === null) return {}
          return commit(tree, (draft) => {
            const parent = findNode(draft, located.parent.id)
            if (parent === null) return
            parent.children.splice(
              located.index + 1,
              0,
              cloneFresh(source),
            )
          }) ?? {}
        }),

      removeNode: (nodeId) =>
        set(({ tree, selectedId }) => {
          if (tree === null || nodeId === tree.id) return {}
          const located = findParent(tree, nodeId)
          if (located === null) return {}
          const result = commit(tree, (draft) => {
            const parent = findNode(draft, located.parent.id)
            if (parent !== null) parent.children.splice(located.index, 1)
          })
          if (result === null) return {}
          return {
            ...result,
            selectedId: selectedId === nodeId ? null : selectedId,
          }
        }),

      moveNode: (nodeId, newParentId, index) =>
        set(({ tree }) => {
          if (tree === null) return {}
          const located = findParent(tree, nodeId)
          if (located === null || nodeId === tree.id) return {}
          return commit(tree, (draft) => {
            const oldParent = findNode(draft, located.parent.id)
            const newParent = findNode(draft, newParentId)
            if (oldParent === null || newParent === null) return
            const [moved] = oldParent.children.splice(located.index, 1)
            if (moved === undefined) return
            if (index === null || index >= newParent.children.length) {
              newParent.children.push(moved)
            } else {
              newParent.children.splice(Math.max(0, index), 0, moved)
            }
          }) ?? {}
        }),
    }),
    {
      // History tracks the tree only; save-state churn must not pollute it.
      partialize: ({ tree }) => ({ tree }),
      equality: (past, current) => JSON.stringify(past) === JSON.stringify(current),
      limit: 64,
    },
  ),
)

// --- undo / redo -------------------------------------------------------------

export function undoEdit(): boolean {
  const temporal = useEditorStore.temporal.getState()
  if (temporal.pastStates.length === 0) return false
  temporal.undo()
  useEditorStore.setState({ saveState: "dirty" })
  return true
}

export function redoEdit(): boolean {
  const temporal = useEditorStore.temporal.getState()
  if (temporal.futureStates.length === 0) return false
  temporal.redo()
  useEditorStore.setState({ saveState: "dirty" })
  return true
}

export function canUndo(): boolean {
  return useEditorStore.temporal.getState().pastStates.length > 0
}

export function canRedo(): boolean {
  return useEditorStore.temporal.getState().futureStates.length > 0
}

/** Read-only lookups for canvas/inspector consumers. */
export function findTreeNode(
  tree: ComponentInstance,
  nodeId: string,
): ComponentInstance | null {
  return findNode(tree, nodeId)
}

export function locateNode(
  tree: ComponentInstance,
  nodeId: string,
): { parent: ComponentInstance; index: number } | null {
  return findParent(tree, nodeId)
}
