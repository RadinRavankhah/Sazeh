from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Component
from .service import registry


@receiver(post_save, sender=Component)
@receiver(post_delete, sender=Component)
def invalidate_registry_cache(sender, **kwargs):
    registry.invalidate_cache()
