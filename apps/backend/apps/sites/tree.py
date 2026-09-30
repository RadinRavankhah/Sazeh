"""
Atomic tree patch operations: update_props, insert, delete, move.
These are applied to the JSONB `tree` field of a Page.
"""
import copy
import uuid

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_node(tree: dict, node_id: str) -> dict | None:
    """DFS search for a node by id. Returns the node dict or None."""
    if tree.get("id") == node_id:
        return tree
    for child in tree.get("children", []):
        found = _find_node(child, node_id)
        if found is not None:
            return found
    return None


def _find_parent(tree: dict, node_id: str) -> tuple[dict | None, int | None]:
    """Return (parent_node, index_in_children) or (None, None)."""
    for i, child in enumerate(tree.get("children", [])):
        if child.get("id") == node_id:
            return tree, i
    for _i, child in enumerate(tree.get("children", [])):
        parent, idx = _find_parent(child, node_id)
        if parent is not None:
            return parent, idx
    return None, None


# ---------------------------------------------------------------------------
# Patch operations
# ---------------------------------------------------------------------------

class TreePatcher:
    """Apply atomic operations to a page tree (JSONB field)."""

    @staticmethod
    def update_props(tree: dict, node_id: str, props: dict) -> dict:
        """Merge new props into the target node."""
        node = _find_node(tree, node_id)
        if node is None:
            raise ValueError(f"Node not found: {node_id}")
        node["props"] = {**node.get("props", {}), **props}
        return tree

    @staticmethod
    def _materialize_subtree(node: dict) -> dict:
        """
        Deep-copy a client-supplied subtree spec (duplicate/paste), assigning
        fresh ids to *every* node — client ids are ignored (the server is the
        id authority, so a duplicated branch can never collide with the
        original). Structural problems raise ValueError; component/props
        validity is enforced afterwards by validate_tree on the patched tree.
        """
        if not isinstance(node, dict) or not isinstance(node.get("component"), str):
            raise ValueError("Each inserted node needs a 'component' string")
        children = node.get("children") or []
        if not isinstance(children, list):
            raise ValueError("'children' must be an array")
        return {
            "id": str(uuid.uuid4()),
            "component": node["component"],
            "props": node.get("props") or {},
            "children": [TreePatcher._materialize_subtree(c) for c in children],
        }

    @staticmethod
    def insert(tree: dict, parent_id: str, index: int | None,
               component_name: str, props: dict | None = None,
               children: list | None = None) -> dict:
        """
        Insert a new child node into parent_id at given index.

        `children` (optional) is a client-supplied subtree spec (e.g. a
        duplicated section); ids are reassigned server-side, recursively.
        """
        parent = _find_node(tree, parent_id)
        if parent is None:
            raise ValueError(f"Parent node not found: {parent_id}")
        if "children" not in parent:
            parent["children"] = []

        new_node = TreePatcher._materialize_subtree({
            "component": component_name,
            "props": props or {},
            "children": children or [],
        })

        if index is None or index >= len(parent["children"]):
            parent["children"].append(new_node)
        else:
            parent["children"].insert(max(0, index), new_node)
        return tree

    @staticmethod
    def delete(tree: dict, node_id: str) -> dict:
        """Remove a node from the tree by its id."""
        parent, idx = _find_parent(tree, node_id)
        if parent is None:
            # Deleting the root is not allowed via patch
            raise ValueError("Cannot delete the root node")
        parent["children"].pop(idx)
        return tree

    @staticmethod
    def move(tree: dict, node_id: str, new_parent_id: str, index: int | None = None) -> dict:
        """Move a node to a new parent at the given index."""
        # Find and remove from old parent
        old_parent, old_idx = _find_parent(tree, node_id)
        if old_parent is None:
            raise ValueError(f"Node not found: {node_id}")
        moving_node = old_parent["children"].pop(old_idx)

        # Insert into new parent
        new_parent = _find_node(tree, new_parent_id)
        if new_parent is None:
            raise ValueError(f"New parent not found: {new_parent_id}")
        if "children" not in new_parent:
            new_parent["children"] = []

        if index is None or index >= len(new_parent["children"]):
            new_parent["children"].append(moving_node)
        else:
            new_parent["children"].insert(max(0, index), moving_node)
        return tree


class TreePatchService:
    """Service that applies a list of atomic operations to a page tree."""

    OPS = {"update_props", "insert", "delete", "move"}

    @classmethod
    def apply_patch(cls, tree: dict, operations: list[dict]) -> dict:
        """
        Apply a sequence of operations.  Each op has shape:
            {"op": "update_props", "node_id": "...", "props": {...}}
            {"op": "insert", "parent_id": "...", "index": 0, "component": "Button", "props": {...},
             "children": [{"component": "...", "props": {...}, "children": [...]}]}
            {"op": "delete", "node_id": "..."}
            {"op": "move", "node_id": "...", "new_parent_id": "...", "index": 0}
        Returns the modified tree.
        """
        patched = copy.deepcopy(tree)
        for i, op in enumerate(operations):
            op_type = op.get("op")
            if op_type not in cls.OPS:
                raise ValueError(f"Unknown operation '{op_type}' at index {i}")

            try:
                if op_type == "update_props":
                    patched = TreePatcher.update_props(
                        patched, op["node_id"], op.get("props", {})
                    )
                elif op_type == "insert":
                    patched = TreePatcher.insert(
                        patched, op["parent_id"], op.get("index"),
                        op["component"], op.get("props", {}),
                        op.get("children"),
                    )
                elif op_type == "delete":
                    patched = TreePatcher.delete(patched, op["node_id"])
                elif op_type == "move":
                    patched = TreePatcher.move(
                        patched, op["node_id"], op["new_parent_id"], op.get("index")
                    )
            except (ValueError, KeyError) as e:
                raise ValueError(f"Operation {i} ({op_type}) failed: {e}") from e

        return patched
