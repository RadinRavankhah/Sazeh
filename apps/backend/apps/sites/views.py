from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.workspaces.permissions import IsWorkspaceEditorOrAbove
from apps.workspaces.scoping import WorkspaceScopedMixin
from apps.workspaces.services import ensure_default_workspace

from .models import Page, PublishBranch, Site
from .serializers import (
    PageSerializer,
    PublishBranchSerializer,
    SiteSerializer,
    TreePatchInputSerializer,
)
from .services import build_bundle, upload_to_vps
from .tasks import publish_site
from .tree import TreePatchService
from .validators import validate_tree

# Actions that mutate a workspace's content require editor role or above;
# reads only require membership (enforced by queryset scoping).
WRITE_ACTIONS = {"update", "partial_update", "destroy", "tree_patch"}


class SiteViewSet(WorkspaceScopedMixin, viewsets.ModelViewSet):
    serializer_class = SiteSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        write = self.action in WRITE_ACTIONS
        if write:
            return [IsWorkspaceEditorOrAbove()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return Site.objects.filter(
            workspace__in=self.get_member_workspaces()
        ).distinct()

    def perform_create(self, serializer):
        # Target workspace: an optional body hint, resolved against the
        # requester's *writable* workspaces (a non-member gets a 404, never
        # access); when omitted, the user's personal workspace (created on
        # the fly if missing).
        workspace_hint = self.request.data.get("workspace")
        if workspace_hint:
            workspace = get_object_or_404(
                self.get_writable_workspaces(), pk=workspace_hint
            )
        else:
            workspace = ensure_default_workspace(self.request.user)
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


class PageViewSet(WorkspaceScopedMixin, viewsets.ModelViewSet):
    serializer_class = PageSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in WRITE_ACTIONS:
            return [IsWorkspaceEditorOrAbove()]
        return [IsAuthenticated()]

    def get_queryset(self):
        # Resolve the site against the requester's memberships first: a
        # foreign site is a 404 (tenancy floor), never an empty 200 — this is
        # the list-route sibling of the detail routes' scoping.
        site = get_object_or_404(
            Site,
            pk=self.kwargs.get("site_pk"),
            workspace__in=self.get_member_workspaces(),
        )
        return Page.objects.filter(site=site)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        # Lets validate_slug scope uniqueness to this site (the site itself
        # is resolved server-side, never taken from the body).
        context["site_id"] = self.kwargs.get("site_pk")
        return context

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

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, site_pk=None, pk=None):
        """Trigger a publish: creates a branch, builds the bundle, uploads."""
        site = self.get_object()
        name = request.data.get("name", "main")
        tag = request.data.get("tag", "")
        target = request.data.get("target", "platform")
        branch = PublishBranch.objects.create(
            site=site,
            name=name,
            tag=tag,
            target=target,
            created_by=request.user,
        )
        publish_site.delay(branch.id)
        return Response(PublishBranchSerializer(branch).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="publish/branches")
    def branches(self, request, site_pk=None, pk=None):
        """List all branches for a site."""
        site = self.get_object()
        qs = PublishBranch.objects.filter(site=site).order_by("-created_at")
        return Response(PublishBranchSerializer(qs, many=True).data)


class PublishBranchViewSet(WorkspaceScopedMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = PublishBranchSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        site = get_object_or_404(
            Site,
            pk=self.kwargs.get("site_pk"),
            workspace__in=self.get_member_workspaces(),
        )
        return PublishBranch.objects.filter(site=site)

    @action(detail=True, methods=["post"], url_path="rollback")
    def rollback(self, request, site_pk=None, pk=None):
        branch = self.get_object()
        publish_site.delay(branch.id)
        return Response(PublishBranchSerializer(branch).data)

    @action(detail=True, methods=["post"], url_path="merge")
    def merge(self, request, site_pk=None, pk=None):
        branch = self.get_object()
        if branch.status != PublishBranch.Status.PUBLISHED:
            return Response(
                {"error": "Only published branches can be merged."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        branch.site.published_branch = branch
        branch.site.status = Site.Status.PUBLISHED
        branch.site.save(update_fields=["published_branch", "status"])
        return Response(PublishBranchSerializer(branch).data)
