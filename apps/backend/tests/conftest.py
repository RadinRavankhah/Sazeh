"""Shared fixtures. Test isolation (SQLite in-memory, LocMem cache) is
configured in config/settings_test.py — keep this file thin."""
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.sites.models import Page, Site
from apps.workspaces.models import WorkspaceMember


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def seeded_registry(db):
    from django.core.management import call_command

    call_command("seed_components")


def make_user(email):
    local_part = email.split("@")[0]
    return User.objects.create_user(
        email=email, password="test-pass-123", username=local_part
    )


@pytest.fixture
def user_a(db):
    return make_user("a@example.com")


@pytest.fixture
def user_b(db):
    return make_user("b@example.com")


@pytest.fixture
def editor_b(user_a):
    """user_b as an *editor* inside user_a's workspace (for role tests)."""
    user = make_user("editor-b@example.com")
    WorkspaceMember.objects.create(
        workspace=user_a.owned_workspaces.get(), user=user, role="editor"
    )
    return user


@pytest.fixture
def site_a(user_a):
    site = Site.objects.create(
        workspace=user_a.owned_workspaces.get(), name="A Site", slug="a-site"
    )
    Page.objects.create(
        site=site, title="Home", slug="home",
        tree={"id": "root", "component": "Section", "props": {}, "children": []},
    )
    return site


@pytest.fixture
def page_a(site_a):
    return site_a.pages.get(slug="home")
