"""
Workspace tenancy helpers (dev plan v2 §10).

Isolation rule: the workspace is resolved from the authenticated user's
memberships and the object graph — never from request bodies or query
strings — and every queryset is filtered through membership.
"""
from typing import TYPE_CHECKING

from django.db.models import Q

from apps.workspaces.models import Workspace, WorkspaceMember

if TYPE_CHECKING:
    from rest_framework.request import Request


def member_workspaces(user):
    """Workspaces `user` belongs to (any role)."""
    return Workspace.objects.filter(memberships__user=user).distinct()


def writable_workspaces(user):
    """Workspaces where `user` is an owner or editor."""
    return Workspace.objects.filter(
        Q(owner=user)
        | Q(memberships__user=user, memberships__role__in=["owner", "editor"])
    ).distinct()


def resolve_workspace(obj):
    """Find the workspace an object belongs to.

    Handles: Workspace instances, objects with a `workspace` FK (Site),
    and objects reachable via `site.workspace` (Page, AgentSession).
    Returns None when unresolvable.
    """
    if isinstance(obj, Workspace):
        return obj
    ws = getattr(obj, "workspace", None)
    if ws is not None:
        return ws
    site = getattr(obj, "site", None)
    if site is not None:
        return getattr(site, "workspace", None)
    return None


def membership_role(user, workspace):
    """Return the user's role in the workspace, or None if not a member."""
    m = WorkspaceMember.objects.filter(workspace=workspace, user=user).first()
    return m.role if m else None


class WorkspaceScopedMixin:
    """Viewset mixin that scopes reads and writes to the requester's workspaces.

    Queryset scoping is the primary isolation mechanism (list endpoints never
    leak other tenants' rows); role-based object permissions additionally gate
    write operations.
    """

    # Provided by DRF's ViewSet at runtime; declared for type checkers.
    request: "Request"

    def get_member_workspaces(self):
        return member_workspaces(self.request.user)

    def get_writable_workspaces(self):
        return writable_workspaces(self.request.user)
