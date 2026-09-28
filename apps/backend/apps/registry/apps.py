from django.apps import AppConfig


class RegistryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.registry"
    verbose_name = "Component Registry"

    def ready(self):
        from . import signals  # noqa: F401  (registers cache invalidation)
