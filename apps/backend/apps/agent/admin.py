from django.contrib import admin

from .models import AgentMessage, AgentRun, AgentSession, ToolRun


class AgentMessageInline(admin.TabularInline):
    model = AgentMessage
    extra = 0
    fields = ("role", "content", "tokens_in", "tokens_out", "created_at")
    readonly_fields = fields


class AgentRunInline(admin.TabularInline):
    model = AgentRun
    extra = 0
    fields = (
        "status", "finish_reason", "model_name", "turns",
        "tokens_in", "tokens_out", "started_at",
    )
    readonly_fields = fields


@admin.register(AgentSession)
class AgentSessionAdmin(admin.ModelAdmin):
    list_display = ("title", "site", "page", "status", "updated_at")
    list_filter = ("status",)
    search_fields = ("title", "site__name")
    raw_id_fields = ("site", "page", "workspace")
    inlines = [AgentMessageInline, AgentRunInline]


@admin.register(AgentMessage)
class AgentMessageAdmin(admin.ModelAdmin):
    list_display = ("session", "role", "created_at")
    list_filter = ("role",)
    raw_id_fields = ("session",)


@admin.register(AgentRun)
class AgentRunAdmin(admin.ModelAdmin):
    list_display = (
        "id", "session", "status", "finish_reason",
        "turns", "tokens_in", "tokens_out", "started_at",
    )
    list_filter = ("status",)
    raw_id_fields = ("session", "page")


@admin.register(ToolRun)
class ToolRunAdmin(admin.ModelAdmin):
    list_display = ("tool_name", "result_status", "message", "created_at")
    list_filter = ("result_status", "tool_name")
    raw_id_fields = ("message",)
