from rest_framework_nested.routers import DefaultRouter, NestedSimpleRouter

from .views import PageViewSet, PublishBranchViewSet, SiteViewSet

router = DefaultRouter()
router.register(r"sites", SiteViewSet, basename="site")

sites_router = NestedSimpleRouter(router, r"sites", lookup="site")
sites_router.register(r"pages", PageViewSet, basename="site-pages")
sites_router.register(r"publish/branches", PublishBranchViewSet, basename="site-publish-branches")

urlpatterns = router.urls + sites_router.urls
