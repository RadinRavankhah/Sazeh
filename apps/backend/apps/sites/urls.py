from rest_framework_nested.routers import DefaultRouter, NestedSimpleRouter

from .views import PageViewSet, SiteViewSet

# Note: Using nested routing.  If you don't want drf-nested-routers,
# you can wire these manually (see alternate below).

router = DefaultRouter()
router.register(r"sites", SiteViewSet, basename="site")

# Nested: /sites/{site_pk}/pages/{pk}/
sites_router = NestedSimpleRouter(router, r"sites", lookup="site")
sites_router.register(r"pages", PageViewSet, basename="site-pages")

urlpatterns = router.urls + sites_router.urls
