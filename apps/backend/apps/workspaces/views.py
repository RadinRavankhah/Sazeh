from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import WorkspaceMember
from .permissions import IsWorkspaceOwner
from .scoping import WorkspaceScopedMixin
from .serializers import WorkspaceMemberSerializer, WorkspaceSerializer


class WorkspaceViewSet(WorkspaceScopedMixin, viewsets.ModelViewSet):
    serializer_class = WorkspaceSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        # Updating/deleting a workspace is owner-only (members can only view).
        if self.action in {"update", "partial_update", "destroy"}:
            return [IsWorkspaceOwner()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return self.get_member_workspaces()

    def perform_create(self, serializer):
        ws = serializer.save(owner=self.request.user)
        # Auto-create owner membership
        WorkspaceMember.objects.create(
            workspace=ws, user=self.request.user, role="owner"
        )

    @action(detail=True, methods=["get", "post", "delete"])
    def members(self, request, pk=None):
        ws = self.get_object()  # already scoped to the requester's memberships

        if request.method == "GET":
            qs = ws.memberships.select_related("user")
            return Response(WorkspaceMemberSerializer(qs, many=True).data)

        # Writes below are owner-only
        if not IsWorkspaceOwner().has_object_permission(request, self, ws):
            return Response(
                {"detail": "Only the workspace owner can manage members."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if request.method == "POST":
            # New members always join as editors; ownership is not grantable here.
            serializer = WorkspaceMemberSerializer(
                data={**request.data, "workspace": str(ws.id), "role": "editor"},
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        # DELETE — remove a member
        membership = get_object_or_404(ws.memberships, user_id=request.data.get("user_id"))
        if membership.role == "owner":
            return Response({"detail": "Cannot remove the owner."}, status=400)
        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
