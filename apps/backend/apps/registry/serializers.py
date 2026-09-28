from rest_framework import serializers

from .models import Component


class ComponentListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Component
        fields = ["name", "display_name", "category", "description", "icon"]


class ComponentDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Component
        fields = [
            "name", "display_name", "category", "description", "icon",
            "schema", "default_props", "allowed_children", "example_payload",
        ]
