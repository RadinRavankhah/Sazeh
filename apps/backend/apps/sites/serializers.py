from rest_framework import serializers

from .models import Page, Site


class SiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = [
            "id", "workspace", "name", "slug", "status",
            "config", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class PageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Page
        fields = [
            "id", "site", "title", "slug", "status",
            "tree", "parent", "order", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_tree(self, value):
        from .validators import validate_tree
        errors = validate_tree(value)
        if errors:
            raise serializers.ValidationError({"tree_validation_errors": errors})
        return value


class TreePatchInputSerializer(serializers.Serializer):
    operations = serializers.ListField(
        child=serializers.DictField(),
        min_length=1,
        help_text="List of atomic tree operations: update_props, insert, delete, move.",
    )
