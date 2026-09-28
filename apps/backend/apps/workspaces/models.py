import uuid

from django.conf import settings
from django.db import models


class Workspace(models.Model):
    """The tenant isolation unit. Every Site, AgentSession, etc. belongs to one."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True, max_length=255)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_workspaces",
    )
    plan = models.CharField(
        max_length=20,
        default="free",
        choices=[("free", "Free"), ("pro", "Pro")],
    )
    credits_balance = models.IntegerField(default=50)  # Phase 9
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name


class WorkspaceMember(models.Model):
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspace_memberships",
    )
    role = models.CharField(
        max_length=20,
        default="owner",
        choices=[("owner", "Owner"), ("editor", "Editor"), ("viewer", "Viewer")],
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["workspace", "user"]

    def __str__(self) -> str:
        return f"{self.user.email} / {self.workspace.name} ({self.role})"
