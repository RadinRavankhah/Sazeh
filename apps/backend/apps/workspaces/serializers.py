from rest_framework import serializers

from .models import Workspace, WorkspaceMember


class WorkspaceSerializer(serializers.ModelSerializer):
    owner_email = serializers.EmailField(source="owner.email", read_only=True)

    class Meta:
        model = Workspace
        fields = [
            "id", "name", "slug", "owner", "owner_email",
            "plan", "credits_balance", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "owner", "plan", "credits_balance", "created_at", "updated_at",
        ]


class WorkspaceMemberSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = ["id", "workspace", "user", "user_email", "role", "joined_at"]
        read_only_fields = ["id", "joined_at"]
