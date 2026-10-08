import uuid

from django.conf import settings
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
    published_branch = models.ForeignKey(
        "PublishBranch", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="published_as",
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
    # Page-level SEO (Phase 4 editor, page settings panel)
    meta_title = models.CharField(max_length=255, blank=True, default="")
    meta_description = models.TextField(blank=True, default="")
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


class PublishBranch(models.Model):
    """A published snapshot (branch) of a site. Figma-style naming — not Git."""

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        PUBLISHING = "publishing", "Publishing"
        PUBLISHED = "published", "Published"
        FAILED = "failed", "Failed"

    class Target(models.TextChoices):
        PLATFORM = "platform", "Platform hosting"
        ZIP = "zip", "ZIP download"

    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="publish_branches")
    name = models.CharField(max_length=100)
    tag = models.CharField(max_length=50, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED)
    target = models.CharField(max_length=20, choices=Target.choices, default=Target.PLATFORM)
    result_url = models.URLField(blank=True, default="")
    error_log = models.TextField(blank=True, default="")
    branch_snapshot = models.JSONField(default=dict)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="publish_branches"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "publish_branches"
        ordering = ["-created_at"]
        unique_together = ["site", "name"]

    def __str__(self) -> str:
        return f"{self.site.slug} / {self.name} ({self.status})"
