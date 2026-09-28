from rest_framework import serializers

from apps.workspaces.models import Workspace

from .models import User


class DefaultWorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ["id", "name", "slug", "plan", "credits_balance"]


class UserSerializer(serializers.ModelSerializer):
    default_workspace = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "username", "first_name", "last_name",
            "default_workspace",
        ]
        read_only_fields = ["id", "email", "default_workspace"]

    def get_default_workspace(self, obj) -> dict | None:
        ws = obj.owned_workspaces.first() or Workspace.objects.filter(
            memberships__user=obj
        ).first()
        return DefaultWorkspaceSerializer(ws).data if ws else None
