from django.contrib import admin

from .models import UsageEvent


@admin.register(UsageEvent)
class UsageEventAdmin(admin.ModelAdmin):
    list_display = ("kind", "amount", "workspace", "created_at")
    list_filter = ("kind",)
    search_fields = ("workspace__slug",)
    raw_id_fields = ("workspace",)
    readonly_fields = ("meta",)
