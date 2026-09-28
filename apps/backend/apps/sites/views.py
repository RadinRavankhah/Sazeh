from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.workspaces.permissions import IsWorkspaceEditorOrAbove
from apps.workspaces.scoping import WorkspaceScopedMixin

from .models import Page, Site
from .serializers import (
    PageSerializer,
    SiteSerializer,
    TreePatchInputSerializer,
)
from .tree import TreePatchService
from .validators import validate_tree

# Actions that mutate a workspace's content require editor role or above;
# reads only require membership (enforced by queryset scoping).
WRITE_ACTIONS = {"update", "partial_update", "destroy", "tree_patch"}


class SiteViewSet(WorkspaceScopedMixin, viewsets.ModelViewSet):
    serializer_class = SiteSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        write = self.action in WRITE_ACTIONS or (
            self.action == "pages" and self.request.method == "POST"
        )
        if write:
            return [IsWorkspaceEditorOrAbove()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return Site.objects.filter(
            workspace__in=self.get_member_workspaces()
        ).distinct()

    def perform_create(self, serializer):
        # Target workspace comes from the request body (it is the parent being
        # created into), but is resolved against the requester's *writable*
        # workspaces — a non-member gets a 404, never access.
        workspace = get_object_or_404(
            self.get_writable_workspaces(),
            pk=self.request.data.get("workspace"),
        )
        site = serializer.save(workspace=workspace)
        # Create a default empty page tree when creating a site
        Page.objects.create(
            site=site,
            title="Home",
            slug="home",
            tree={
                "id": "root",
                "component": "Section",
                "props": {"padding": "md", "container_width": "contained"},
                "children": [],
            },
        )

    @action(detail=True, methods=["get", "post"])
    def pages(self, request, pk=None):
        site = self.get_object()
        if request.method == "GET":
            qs = site.pages.all()
            return Response(PageSerializer(qs, many=True).data)
        serializer = PageSerializer(data={**request.data, "site": str(site.id)})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PageViewSet(WorkspaceScopedMixin, viewsets.ModelViewSet):
    serializer_class = PageSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in WRITE_ACTIONS:
            return [IsWorkspaceEditorOrAbove()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return Page.objects.filter(
            site_id=self.kwargs.get("site_pk"),
            site__workspace__in=self.get_member_workspaces(),
        ).distinct()

    def perform_create(self, serializer):
        site = get_object_or_404(
            Site.objects.filter(workspace__in=self.get_writable_workspaces()),
            pk=self.kwargs["site_pk"],
        )
        serializer.save(site=site)

    @action(detail=True, methods=["post"], url_path="tree/patch")
    def tree_patch(self, request, site_pk=None, pk=None):
        """Apply atomic patches to the page's component tree."""
        page = self.get_object()
        input_ser = TreePatchInputSerializer(data=request.data)
        input_ser.is_valid(raise_exception=True)
        operations = input_ser.validated_data["operations"]

        # Snapshot before
        tree_before = page.tree

        try:
            new_tree = TreePatchService.apply_patch(page.tree, operations)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Validate the new tree
        errors = validate_tree(new_tree)
        if errors:
            return Response(
                {"error": "Validation failed after patch", "details": errors},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        page.tree = new_tree
        page.save(update_fields=["tree", "updated_at"])
        return Response({
            "id": str(page.id),
            "tree": page.tree,
            "tree_before": tree_before,
        })

    @action(detail=True, methods=["get"], url_path="tree")
    def get_tree(self, request, site_pk=None, pk=None):
        page = self.get_object()
        return Response({"id": str(page.id), "tree": page.tree})
