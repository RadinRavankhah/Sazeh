"""
Recursive tree validator — uses jsonschema against the Component Registry.
Every node in the tree must reference a known component and pass its schema.
"""
import jsonschema

from apps.registry.service import registry


class TreeValidationError(Exception):
    def __init__(self, node_id: str, message: str):
        self.node_id = node_id
        self.message = message
        super().__init__(f"[{node_id}] {message}")


def _validate_component_ref(name: str) -> dict:
    """Raise if component name is not in the registry.  Return its schema."""
    comp = registry.get_component(name)
    if comp is None:
        raise ValueError(f"Unknown component: {name}")
    return comp


def validate_tree(tree: dict) -> list[dict]:
    """
    Recursively validate a page tree.
    Returns a list of validation error dicts (empty = valid).
    """
    errors: list[dict] = []
    _validate_tree_node(tree, errors, "$")
    return errors


def _validate_tree_node(node: dict, errors: list[dict], path: str):
    """Validate one node and recurse into children."""
    if not isinstance(node, dict):
        errors.append({"path": path, "message": "Node must be an object"})
        return

    component_name = node.get("component")
    node_id = node.get("id", "<no-id>")
    props = node.get("props", {})

    if not component_name:
        errors.append({"path": path, "id": node_id, "message": "Missing 'component' field"})
        return

    try:
        comp = _validate_component_ref(component_name)
    except ValueError as e:
        errors.append({"path": path, "id": node_id, "message": str(e)})
        return

    # Validate props against the component's JSON Schema
    schema = comp["schema"]
    try:
        jsonschema.validate(instance=props, schema=schema)
    except jsonschema.ValidationError as e:
        errors.append({
            "path": path,
            "id": node_id,
            "component": component_name,
            "message": e.message,
            "schema_path": list(e.absolute_schema_path),
        })

    # Recurse children
    children = node.get("children", [])
    if not isinstance(children, list):
        errors.append({
            "path": f"{path}/children", "id": node_id,
            "message": "'children' must be an array",
        })
        return

    allowed = comp.get("allowed_children") or []
    for i, child in enumerate(children):
        child_component = child.get("component") if isinstance(child, dict) else None
        if "*" not in allowed and child_component not in allowed:
            errors.append({
                "path": f"{path}/children[{i}]",
                "id": child.get("id", "<no-id>"),
                "message": f"Component '{child_component}' not allowed inside '{component_name}'",
            })
        _validate_tree_node(child, errors, f"{path}/children[{i}]")
