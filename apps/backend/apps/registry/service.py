"""
Component Registry — in-memory cache + DB-backed service.
Components are seeded once and cached; lookups are fast.
"""

from django.core.cache import cache

from .models import Component

CACHE_KEY_ALL = "registry:components:all"
CACHE_KEY_BY_NAME = "registry:components:by_name"
CACHE_TIMEOUT = 3600  # 1 hour


class RegistryService:
    """Singleton-style service for component lookups."""

    @staticmethod
    def _load_all() -> dict[str, dict]:
        """Load all components from DB, populate caches."""
        qs = Component.objects.all()
        by_name = {}
        for c in qs:
            by_name[c.name] = {
                "name": c.name,
                "display_name": c.display_name,
                "category": c.category,
                "description": c.description,
                "icon": c.icon,
                "schema": c.schema,
                "default_props": c.default_props,
                "allowed_children": c.allowed_children,
                "example_payload": c.example_payload,
            }
        cache.set(CACHE_KEY_BY_NAME, by_name, CACHE_TIMEOUT)
        cache.set(CACHE_KEY_ALL, list(by_name.values()), CACHE_TIMEOUT)
        return by_name

    @staticmethod
    def list_components(category: str | None = None, search: str | None = None) -> list[dict]:
        by_name = cache.get(CACHE_KEY_BY_NAME)
        if by_name is None:
            by_name = RegistryService._load_all()

        all_items = list(by_name.values())
        if category:
            all_items = [c for c in all_items if c["category"] == category]
        if search:
            q = search.lower()
            all_items = [
                c for c in all_items
                if q in c["name"].lower() or q in c["display_name"].lower()
            ]
        # Compact output for agent — return name, category, description only by default
        return [
            {
                "name": c["name"],
                "display_name": c["display_name"],
                "category": c["category"],
                "description": c["description"],
            }
            for c in all_items
        ]

    @staticmethod
    def get_component(name: str) -> dict | None:
        by_name = cache.get(CACHE_KEY_BY_NAME)
        if by_name is None:
            by_name = RegistryService._load_all()
        return by_name.get(name)

    @staticmethod
    def get_component_names() -> set[str]:
        by_name = cache.get(CACHE_KEY_BY_NAME)
        if by_name is None:
            by_name = RegistryService._load_all()
        return set(by_name.keys())

    @staticmethod
    def invalidate_cache():
        cache.delete(CACHE_KEY_ALL)
        cache.delete(CACHE_KEY_BY_NAME)


registry = RegistryService()
