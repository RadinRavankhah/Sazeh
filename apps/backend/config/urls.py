from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("_allauth/", include("allauth.headless.urls")),
    path("api/v1/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.workspaces.urls")),
    path("api/v1/", include("apps.registry.urls")),
    path("api/v1/", include("apps.sites.urls")),
    path("api/v1/agent/", include("apps.agent.urls")),
]
