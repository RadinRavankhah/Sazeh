"""Agent tool layer: structured results, validation self-healing, tenancy."""
import pytest

from apps.agent.tools import execute_tool, tool_definitions
from apps.sites.models import Page


@pytest.fixture
def session(user_a, site_a, page_a, seeded_registry):
    from apps.agent.models import AgentSession

    return AgentSession.objects.create(
        workspace=site_a.workspace, site=site_a, page=page_a, title="t"
    )


def test_tool_definitions_are_wellformed():
    defs = tool_definitions()
    names = [d["function"]["name"] for d in defs]
    assert names == [
        "list_components", "get_component", "get_page",
        "create_page", "patch_page_tree", "set_site_theme",
    ]
    for d in defs:
        assert d["type"] == "function"
        assert "parameters" in d["function"]


def test_list_components(session):
    result, _ = execute_tool(session, "list_components", "{}")
    assert result["ok"] is True
    assert len(result["components"]) == 15


def test_list_components_filter(session):
    result, _ = execute_tool(session, "list_components", '{"category": "composite"}')
    assert result["ok"] is True
    assert {c["category"] for c in result["components"]} == {"composite"}


def test_get_component(session):
    result, _ = execute_tool(session, "get_component", '{"name": "HeroSection"}')
    assert result["ok"] is True
    assert result["component"]["schema"]["required"] == ["headline", "cta_text", "cta_href"]
    assert result["component"]["example_payload"]["headline"]


def test_get_component_unknown(session):
    result, _ = execute_tool(session, "get_component", '{"name": "Nope"}')
    assert result["ok"] is False
    assert result["code"] == "not_found"


def test_bad_json_args_are_validation_errors(session):
    result, _ = execute_tool(session, "list_components", "{not json")
    assert result["ok"] is False
    assert result["code"] == "validation_error"


def test_unknown_tool(session):
    result, _ = execute_tool(session, "teleport_page", "{}")
    assert result["ok"] is False
    assert result["code"] == "validation_error"


def test_get_page(session, page_a):
    result, _ = execute_tool(session, "get_page", f'{{"page_id": "{page_a.id}"}}')
    assert result["ok"] is True
    assert result["page"]["tree"]["component"] == "Section"


def test_get_page_rejects_foreign_site_page(session, user_b, site_a, page_a, seeded_registry):
    """Page ids from another workspace's site are 'not found' — never a leak."""
    from apps.sites.models import Site
    from apps.workspaces.models import Workspace

    ws_b = Workspace.objects.create(name="B", slug="b-ws", owner=user_b)
    foreign_site = Site.objects.create(workspace=ws_b, name="B site", slug="b-site")
    foreign_page = Page.objects.create(
        site=foreign_site, title="Foreign", slug="home",
        tree={"id": "root", "component": "Section", "props": {}, "children": []},
    )
    result, _ = execute_tool(session, "get_page", f'{{"page_id": "{foreign_page.id}"}}')
    assert result["ok"] is False
    assert result["code"] == "not_found"


def test_patch_page_tree_happy(session, page_a):
    ops = '[{"op": "insert", "parent_id": "root", "component": "Button", "props": {"label": "Hi"}}]'
    args = f'{{"page_id": "{page_a.id}", "operations": {ops}}}'
    result, snapshot = execute_tool(session, "patch_page_tree", args)
    assert result["ok"] is True
    assert snapshot is not None and snapshot["children"] == []
    page_a.refresh_from_db()
    assert page_a.tree["children"][0]["props"]["label"] == "Hi"


def test_patch_page_tree_unknown_component(session, page_a):
    ops = '[{"op": "insert", "parent_id": "root", "component": "MegaWidget", "props": {}}]'
    args = f'{{"page_id": "{page_a.id}", "operations": {ops}}}'
    result, _ = execute_tool(session, "patch_page_tree", args)
    assert result["ok"] is False
    assert result["code"] == "validation_error"
    page_a.refresh_from_db()
    assert page_a.tree["children"] == []  # tree untouched


def test_patch_page_tree_bad_op(session, page_a):
    args = f'{{"page_id": "{page_a.id}", "operations": [{{"op": "teleport"}}]}}'
    result, _ = execute_tool(session, "patch_page_tree", args)
    assert result["ok"] is False
    assert result["code"] == "validation_error"


def test_patch_page_tree_foreign_page_id(session, page_a, user_b, seeded_registry):
    """A page id from another workspace's site is 'not found'."""
    import uuid

    from apps.sites.models import Site
    from apps.workspaces.models import Workspace

    ws_b = Workspace.objects.create(
        name="B", slug=f"b-{uuid.uuid4().hex[:8]}", owner=user_b
    )
    foreign_site = Site.objects.create(workspace=ws_b, name="B site", slug="b-site")
    foreign_page = Page.objects.create(
        site=foreign_site, title="Foreign", slug="home",
        tree={"id": "root", "component": "Section", "props": {}, "children": []},
    )
    args = (
        f'{{"page_id": "{foreign_page.id}", '
        f'"operations": [{{"op": "delete", "node_id": "root"}}]}}'
    )
    result, _ = execute_tool(session, "patch_page_tree", args)
    assert result["ok"] is False
    assert result["code"] == "not_found"


def test_create_page_and_slug_collision(session, site_a):
    result, _ = execute_tool(
        session, "create_page",
        '{"title": "About", "slug": "about"}',
    )
    assert result["ok"] is True
    assert Page.objects.filter(site=site_a, slug="about").exists()

    result, _ = execute_tool(
        session, "create_page",
        '{"title": "About 2", "slug": "about"}',
    )
    assert result["ok"] is False
    assert "already exists" in result["error"]


def test_create_page_rejects_invalid_tree(session):
    bad_tree = '{"id": "root", "component": "Nope", "props": {}, "children": []}'
    result, _ = execute_tool(
        session, "create_page",
        f'{{"title": "Bad", "slug": "bad", "tree": {bad_tree}}}',
    )
    assert result["ok"] is False
    assert result["code"] == "validation_error"


def test_set_site_theme(session, site_a):
    result, _ = execute_tool(
        session, "set_site_theme",
        '{"theme": {"accent_color": "#0a84ff", "radius": "lg"}}',
    )
    assert result["ok"] is True
    site_a.refresh_from_db()
    assert site_a.config["theme"]["accent_color"] == "#0a84ff"


def test_set_site_theme_rejects_bad_token(session, site_a):
    result, _ = execute_tool(
        session, "set_site_theme",
        '{"theme": {"accent_color": "blue"}}',
    )
    assert result["ok"] is False
    site_a.refresh_from_db()
    assert "theme" not in site_a.config
