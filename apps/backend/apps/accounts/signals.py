from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.workspaces.services import ensure_default_workspace


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_personal_workspace(sender, instance, created, **kwargs):
    """Every new user gets a personal workspace (dev plan v2 §10 / Phase 1)."""
    if created:
        ensure_default_workspace(instance)
