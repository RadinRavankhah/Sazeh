import uuid

from django.db import models

from apps.workspaces.models import Workspace


class UsageEvent(models.Model):
    """One metered consumption unit (dev plan v2 §5).

    Written by the orchestrator (llm_tokens), later by publishing and media.
    Billing reconciliation reads these in Phase 9 — the event is written when
    consumption happens, independent of any billing logic.
    """

    class Kind(models.TextChoices):
        LLM_TOKENS = "llm_tokens", "LLM tokens"
        PUBLISH = "publish", "Publish"
        MEDIA_STORAGE = "media_storage", "Media storage"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="usage_events"
    )
    kind = models.CharField(max_length=32, choices=Kind.choices)
    amount = models.IntegerField()  # tokens or plan-dependent units
    meta = models.JSONField(default=dict)  # run_id, model, tokens_in/out, ...
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["workspace", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.kind} {self.amount} ({self.workspace_id})"
