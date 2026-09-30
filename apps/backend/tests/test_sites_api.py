"""Sites API behavior: default-workspace resolution and theme validation."""
import pytest

from apps.sites.models import Site
from apps.workspaces.models import Workspace, WorkspaceMember

SITE_URL = "/api/v1/sites/"


# ---------------------------------------------------------------------------
# Default workspace resolution on create
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_site_create_without_workspace_lands_in_default(api, user_a):
    api.force_authenticate(user=user_a)
    resp = api.post(SITE_URL, {"name": "My Site", "slug": "my-site"}, format="json")
    assert resp.status_code == 201
    assert user_a.owned_workspaces.get().id == resp.data["workspace"]


@pytest.mark.django_db
def test_site_create_creates_default_home_page(api, user_a):
    api.force_authenticate(user=user_a)
    resp = api.post(SITE_URL, {"name": "My Site", "slug": "my-site"}, format="json")
    site = Site.objects.get(pk=resp.data["id"])
    page = site.pages.get(slug="home")
    assert page.tree["component"] == "Section"


@pytest.mark.django_db
def test_site_create_for_user_without_workspace(api, user_a):
    """Users created before the signup signal existed get a workspace on demand."""
    Workspace.objects.filter(owner=user_a).delete()
    api.force_authenticate(user=user_a)
    resp = api.post(SITE_URL, {"name": "Late", "slug": "late"}, format="json")
    assert resp.status_code == 201
    ws = user_a.owned_workspaces.get()
    assert ws.id == resp.data["workspace"]


@pytest.mark.django_db
def test_me_returns_default_workspace_after_ensure(api, user_a):
    Workspace.objects.filter(owner=user_a).delete()
    api.force_authenticate(user=user_a)
    assert api.get("/api/v1/me/").data["default_workspace"] is None
    api.post(SITE_URL, {"name": "Late", "slug": "late"}, format="json")
    me = api.get("/api/v1/me/").data
    assert me["default_workspace"] is not None
    assert me["default_workspace"]["id"] == str(user_a.owned_workspaces.get().id)


@pytest.mark.django_db
def test_workspace_body_hint_targets_writable_workspace(api, user_a, user_b):
    """An explicit workspace hint works when the requester can write there."""
    WorkspaceMember.objects.create(
        workspace=user_a.owned_workspaces.get(), user=user_b, role="editor"
    )
    api.force_authenticate(user=user_b)
    resp = api.post(
        SITE_URL,
        {"name": "Hinted", "slug": "hinted",
         "workspace": str(user_a.owned_workspaces.get().id)},
        format="json",
    )
    assert resp.status_code == 201
    assert user_a.owned_workspaces.get().id == resp.data["workspace"]


# ---------------------------------------------------------------------------
# Theme validation on config writes
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_site_patch_rejects_invalid_theme(api, user_a, site_a):
    api.force_authenticate(user=user_a)
    resp = api.patch(
        f"{SITE_URL}{site_a.id}/",
        {"config": {"theme": {"accent_color": "not-a-color"}}},
        format="json",
    )
    assert resp.status_code == 400
    assert "theme" in resp.data["config"]


@pytest.mark.django_db
def test_site_patch_rejects_unknown_theme_token(api, user_a, site_a):
    api.force_authenticate(user=user_a)
    resp = api.patch(
        f"{SITE_URL}{site_a.id}/",
        {"config": {"theme": {"accent_color": "#ff0000", "brand_voice": "friendly"}}},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_site_patch_accepts_valid_theme(api, user_a, site_a):
    api.force_authenticate(user=user_a)
    resp = api.patch(
        f"{SITE_URL}{site_a.id}/",
        {"config": {"theme": {
            "accent_color": "#0a84ff", "font_family": "geist",
            "radius": "lg", "heading_scale": "compact",
        }}},
        format="json",
    )
    assert resp.status_code == 200
    site_a.refresh_from_db()
    assert site_a.config["theme"]["accent_color"] == "#0a84ff"


@pytest.mark.django_db
def test_site_patch_config_without_theme_is_untouched(api, user_a, site_a):
    api.force_authenticate(user=user_a)
    resp = api.patch(f"{SITE_URL}{site_a.id}/", {"config": {"seo": {}}}, format="json")
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Rename / delete
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_site_rename_keeps_slug(api, user_a, site_a):
    api.force_authenticate(user=user_a)
    resp = api.patch(f"{SITE_URL}{site_a.id}/", {"name": "Renamed"}, format="json")
    assert resp.status_code == 200
    assert resp.data["name"] == "Renamed"
    assert resp.data["slug"] == "a-site"


@pytest.mark.django_db
def test_site_delete(api, user_a, site_a):
    api.force_authenticate(user=user_a)
    resp = api.delete(f"{SITE_URL}{site_a.id}/")
    assert resp.status_code == 204
    assert not Site.objects.filter(pk=site_a.id).exists()


# ---------------------------------------------------------------------------
# Tree patch: subtree insert (duplicate/paste)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_tree_patch_insert_with_children_reassigns_ids(
    api, user_a, site_a, page_a, seeded_registry,
):
    api.force_authenticate(user=user_a)
    ops = [{
        "op": "insert", "parent_id": page_a.tree["id"], "component": "Section",
        "props": {}, "children": [
            {"component": "Heading", "props": {"text": "Duplicated"},
             "children": []},
        ],
    }]
    resp = api.post(
        f"{SITE_URL}{site_a.id}/pages/{page_a.id}/tree/patch/",
        {"operations": ops}, format="json",
    )
    assert resp.status_code == 200
    section = resp.data["tree"]["children"][0]
    assert section["component"] == "Section"
    assert section["id"] != section["children"][0]["id"]
    assert section["children"][0]["props"]["text"] == "Duplicated"


@pytest.mark.django_db
def test_tree_patch_insert_subtree_unknown_component_rejected(
    api, user_a, site_a, page_a, seeded_registry,
):
    """A subtree referencing a component outside the registry fails validation."""
    api.force_authenticate(user=user_a)
    ops = [{
        "op": "insert", "parent_id": page_a.tree["id"], "component": "Section",
        "children": [{"component": "Nope", "children": []}],
    }]
    resp = api.post(
        f"{SITE_URL}{site_a.id}/pages/{page_a.id}/tree/patch/",
        {"operations": ops}, format="json",
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Page SEO fields
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_page_patch_seo_fields(api, user_a, site_a, page_a):
    api.force_authenticate(user=user_a)
    resp = api.patch(
        f"{SITE_URL}{site_a.id}/pages/{page_a.id}/",
        {"meta_title": "Home — Sazeh", "meta_description": "Landing page"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["meta_title"] == "Home — Sazeh"
    page_a.refresh_from_db()
    assert page_a.meta_description == "Landing page"

