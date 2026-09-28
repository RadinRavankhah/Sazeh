from rest_framework.permissions import BasePermission

from .scoping import membership_role, resolve_workspace


def _role(request, obj):
    ws = resolve_workspace(obj)
    if ws is None:
        return None
    return membership_role(request.user, ws)


class IsWorkspaceOwner(BasePermission):
    """Object permission: requester is the workspace owner.

    Works for Workspace objects and anything resolvable to one
    (Site -> workspace, Page -> site.workspace).
    """

    def has_object_permission(self, request, view, obj):
        return _role(request, obj) == "owner"


class IsWorkspaceEditorOrAbove(BasePermission):
    def has_object_permission(self, request, view, obj):
        return _role(request, obj) in ("owner", "editor")


class IsWorkspaceMember(BasePermission):
    def has_object_permission(self, request, view, obj):
        return _role(request, obj) is not None
