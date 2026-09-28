from django.apps import AppConfig


class SitesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.sites"
    label = "sazeh_sites"
    verbose_name = "Sites & Pages"
