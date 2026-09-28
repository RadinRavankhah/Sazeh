"""Tests for the recursive tree validator (apps/sites/validators.py)."""
from apps.sites.validators import validate_tree


def test_valid_tree_passes(seeded_registry):
    errors = validate_tree({
        "id": "root", "component": "Section", "props": {"padding": "md"},
        "children": [
            {"id": "b", "component": "Button",
             "props": {"label": "OK"}, "children": []},
        ],
    })
    assert errors == []


def test_unknown_component_is_reported(seeded_registry):
    errors = validate_tree({
        "id": "root", "component": "NotAComponent", "props": {}, "children": [],
    })
    assert any("Unknown component" in e["message"] for e in errors)


def test_enum_violation_is_reported(seeded_registry):
    errors = validate_tree({
        "id": "root", "component": "Section", "props": {"padding": "huge"},
        "children": [],
    })
    assert errors
    assert any("huge" in e["message"] for e in errors)


def test_missing_component_field_is_reported(seeded_registry):
    errors = validate_tree({"id": "root", "props": {}})
    assert any("Missing 'component'" in e["message"] for e in errors)


def test_required_prop_violation_is_reported(seeded_registry):
    errors = validate_tree({
        "id": "root", "component": "Section", "props": {},
        "children": [
            {"id": "h", "component": "HeroSection", "props": {}, "children": []},
        ],
    })
    assert any("headline" in e["message"] for e in errors)


def test_allowed_children_violation_is_reported(seeded_registry):
    errors = validate_tree({
        "id": "root", "component": "Section", "props": {},
        "children": [
            {"id": "h", "component": "HeroSection", "props": {"headline": "H"},
             "children": [
                 {"id": "b", "component": "Button",
                  "props": {"label": "x"}, "children": []},
             ]},
        ],
    })
    assert any("not allowed inside" in e["message"] for e in errors)


def test_errors_carry_node_ids(seeded_registry):
    errors = validate_tree({
        "id": "root", "component": "NotAComponent", "props": {}, "children": [],
    })
    assert errors[0]["id"] == "root"
