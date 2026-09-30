import uuid

from django.db import models

from apps.sites.models import Page, Site
from apps.workspaces.models import Workspace


class AgentSession(models.Model):
    """One chat conversation, scoped to a site (and optionally a page)."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE)
    site = models.ForeignKey(
        Site, on_delete=models.CASCADE, related_name="agent_sessions"
    )
    page = models.ForeignKey(Page, null=True, blank=True, on_delete=models.SET_NULL)
    title = models.CharField(max_length=255, blank=True)  # auto-named from first msg
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title or str(self.id)

class AgentMessage(models.Model):
    """Every message in a session, human and assistant."""

    class Role(models.TextChoices):
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"
        TOOL = "tool", "Tool"

    session = models.ForeignKey(
        AgentSession, related_name="messages", on_delete=models.CASCADE
    )
    role = models.CharField(max_length=16, choices=Role.choices)
    # text blocks, tool_use blocks, tool_result blocks (provider-style content blocks)
    content = models.JSONField(default=dict)
    model_name = models.CharField(max_length=128, blank=True)
    tokens_in = models.PositiveIntegerField(default=0)
    tokens_out = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Insertion order (ids) — created_at ties on coarse clocks would make
        # history replay unstable.
        ordering = ["id"]

    def __str__(self):
        return f"{self.role}: {self.pk}"


class ToolRun(models.Model):
    """Record of one tool call the agent executed (the audit trail)."""

    class ResultStatus(models.TextChoices):
        SUCCESS = "success", "Success"
        VALIDATION_ERROR = "validation_error", "Validation error"
        ERROR = "error", "Error"

    message = models.ForeignKey(
        AgentMessage, related_name="tool_runs", on_delete=models.CASCADE
    )
    tool_name = models.CharField(max_length=128)  # "patch_page_tree", "set_site_theme", ...
    args = models.JSONField(default=dict)
    result_status = models.CharField(
        max_length=32, choices=ResultStatus.choices, default=ResultStatus.SUCCESS
    )
    result_summary = models.JSONField(default=dict)  # node ids touched, errors for retry
    tree_snapshot_before = models.JSONField(null=True, blank=True)  # enables rollback/history
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.tool_name} ({self.result_status})"


class AgentRun(models.Model):
    """One unit of agent work: the loop triggered by a user message.

    Budgets are enforced at turn boundaries against the counters below, which
    are persisted incrementally so a crashed worker never loses usage data.
    Cancel is cooperative: `cancel_requested` is checked between turns.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"  # created; loop starts on SSE connect
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        FAILED = "failed", "Failed"
        BUDGET_EXHAUSTED = "budget_exhausted", "Budget exhausted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        AgentSession, related_name="runs", on_delete=models.CASCADE
    )
    page = models.ForeignKey(Page, null=True, blank=True, on_delete=models.SET_NULL)
    # D6.1 selection-aware chat: the node the user had selected in the visual
    # editor when sending the message ("make THIS darker"). Char, not UUID —
    # synthetic root ids ("root") exist in seeded trees.
    selection_node_id = models.CharField(max_length=64, null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    model_name = models.CharField(max_length=128, blank=True)
    turns = models.PositiveIntegerField(default=0)
    tokens_in = models.PositiveIntegerField(default=0)
    tokens_out = models.PositiveIntegerField(default=0)
    cancel_requested = models.BooleanField(default=False)
    finish_reason = models.CharField(max_length=255, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"run {self.pk} ({self.status})"
