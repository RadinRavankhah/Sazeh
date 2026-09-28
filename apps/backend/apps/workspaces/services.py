"""Workspace services shared by signals, views, and API flows."""
from __future__ import annotations

from typing import TYPE_CHECKING

from django.utils.text import slugify

from .models import Workspace, WorkspaceMember

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractBaseUser


def unique_workspace_slug(base: str) -> str:
    slug = slugify(base) or "workspace"
    candidate, i = slug, 2
    while Workspace.objects.filter(slug=candidate).exists():
        candidate = f"{slug}-{i}"
        i += 1
    return candidate


def ensure_default_workspace(user: AbstractBaseUser) -> Workspace:
    """Return the user's personal workspace, creating it if missing.

    The signup signal covers every *new* user; this covers users created
    before the signal existed (superusers made during setup, fixtures) and
    any membership-less edge case. Idempotent by construction.
    """
    existing = user.owned_workspaces.first() or Workspace.objects.filter(
        memberships__user=user
    ).first()
    if existing is not None:
        return existing

    base = user.get_full_name() or user.email.split("@")[0] or "workspace"
    workspace = Workspace.objects.create(
        name=f"{base}'s Workspace",
        slug=unique_workspace_slug(base),
        owner=user,
    )
    WorkspaceMember.objects.create(workspace=workspace, user=user, role="owner")
    return workspace
