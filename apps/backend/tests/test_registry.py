"""Catalog integrity tests: every seeded component's schema, defaults, and
example payload must be internally consistent (dev plan v2 §6, decision D2.1)."""
import jsonschema
import pytest

from apps.registry.models import Component
from apps.registry.service import registry

DRAFT7 = "http://json-schema.org/draft-07/schema#"


@pytest.fixture
def catalog(db):
    from django.core.management import call_command

    call_command("seed_components")
    return registry.get_component_names()


@pytest.mark.django_db
def test_seed_loads_full_catalog(catalog):
    expected_primitives = {"Section", "Button", "Heading", "Text", "Image", "Divider"}
    expected_composites = {
        "HeroSection", "FeatureGrid", "TextSection", "CtaBanner",
        "FAQAccordion", "TestimonialSection", "PricingTable", "NavBar", "Footer",
    }
    assert expected_primitives | expected_composites == catalog
    assert Component.objects.count() == 15


@pytest.mark.django_db
def test_seed_is_idempotent(db):
    from django.core.management import call_command

    call_command("seed_components")
    call_command("seed_components")
    assert Component.objects.count() == 15


@pytest.mark.django_db
def test_every_schema_is_draft07_with_closed_props(catalog):
    for name in catalog:
        comp = registry.get_component(name)
        assert comp is not None, name
        schema = comp["schema"]
        assert schema.get("$schema") == DRAFT7, name
        assert schema.get("additionalProperties") is False, name
        assert schema.get("type") == "object", name


@pytest.mark.django_db
def test_every_example_payload_validates_against_own_schema(catalog):
    """The agent's copy-modify pattern depends on examples always being valid."""
    for name in catalog:
        comp = registry.get_component(name)
        assert comp is not None, name
        example = comp.get("example_payload")
        if example is None:
            continue
        jsonschema.validate(instance=example, schema=comp["schema"])


@pytest.mark.django_db
def test_default_props_validate_against_own_schema(catalog):
    for name in catalog:
        comp = registry.get_component(name)
        assert comp is not None, name
        jsonschema.validate(instance=comp["default_props"], schema=comp["schema"])


@pytest.mark.django_db
def test_extra_props_are_rejected(catalog):
    comp = registry.get_component("Button")
    assert comp is not None
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance={"label": "x", "evil": True}, schema=comp["schema"])


@pytest.mark.django_db
def test_leaf_components_reject_children_in_trees(catalog):
    """allowed_children: [] means a leaf — nothing may nest inside it (D2.1)."""
    from apps.sites.validators import validate_tree

    for name in ("Button", "HeroSection", "FeatureGrid", "PricingTable"):
        errors = validate_tree({
            "id": "root", "component": name, "props": {},
            "children": [
                {"id": "inner", "component": "Button",
                 "props": {"label": "x"}, "children": []},
            ],
        })
        assert any("not allowed inside" in e["message"] for e in errors), name


@pytest.mark.django_db
def test_full_landing_page_tree_is_valid(catalog):
    """A realistic landing page assembled from the launch catalog must validate."""
    from apps.sites.validators import validate_tree

    tree = {
        "id": "root", "component": "Section", "props": {}, "children": [
            {"id": "n1", "component": "NavBar",
             "props": {"logo_text": "Acme",
                       "links": [{"label": "Features", "href": "/#features"}]},
             "children": []},
            {"id": "n2", "component": "HeroSection",
             "props": {"headline": "Hi", "cta_text": "Go", "cta_href": "/signup"},
             "children": []},
            {"id": "n3", "component": "FeatureGrid",
             "props": {"title": "F", "features": [
                 {"title": "A", "description": "B", "icon": "zap"}]},
             "children": []},
            {"id": "n4", "component": "FAQAccordion",
             "props": {"items": [{"question": "Q?", "answer": "A."}]},
             "children": []},
            {"id": "n5", "component": "Footer", "props": {"copyright": "© Acme"},
             "children": []},
        ],
    }
    assert validate_tree(tree) == []
