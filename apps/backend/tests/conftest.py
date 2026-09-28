"""Shared fixtures. Test isolation (SQLite in-memory, LocMem cache) is
configured in config/settings_test.py — keep this file thin."""
import pytest

from apps.accounts.models import User


@pytest.fixture
def api():
    from rest_framework.test import APIClient

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
