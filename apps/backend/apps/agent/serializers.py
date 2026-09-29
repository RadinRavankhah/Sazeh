from rest_framework import serializers

from .models import AgentMessage, AgentRun, AgentSession


class AgentSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentSession
        fields = ["id", "site", "page", "title", "status", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class AgentMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentMessage
        fields = ["id", "role", "content", "tokens_in", "tokens_out", "created_at"]
        read_only_fields = ["id", "created_at"]


class AgentRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentRun
        fields = [
            "id", "session", "page", "status", "finish_reason",
            "model_name", "turns", "tokens_in", "tokens_out",
            "started_at", "finished_at",
        ]
        read_only_fields = ["id", "started_at", "finished_at"]


class PostMessageSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=8_000)
    page = serializers.UUIDField(required=False, allow_null=True)
