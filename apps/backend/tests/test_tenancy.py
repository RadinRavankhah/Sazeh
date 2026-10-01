"""Tenancy isolation and permission regression tests (dev plan v2 §10).

These lock down the IDOR / privilege-escalation bugs found in the first
audit: no cross-workspace reads, writes gated by role, workspace deletion
owner-only.
"""
import pytest

# ---------------------------------------------------------------------------
# Signup signal
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_signup_creates_personal_workspace(user_a):
    ws = user_a.owned_workspaces.get()
    assert ws.owner == user_a
    assert list(ws.memberships.values_list("user_id", "role")) == [(user_a.id, "owner")]


@pytest.mark.django_db
def test_workspace_slugs_do_not_collide(user_a, user_b):
    slug_a = user_a.owned_workspaces.get().slug
    slug_b = user_b.owned_workspaces.get().slug
    assert slug_a != slug_b


# ---------------------------------------------------------------------------
# Cross-tenant reads (IDOR regressions)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_site_list_only_shows_own_workspaces(api, user_a, user_b, site_a):
    api.force_authenticate(user=user_b)
    resp = api.get("/api/v1/sites/")
    ids = {row["id"] for row in resp.data["results"]}
    assert str(site_a.id) not in ids


@pytest.mark.django_db
def test_site_detail_of_other_tenant_is_404(api, user_b, site_a):
    api.force_authenticate(user=user_b)
    resp = api.get(f"/api/v1/sites/{site_a.id}/")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_page_list_of_other_tenant_site_is_404(api, user_b, site_a):
    # The old code filtered by bare site_pk — this is the IDOR regression test.
    # Regression (2026-09-30): the SiteViewSet.pages action shadowed the nested
    # PageViewSet list and returned a bare array, breaking the SPA's preview
    # and editor ("This site doesn't exist") even for owners. The nested list
    # serves the collection now: paginated, membership-404 for outsiders.
    api.force_authenticate(user=user_b)
    resp = api.get(f"/api/v1/sites/{site_a.id}/pages/")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_page_list_for_owner_is_paginated_envelope(api, user_a, site_a, page_a):
    api.force_authenticate(user=user_a)
    resp = api.get(f"/api/v1/sites/{site_a.id}/pages/")
    assert resp.status_code == 200
    assert resp.data["count"] == 1
    assert resp.data["results"][0]["id"] == str(page_a.id)


@pytest.mark.django_db
def test_page_create_via_nested_route(api, user_a, site_a, seeded_registry):
    api.force_authenticate(user=user_a)
    resp = api.post(
        f"/api/v1/sites/{site_a.id}/pages/",
        {"title": "Pricing", "slug": "pricing",
         "tree": {"id": "root", "component": "Section", "props": {}, "children": []}},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["slug"] == "pricing"


@pytest.mark.django_db
def test_page_detail_of_other_tenant_is_404(api, user_b, site_a, page_a):
    api.force_authenticate(user=user_b)
    resp = api.get(f"/api/v1/sites/{site_a.id}/pages/{page_a.id}/")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_tree_patch_of_other_tenant_is_404(api, user_b, site_a, page_a):
    api.force_authenticate(user=user_b)
    resp = api.post(
        f"/api/v1/sites/{site_a.id}/pages/{page_a.id}/tree/patch/",
        {"operations": [{"op": "delete", "node_id": "root"}]},
        format="json",
    )
    assert resp.status_code == 404


@pytest.mark.django_db
def test_site_create_into_foreign_workspace_is_404(api, user_b, user_a):
    api.force_authenticate(user=user_b)
    foreign_ws = str(user_a.owned_workspaces.get().id)
    resp = api.post(
        "/api/v1/sites/",
        {"name": "Evil", "slug": "evil", "workspace": foreign_ws},
        format="json",
    )
    assert resp.status_code == 404


@pytest.mark.django_db
def test_workspace_id_query_param_is_ignored(api, user_b, user_a, site_a):
    # Old bug: ?workspace_id=<other tenant> leaked foreign sites.
    api.force_authenticate(user=user_b)
    foreign_ws = str(user_a.owned_workspaces.get().id)
    resp = api.get(f"/api/v1/sites/?workspace_id={foreign_ws}")
    ids = {row["id"] for row in resp.data["results"]}
    assert str(site_a.id) not in ids


# ---------------------------------------------------------------------------
# Role gating
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_editor_can_read_and_patch(api, editor_b, user_a, site_a, page_a, seeded_registry):
    api.force_authenticate(user=editor_b)
    assert api.get(f"/api/v1/sites/{site_a.id}/").status_code == 200
    resp = api.post(
        f"/api/v1/sites/{site_a.id}/pages/{page_a.id}/tree/patch/",
        {"operations": [{"op": "insert", "parent_id": "root", "index": 0,
                         "component": "Button", "props": {"label": "Hi"}}]},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["tree"]["children"][0]["component"] == "Button"


@pytest.mark.django_db
def test_owner_only_can_delete_workspace(api, editor_b, user_a, site_a):
    api.force_authenticate(user=editor_b)
    ws_id = user_a.owned_workspaces.get().id
    resp = api.delete(f"/api/v1/workspaces/{ws_id}/")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_owner_can_delete_workspace(api, user_a, site_a):
    api.force_authenticate(user=user_a)
    ws_id = user_a.owned_workspaces.get().id
    resp = api.delete(f"/api/v1/workspaces/{ws_id}/")
    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Tree patch endpoint behavior
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_tree_patch_validates_against_registry(api, user_a, site_a, page_a):
    api.force_authenticate(user=user_a)
    resp = api.post(
        f"/api/v1/sites/{site_a.id}/pages/{page_a.id}/tree/patch/",
        {"operations": [{"op": "insert", "parent_id": "root", "index": 0,
                         "component": "NotAComponent", "props": {}}]},
        format="json",
    )
    assert resp.status_code == 422
    assert resp.data["error"] == "Validation failed after patch"


@pytest.mark.django_db
def test_tree_patch_rejects_unknown_ops(api, user_a, site_a, page_a):
    api.force_authenticate(user=user_a)
    resp = api.post(
        f"/api/v1/sites/{site_a.id}/pages/{page_a.id}/tree/patch/",
        {"operations": [{"op": "teleport", "node_id": "root"}]},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_tree_get_roundtrip(api, user_a, site_a, page_a):
    api.force_authenticate(user=user_a)
    resp = api.get(f"/api/v1/sites/{site_a.id}/pages/{page_a.id}/tree/")
    assert resp.status_code == 200
    assert resp.data["tree"]["id"] == "root"
