from django.db import models


class Component(models.Model):
    """Seeded component definitions.  Used by both the visual editor and the agent."""

    class Category(models.TextChoices):
        PRIMITIVE = "primitive", "Primitive"
        COMPOSITE = "composite", "Composite Section"

    name = models.CharField(max_length=128, unique=True)          # e.g. "HeroSection", "Button"
    display_name = models.CharField(max_length=255)
    category = models.CharField(max_length=20, choices=Category.choices)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=64, blank=True)            # icon name for UI

    # JSON Schema describing the component’s props
    schema = models.JSONField()

    # Default props to apply when a component is dropped / inserted
    default_props = models.JSONField(default=dict)

    # Optional: which slot children this component accepts
    allowed_children = models.JSONField(default=list)             # list of component names

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["category", "name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.category})"
