"""
Management command to seed the Component Registry from JSON schema files.
Looks for *.json files in apps/registry/components/ and loads them.
"""
import json
from pathlib import Path

from django.core.management.base import BaseCommand

from apps.registry.models import Component
from apps.registry.service import registry


class Command(BaseCommand):
    help = "Seed component registry from JSON files in apps/registry/components/"

    def handle(self, *args, **options):
        components_dir = Path(__file__).resolve().parent.parent.parent / "components"
        if not components_dir.exists():
            self.stderr.write(f"Directory not found: {components_dir}")
            return

        for json_file in components_dir.glob("*.json"):
            with open(json_file) as f:
                data = json.load(f)

            component, created = Component.objects.update_or_create(
                name=data["name"],
                defaults={
                    "display_name": data.get("display_name", data["name"]),
                    "category": data.get("category", "primitive"),
                    "description": data.get("description", ""),
                    "icon": data.get("icon", ""),
                    "schema": data["schema"],
                    "default_props": data.get("default_props", {}),
                    "allowed_children": data.get("allowed_children", []),
                },
            )
            status = "Created" if created else "Updated"
            self.stdout.write(f"  {status} component: {component.name}")

        registry.invalidate_cache()
        self.stdout.write(self.style.SUCCESS("Registry seeded and cache invalidated."))
