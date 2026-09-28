from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils.text import slugify

from apps.workspaces.models import Workspace, WorkspaceMember


def _unique_workspace_slug(base: str) -> str:
    slug = slugify(base) or "workspace"
    candidate, i = slug, 2
    while Workspace.objects.filter(slug=candidate).exists():
        candidate = f"{slug}-{i}"
        i += 1
    return candidate


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_personal_workspace(sender, instance, created, **kwargs):
    """Every new user gets a personal workspace (dev plan v2 §10 / Phase 1)."""
    if not created:
        return
    base = instance.get_full_name() or instance.email.split("@")[0]
    workspace = Workspace.objects.create(
        name=f"{base}'s Workspace",
        slug=_unique_workspace_slug(base),
        owner=instance,
    )
    WorkspaceMember.objects.create(
        workspace=workspace, user=instance, role="owner"
    )
