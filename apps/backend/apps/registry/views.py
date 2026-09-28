from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import IsAuthenticated

from .models import Component
from .serializers import ComponentDetailSerializer, ComponentListSerializer


class ComponentListView(ListAPIView):
    queryset = Component.objects.all()
    serializer_class = ComponentListSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["category"]
    search_fields = ["name", "display_name", "description"]


class ComponentDetailView(RetrieveAPIView):
    queryset = Component.objects.all()
    serializer_class = ComponentDetailSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "name"
