"""Agent tools — the LLM's only write path.

Every tool wraps the same service functions the REST views use, so there is
one validation path and one audit path (dev plan v2 §7). Results are
structured: {"ok": True, ...} or {"ok": False, "error": str, "code": str} —
the error text is what the model retries against (self-healing).

Tenancy floor: objects are always resolved through the session's site /
workspace. Page ids that don't belong to the session's site are "not found" —
never an access leak.
"""
from __future__ import annotations

import json
from typing import Any

import structlog

from apps.registry.service import registry
from apps.sites.models import Page, Site
from apps.sites.theme import apply_theme
from apps.sites.tree import TreePatchService
from apps.sites.validators import validate_tree

from .models import AgentSession

logger = structlog.get_logger("agent.tools")


class ToolError(Exception):
    def __init__(self, error: str, code: str = "error") -> None:
        super().__init__(error)
        self.error = error
        self.code = code


def tool_definitions() -> list[dict[str, Any]]:
    """OpenAI-format tool specs handed to the LLM every turn."""
    return [
        {
            "type": "function",
            "function": {
                "name": "list_components",
                "description": (
                    "List available site components (compact). Use get_component "
                    "for the full prop schema of one component."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "enum": ["composite", "primitive"],
                        }
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_component",
                "description": (
                    "Full prop schema, defaults, and an example payload for one "
                    "component. Call this before using a component the first time."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {"name": {"type": "string"}},
                    "required": ["name"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_page",
                "description": "Get a page's title, slug, and full component tree.",
                "parameters": {
                    "type": "object",
                    "properties": {"page_id": {"type": "string", "format": "uuid"}},
                    "required": ["page_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "create_page",
                "description": (
                    "Create a new page in the site. The tree is optional; omit it "
                    "to start from an empty root Section."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "maxLength": 255},
                        "slug": {
                            "type": "string",
                            "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
                        },
                        "tree": {"type": "object"},
                    },
                    "required": ["title", "slug"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "patch_page_tree",
                "description": (
                    "The workhorse: atomically patch a page's component tree. "
                    "Operations: update_props (node_id, props), insert (parent_id, "
                    "component, props, index?), delete (node_id), move (node_id, "
                    "new_parent_id, index?). Node ids are generated on insert."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "page_id": {"type": "string", "format": "uuid"},
                        "operations": {
                            "type": "array",
                            "minItems": 1,
                            "items": {"type": "object"},
                        },
                    },
                    "required": ["page_id", "operations"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "set_site_theme",
                "description": (
                    "Set site-wide design tokens: accent_color (#hex), font_family, "
                    "radius, heading_scale. Applies across all pages."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "theme": {
                            "type": "object",
                            "properties": {
                                "accent_color": {
                                    "type": "string",
                                    "pattern": "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$",
                                },
                                "font_family": {
                                    "type": "string",
                                    "enum": ["geist", "inter", "outfit", "satoshi", "system-ui"],
                                },
                                "radius": {
                                    "type": "string",
                                    "enum": ["none", "sm", "md", "lg", "full"],
                                },
                                "heading_scale": {
                                    "type": "string",
                                    "enum": ["compact", "normal", "large"],
                                },
                            },
                            "additionalProperties": False,
                        }
                    },
                    "required": ["theme"],
                },
            },
        },
    ]


def _page_for(session: AgentSession, page_id: str) -> Page:
    try:
        return Page.objects.get(
            pk=page_id, site=session.site, site__workspace=session.workspace
        )
    except (Page.DoesNotExist, ValueError, TypeError) as exc:
        raise ToolError("No page with that id in this site.", "not_found") from exc


def _touched_node_ids(operations: list[dict[str, Any]]) -> list[str]:
    ids: list[str] = []
    for op in operations:
        for key in ("node_id", "parent_id", "new_parent_id"):
            value = op.get(key)
            if isinstance(value, str):
                ids.append(value)
    return ids


# --- implementations -------------------------------------------------------

def run_list_components(session: AgentSession, args: dict[str, Any]) -> dict[str, Any]:
    return {
        "ok": True,
        "components": registry.list_components(category=args.get("category")),
    }


def run_get_component(session: AgentSession, args: dict[str, Any]) -> dict[str, Any]:
    entry = registry.get_component(args.get("name", ""))
    if entry is None:
        raise ToolError(f"No component named '{args.get('name')}'.", "not_found")
    return {"ok": True, "component": entry}


def run_get_page(session: AgentSession, args: dict[str, Any]) -> dict[str, Any]:
    page = _page_for(session, args.get("page_id", ""))
    return {
        "ok": True,
        "page": {
            "id": str(page.id),
            "title": page.title,
            "slug": page.slug,
            "status": page.status,
            "tree": page.tree,
        },
    }


def run_create_page(session: AgentSession, args: dict[str, Any]) -> dict[str, Any]:
    site: Site = session.site
    tree = args.get("tree") or {
        "id": "root",
        "component": "Section",
        "props": {"padding": "md", "container_width": "contained"},
        "children": [],
    }
    errors = validate_tree(tree)
    if errors:
        return {
            "ok": False,
            "code": "validation_error",
            "error": f"Tree rejected: {errors}",
        }
    if Page.objects.filter(site=site, slug=args["slug"]).exists():
        raise ToolError(
            f"A page with slug '{args['slug']}' already exists in this site — "
            "pick another slug.",
            "validation_error",
        )
    page = Page.objects.create(
        site=site, title=args["title"], slug=args["slug"], tree=tree
    )
    logger.info("tool.page_created", page_id=str(page.id), slug=page.slug)
    return {"ok": True, "page_id": str(page.id), "title": page.title, "slug": page.slug}


def run_patch_page_tree(session: AgentSession, args: dict[str, Any]) -> dict[str, Any]:
    page = _page_for(session, args.get("page_id", ""))
    operations = args.get("operations")
    if not isinstance(operations, list) or not operations:
        raise ToolError("operations must be a non-empty list.", "validation_error")

    try:
        new_tree = TreePatchService.apply_patch(page.tree, operations)
    except ValueError as exc:
        return {"ok": False, "code": "validation_error", "error": str(exc)}

    errors = validate_tree(new_tree)
    if errors:
        return {
            "ok": False,
            "code": "validation_error",
            "error": f"Validation failed: {errors}",
        }

    page.tree = new_tree
    page.save(update_fields=["tree", "updated_at"])
    logger.info(
        "tool.tree_patched",
        page_id=str(page.id),
        ops=len(operations),
        node_ids=_touched_node_ids(operations),
    )
    return {
        "ok": True,
        "page_id": str(page.id),
        "touched_node_ids": _touched_node_ids(operations),
    }


def run_set_site_theme(session: AgentSession, args: dict[str, Any]) -> dict[str, Any]:
    errors = apply_theme(session.site, args.get("theme", {}))
    if errors:
        return {"ok": False, "code": "validation_error", "error": f"Theme rejected: {errors}"}
    return {"ok": True, "theme": session.site.config.get("theme", {})}


TOOL_RUNNERS = {
    "list_components": run_list_components,
    "get_component": run_get_component,
    "get_page": run_get_page,
    "create_page": run_create_page,
    "patch_page_tree": run_patch_page_tree,
    "set_site_theme": run_set_site_theme,
}


def execute_tool(
    session: AgentSession, name: str, arguments_json: str
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Run one tool call. Returns (result, tree_snapshot_before|None).

    Malformed args (bad JSON, unknown tool) come back as validation errors so
    the model can self-correct.
    """
    snapshot: dict[str, Any] | None = None
    try:
        try:
            args = json.loads(arguments_json or "{}")
        except json.JSONDecodeError as exc:
            raise ToolError(f"Arguments are not valid JSON: {exc}", "validation_error") from exc
        if not isinstance(args, dict):
            raise ToolError("Arguments must be an object.", "validation_error")
        runner = TOOL_RUNNERS.get(name)
        if runner is None:
            raise ToolError(f"Unknown tool '{name}'.", "validation_error")

        # Page-tree mutations snapshot before executing (revert path).
        if name == "patch_page_tree":
            try:
                page = _page_for(session, args.get("page_id", ""))
                snapshot = page.tree
            except ToolError:
                pass

        result = runner(session, args)
        return result, snapshot
    except ToolError as exc:
        return {"ok": False, "code": exc.code, "error": exc.error}, snapshot
