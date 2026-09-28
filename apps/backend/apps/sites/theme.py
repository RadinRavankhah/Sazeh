"""
Site theme tokens (decision D2.2 — extended granularity).

`site.config["theme"]` holds the validated token sheet below. The visual
editor's settings UI (Phase 3) and the agent's `set_site_theme` tool
(Phase 5) both write through `validate_theme` / `apply_theme`.
"""
from __future__ import annotations

from typing import Any

from jsonschema import Draft7Validator

THEME_SCHEMA: dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "SiteTheme",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "accent_color": {
            "type": "string",
            "pattern": "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$",
        },
        "font_family": {
            "type": "string",
            "enum": ["geist", "inter", "outfit", "satoshi", "system-ui"],
            "default": "system-ui",
        },
        "radius": {
            "type": "string",
            "enum": ["none", "sm", "md", "lg", "full"],
            "default": "md",
        },
        "heading_scale": {
            "type": "string",
            "enum": ["compact", "normal", "large"],
            "default": "normal",
        },
    },
}

DEFAULT_THEME: dict[str, Any] = {
    "accent_color": "#2563eb",
    "font_family": "system-ui",
    "radius": "md",
    "heading_scale": "normal",
}

_validator = Draft7Validator(THEME_SCHEMA)


def validate_theme(theme: dict[str, Any]) -> list[str]:
    """Validate a theme object. Returns a list of error strings (empty = valid)."""
    errors: list[str] = []
    for err in _validator.iter_errors(theme or {}):
        path = ".".join(str(p) for p in err.path) or "$"
        errors.append(f"{path}: {err.message}")
    return errors


def apply_theme(site, theme: dict[str, Any]) -> list[str]:
    """Merge validated theme tokens into site.config['theme'] and save.

    Returns error strings; the site is untouched when validation fails.
    """
    errors = validate_theme(theme)
    if errors:
        return errors
    config = site.config or {}
    config["theme"] = {**DEFAULT_THEME, **(config.get("theme") or {}), **theme}
    site.config = config
    site.save(update_fields=["config", "updated_at"])
    return []
