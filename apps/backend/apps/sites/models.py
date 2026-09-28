import uuid

from django.db import models

from apps.workspaces.models import Workspace


class Site(models.Model):
    """A website project. Belongs to one workspace."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="sites"
    )
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    # Global theme / config tokens: colors, fonts, favicon, SEO meta, etc.
    config = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["workspace", "slug"]
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"{self.name} ({self.workspace.slug})"


class Page(models.Model):
    """A single page within a site.  The `tree` field holds the recursive component structure."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="pages")
    title = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    # The component tree — a recursive JSON structure:
    # { "component": "Section", "id": "uuid", "props": {...}, "children": [...] }
    tree = models.JSONField(default=dict)
    # Optional parent for nested pages (Phase 4+)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children"
    )
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["site", "slug"]
        ordering = ["order", "created_at"]

    def __str__(self) -> str:
        return f"{self.title} [{self.site.name}]"
