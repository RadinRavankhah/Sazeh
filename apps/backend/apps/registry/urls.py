from django.urls import path

from .views import ComponentDetailView, ComponentListView

urlpatterns = [
    path("registry/components/", ComponentListView.as_view(), name="component-list"),
    path(
        "registry/components/<str:name>/",
        ComponentDetailView.as_view(),
        name="component-detail",
    ),
]
