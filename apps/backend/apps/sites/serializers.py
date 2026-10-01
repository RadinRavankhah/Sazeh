from rest_framework import serializers

from .models import Page, Site
from .theme import validate_theme


class SiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = [
            "id", "workspace", "name", "slug", "status",
            "config", "created_at", "updated_at",
        ]
        # `workspace` is resolved server-side from the requester's memberships
        # (tenancy rule: never trusted from the request body). The optional
        # body hint is validated against writable workspaces in perform_create.
        read_only_fields = ["id", "workspace", "created_at", "updated_at"]

    def validate_config(self, value):
        if not isinstance(value, dict):
            return value
        theme = value.get("theme")
        if theme is None:
            return value
        if not isinstance(theme, dict):
            raise serializers.ValidationError({"theme": ["Theme must be an object."]})
        errors = validate_theme(theme)
        if errors:
            raise serializers.ValidationError({"theme": errors})
        return value


class PageSerializer(serializers.ModelSerializer):
    # `site` comes from the nested route (perform_create resolves it against
    # the requester's writable workspaces) — a body value is never used, so
    # the field is optional on input to satisfy validation only.
    site = serializers.PrimaryKeyRelatedField(required=False, queryset=Site.objects.all())

    class Meta:
        model = Page
        fields = [
            "id", "site", "title", "slug", "status",
            "meta_title", "meta_description",
            "tree", "parent", "order", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        # The auto UniqueTogetherValidator demands `site` in the request body;
        # the site is resolved *after* validation on the nested route, so
        # per-site slug uniqueness is checked in validate_slug (with the
        # site id injected into the serializer context by the view).
        validators: list[object] = []

    def validate_slug(self, value):
        site_id = self.context.get("site_id")
        if site_id is not None:
            qs = Page.objects.filter(site_id=site_id, slug=value)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    "A page with this address already exists on this site."
                )
        return value

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
