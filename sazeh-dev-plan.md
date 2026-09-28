
# Composable AI Site Builder — Full Development Plan

## Table of Contents

1. [Project Overview](#project-overview)
2. [Core Architectural Philosophy](#core-architectural-philosophy)
3. [Technology Stack](#technology-stack)
4. [System Architecture](#system-architecture)
5. [Data Models](#data-models)
6. [Component Registry](#component-registry)
7. [Agent-Facing API](#agent-facing-api)
8. [Frontend Architecture](#frontend-architecture)
9. [Multi-Tenancy](#multi-tenancy)
10. [Authentication & Authorization](#authentication--authorization)
11. [Publishing Pipeline](#publishing-pipeline)
12. [Milestones (M0–M6)](#milestones-m0m6)
13. [Key Tradeoffs & Decisions](#key-tradeoffs--decisions)
14. [Open Questions Before Writing Code](#open-questions-before-writing-code)
-

## 1. Project Overview

The Composable AI Site Builder is an agent-first platform where AI agents construct websites by assembling pre-defined components through a structured API, rather than writing frontend code. The mental model is: **WordPress for AI agents**. The agent is the "site editor." The platform provides the components, the data layer, the rendering engine, and the publishing infrastructure.

The platform targets indie developers and non-technical founders who want AI-generated websites without the instability of raw LLM-generated JSX. Agents operate within a well-defined constraint set: they can configure and assemble components, define page hierarchy, write backend logic hooks, and trigger publishing — but they cannot write or inject arbitrary frontend code.

This document covers every technical decision needed to implement the MVP through production-ready infrastructure.

---

## 2. Core Architectural Philosophy

### The "No Raw Frontend Code" Constraint

This is the single most important architectural decision in the project, and it cuts both ways.

**What it prevents:**
- Agents hallucinating invalid JSX or Tailwind classes
- Layout breakages that are invisible until render time
- Security risks from injected scripts in generated markup
- Unbounded token usage regenerating large component trees

**What it enables:**
- Deterministic output — the same JSON tree always produces the same page
- Atomic validation at the API boundary using Zod/Pydantic schemas
- Full audit trails on every structural change
- The ability to version-diff pages as structured data rather than code
- Component library upgrades without re-generating pages

**The tradeoff:**
Agents cannot build truly custom one-off UI. Anything not in the registry requires either a new registry component (developer work) or a custom code escape hatch — which is deliberately out of scope for the MVP. This is the right tradeoff for MVP stability, and the constraint can be relaxed later with a sandboxed "custom component" slot.

### Agent as Data Producer

The agent's job is to populate a data structure, not generate a program. The page is a JSON tree of component instances with validated props. The rendering engine reads that tree and produces React output. The agent never touches the render path directly.

This means the reliability floor is the component library, not the agent. A bad agent can produce a poorly designed page, but it cannot produce a broken one (assuming schema validation is enforced at the API layer, which it must be).

---

## 3. Technology Stack

### Backend

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | Django 5.x + DRF | Mature, battle-tested for SaaS; excellent admin for bootstrapping; DRF handles serialization cleanly |
| Database | PostgreSQL 16+ | JSONB support for page tree storage; strong indexing; reliable at SaaS scale |
| Task Queue | Celery + Redis | Async publishing jobs, GitHub commit tasks, export generation |
| Auth | Django Allauth + DRF SimpleJWT | JWT for API access (agents), session auth for dashboard |
| Storage | S3-compatible (or Django storages) | Static exports, uploaded assets, generated ZIP files |
| Cache | Redis | Session, rate limiting, schema registry cache |

### Frontend

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | React 18 + TypeScript | Strict typing is essential when consuming a JSON schema registry |
| Build | Vite | Fast dev loop; straightforward config |
| Styling | Tailwind CSS v4 | Utility-first; pairs cleanly with shadcn |
| Components | shadcn/ui | Source-available, composable, Radix-based; becomes the registry seed |
| State | Zustand | Lightweight; good for visual editor local state |
| Forms | React Hook Form + Zod | Schema-driven forms align with the registry model |
| Drag-and-drop | @dnd-kit | Accessible, composable; better than react-beautiful-dnd for this use case |

### Infra (MVP)

- Docker Compose for local dev (Postgres, Redis, Django, React, Celery worker)
- Railway, Render, or Fly.io for initial deployment (avoid ops complexity pre-product-market-fit)
- GitHub Actions for CI

---

## 4. System Architecture

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     External Agents                      │
│          (OpenAI, Claude, custom LLM pipeline)           │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS / API Key
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Django / DRF API                       │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Site API   │  │   Page API   │  │  Registry API  │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Auth/JWT   │  │  Agent Log   │  │ Publish Queue  │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
└──────────┬──────────────────────────────────┬───────────┘
           │                                  │
     ┌─────▼──────┐                    ┌──────▼──────┐
     │ PostgreSQL  │                    │    Redis     │
     │  (JSONB)   │                    │  (Celery)    │
     └────────────┘                    └──────────────┘
                                              │
                                    ┌─────────▼─────────┐
                                    │   Celery Workers   │
                                    │  - Export builder  │
                                    │  - GitHub pusher   │
                                    │  - Platform deploy │
                                    └───────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   React Frontend                         │
│                                                          │
│  ┌─────────────────┐   ┌────────────────────────────┐   │
│  │  Dashboard /    │   │   Visual Page Editor       │   │
│  │  Site Manager   │   │   (page tree + inspector)  │   │
│  └─────────────────┘   └────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```
### Request Flow (Agent Building a Page)

1. Agent authenticates with an API key scoped to a tenant/site.
2. Agent calls `GET /api/v1/registry/components/` to discover available components and their JSON schemas.
3. Agent decides on a page structure and sends `POST /api/v1/pages/` with a page tree payload.
4. The API validates every component instance in the tree against its registered Pydantic schema.
5. On success, the page record is saved to Postgres with the validated JSON tree.
6. An `AgentAction` audit record is written.
7. The agent (or a user) calls `POST /api/v1/publish/` to trigger a publish job.
8. Celery worker executes the appropriate publishing path.

---

## 5. Data Models

### `Tenant`

```python
class Tenant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)  # used in subdomains / URLs
    plan = models.CharField(
        max_length=50,
        choices=[("free", "Free"), ("pro", "Pro"), ("team", "Team")],
        default="free",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tenants"
```
### `Site`

```python
class Site(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="sites")
    name = models.CharField(max_length=255)
    slug = models.SlugField()  # unique within tenant
    custom_domain = models.CharField(max_length=255, blank=True, null=True)
    
    # Global site config — theme tokens, metadata, nav structure
    config = models.JSONField(default=dict)
    
    # Publishing state
    published_at = models.DateTimeField(null=True, blank=True)
    publish_status = models.CharField(
        max_length=50,
        choices=[
            ("draft", "Draft"),
            ("publishing", "Publishing"),
            ("published", "Published"),
            ("failed", "Failed"),
        ],
        default="draft",
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = "sites"
        unique_together = [("tenant", "slug")]
```
**Notes on `config`:** This JSONB field holds site-level settings that apply globally — things the agent sets once and that affect every page. Expected shape:

```json
{
  "theme": {
    "accent": "oklch(65% 0.18 240)",
    "font_family": "Inter",
    "border_radius": "8px"
  },
  "metadata": {
    "title": "Acme Corp",
    "description": "We build things.",
    "favicon_url": "https://..."
  },
  "nav": {
    "items": [
      { "label": "Home", "href": "/" },
      { "label": "Blog", "href": "/blog" }
    ]
  }
}
```
### `Page`

```python
class Page(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="pages")
    
    title = models.CharField(max_length=255)
    slug = models.CharField(max_length=255)  # URL path, e.g. "about" or "blog/hello-world"
    
    # The page tree — array of ComponentInstance objects
    tree = models.JSONField(default=list)
    
    # SEO fields per page
    meta_title = models.CharField(max_length=255, blank=True)
    meta_description = models.TextField(blank=True)
    
    # Ordering within a site's page list
    order = models.PositiveIntegerField(default=0)
    
    is_published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = "pages"
        unique_together = [("site", "slug")]
        ordering = ["order"]
```
**The `tree` field — ComponentInstance schema:**

Each node in the tree is a `ComponentInstance`. This is the core data structure the agent writes.

```json
{
  "id": "node_abc123",
  "component": "HeroSection",
  "props": {
    "headline": "Build faster with AI",
    "subheadline": "The platform that writes your site.",
    "cta_text": "Get started",
    "cta_href": "/signup",
    "image_url": "https://..."
  },
  "children": [
    {
      "id": "node_def456",
      "component": "Badge",
      "props": {
        "label": "New",
        "variant": "success"
      },
      "children": []
    }
  ]
}
```
Design decisions here:
- `id` is generated client-side (agent or editor) as a stable identifier for referencing nodes in patch operations. Use `cuid2` or `nanoid` on the client, or let the backend assign one if absent.
- `children` supports nesting but should be shallow in practice. Most layouts are flat sections. Deep nesting is a layout smell.
- Props are free-form at this level — validation happens at the API boundary against the registry schema for that `component`.

### `ComponentRegistryEntry`

```python
class ComponentRegistryEntry(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    
    # e.g. "HeroSection", "FeatureGrid", "PricingTable"
    name = models.CharField(max_length=100, unique=True)
    
    # Human-readable description for agent discovery
    description = models.TextField()
    
    # Category for grouping in registry discovery API
    category = models.CharField(
        max_length=50,
        choices=[
            ("layout", "Layout"),
            ("content", "Content"),
            ("navigation", "Navigation"),
            ("forms", "Forms"),
            ("media", "Media"),
            ("cta", "Call to Action"),
            ("data_display", "Data Display"),
        ],
    )
    
    # JSON Schema (draft-07 compatible) for prop validation
    props_schema = models.JSONField()
    
    # Which props can contain child components
    slot_names = models.JSONField(default=list)
    
    # Semantic tags for agent discovery ("hero", "landing", "marketing")
    tags = models.JSONField(default=list)
    
    # Whether this component is available on the current plan tier
    min_plan = models.CharField(
        max_length=50,
        choices=[("free", "Free"), ("pro", "Pro"), ("team", "Team")],
        default="free",
    )
    
    version = models.CharField(max_length=20, default="1.0.0")
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = "component_registry"
```
**Example `props_schema` for a `HeroSection`:**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["headline"],
  "additionalProperties": false,
  "properties": {
    "headline": {
      "type": "string",
      "maxLength": 120,
      "description": "Main heading text"
    },
    "subheadline": {
      "type": "string",
      "maxLength": 300,
      "description": "Supporting paragraph below the headline"
    },
    "cta_text": {
      "type": "string",
      "maxLength": 40
    },
    "cta_href": {
      "type": "string",
      "format": "uri-reference"
    },
    "image_url": {
      "type": "string",
      "format": "uri"
    },
    "layout": {
      "type": "string",
      "enum": ["centered", "left-aligned", "split"],
      "default": "centered"
    },
    "background": {
      "type": "string",
      "enum": ["white", "gray", "accent", "dark"],
      "default": "white"
    }
  }
}
```
The `additionalProperties: false` is critical. It prevents agents from writing arbitrary HTML-adjacent props that bypass the constraint model.

### `AgentAction`

This is the audit log. Every structural change an agent makes goes here.

```python
class AgentAction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    site = models.ForeignKey(Site, on_delete=models.SET_NULL, null=True)
    page = models.ForeignKey(Page, on_delete=models.SET_NULL, null=True, blank=True)
    
    action_type = models.CharField(
        max_length=50,
        choices=[
            ("create_site", "Create Site"),
            ("update_site_config", "Update Site Config"),
            ("create_page", "Create Page"),
            ("update_page_tree", "Update Page Tree"),
            ("delete_page", "Delete Page"),
            ("trigger_publish", "Trigger Publish"),
        ],
    )
    
    # Snapshot of what the page/site looked like before this action
    before_state = models.JSONField(null=True, blank=True)
    
    # The payload the agent sent
    payload = models.JSONField()
    
    # API key or user ID that performed the action
    actor_type = models.CharField(max_length=20, choices=[("api_key", "API Key"), ("user", "User")])
    actor_id = models.CharField(max_length=255)
    
    # LLM metadata (optional, for analytics)
    model_name = models.CharField(max_length=100, blank=True)
    request_id = models.CharField(max_length=255, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = "agent_actions"
        indexes = [
            models.Index(fields=["tenant", "-created_at"]),
            models.Index(fields=["site", "-created_at"]),
        ]
```
### `ApiKey`

```python
class ApiKey(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="api_keys")
    
    name = models.CharField(max_length=255)  # e.g. "Production Agent", "Claude Integration"
    key_hash = models.CharField(max_length=128, unique=True)  # bcrypt hash of the raw key
    key_prefix = models.CharField(max_length=12)  # first 8 chars for identification in UI
    
    # Scope limits what the key can do
    scopes = models.JSONField(default=list)  # ["sites:read", "sites:write", "pages:write", "publish"]
    
    last_used_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = "api_keys"
```
Key generation: produce a cryptographically random 32-byte key, encode as `base64url`, store only the hash (bcrypt or Argon2). Show the raw key exactly once on creation. This is non-negotiable for security.

### `PublishJob`

```python
class PublishJob(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="publish_jobs")
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    
    publish_target = models.CharField(
        max_length=50,
        choices=[
            ("platform", "Platform Hosting"),
            ("download", "ZIP Download"),
            ("github", "GitHub Commit"),
        ],
    )
    
    status = models.CharField(
        max_length=50,
        choices=[
            ("pending", "Pending"),
            ("running", "Running"),
            ("success", "Success"),
            ("failed", "Failed"),
        ],
        default="pending",
    )
    
    # GitHub-specific config (null for other targets)
    github_repo = models.CharField(max_length=255, blank=True)
    github_branch = models.CharField(max_length=100, blank=True, default="main")
    github_path = models.CharField(max_length=255, blank=True, default="/")
    
    result_url = models.URLField(blank=True)  # Published URL or download link
    error_log = models.TextField(blank=True)
    
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = "publish_jobs"
        ordering = ["-created_at"]
```
---

## 6. Component Registry

### Building the Registry from shadcn/ui Docs

The shadcn/ui docs ship as Markdown files. The MVP uses these as the source of truth for the initial registry. The conversion pipeline:

1. **Parse each `.md` doc** — extract component name, description, props table, and variant/enum values.
2. **Generate a JSON Schema** for each component's props, mapping TypeScript types to JSON Schema types:
   - `string` → `{"type": "string"}`
   - `"sm" | "md" | "lg"` → `{"type": "string", "enum": ["sm", "md", "lg"]}`
   - `boolean` → `{"type": "boolean"}`
   - `ReactNode` → handled as a named slot, not a prop
3. **Register in DB** via a management command or fixture.

This is a one-time seeding step, but write it as a repeatable command (`python manage.py seed_registry --source ./shadcn-docs/`) so it can be re-run as the library evolves.

### Higher-Level "Site Sections" vs. Primitive Components

The registry should have two tiers:

**Primitive components** (direct shadcn mappings): `Button`, `Badge`, `Card`, `Avatar`, `Input`, `Select`, etc.

**Composite site sections** (built on top of primitives, designed for agents): `HeroSection`, `FeatureGrid`, `TestimonialCarousel`, `PricingTable`, `ContactForm`, `NavBar`, `Footer`, `BlogPostList`, `FAQAccordion`.

Agents primarily interact with composite sections. The primitives exist for fine-grained control in a visual editor. When an agent writes a page, it's typically assembling 5–10 composite sections, each with ~10 configurable props. This is the right granularity for low token cost and reliable output.

### Schema Validation in Python (Pydantic)

For each registry entry, generate a corresponding Pydantic model at API request time:

```python
from jsonschema import validate, ValidationError as JSValidationError
from pydantic import create_model

def validate_component_instance(instance: dict) -> None:
    """
    Validates a single ComponentInstance node against its registry entry.
    Raises ValidationError with a precise field path if invalid.
    """
    component_name = instance.get("component")
    if not component_name:
        raise ValueError("ComponentInstance missing 'component' field")
    
    try:
        entry = ComponentRegistryEntry.objects.get(name=component_name, is_active=True)
    except ComponentRegistryEntry.DoesNotExist:
        raise ValueError(f"Unknown component: {component_name}")
    
    try:
        validate(instance=instance.get("props", {}), schema=entry.props_schema)
    except JSValidationError as e:
        raise ValueError(f"Invalid props for {component_name}: {e.message} at {list(e.path)}")
    
    # Recursively validate children
    for child in instance.get("children", []):
        validate_component_instance(child)


def validate_page_tree(tree: list) -> None:
    """Validates all nodes in a page tree."""
    for node in tree:
        validate_component_instance(node)
```
This runs inside the DRF serializer's `validate()` method, before any database write.

---

## 7. Agent-Facing API

### Design Principles

- All routes under `/api/v1/` with versioning
- API key authentication via `Authorization: Bearer <key>` header
- Tenant is resolved from the API key — agents don't pass tenant IDs
- All responses use consistent envelope: `{"data": ..., "meta": ...}` for lists, `{"data": ...}` for single objects
- Validation errors return `422` with field-level detail, not a generic `400`
- Rate limiting by tenant tier (Redis-backed)

### Endpoints

#### Registry Discovery


```GET /api/v1/registry/components/```

Returns the full registry so agents can discover available components before building.

Query params:
- `?category=content` — filter by category
- `?tags=hero,landing` — filter by semantic tags
- `?search=pricing` — text search on name/description

Response:
```json
{
  "data": [
    {
      "name": "HeroSection",
      "description": "Full-width hero banner with headline, subheadline, CTA, and optional image.",
      "category": "content",
      "tags": ["hero", "landing", "marketing"],
      "props_schema": { ... },
      "slot_names": [],
      "min_plan": "free"
    }
  ],
  "meta": { "total": 42, "page": 1, "per_page": 50 }
}
```

```GET /api/v1/registry/components/{name}/```

Returns a single component with full schema. Use this when building a specific component instance — cheaper to fetch one than the whole registry.

#### Site Management


```POST /api/v1/sites/```

Create a new site under the authenticated tenant.

Request:
```json
{
  "name": "Acme Landing Page",
  "slug": "acme-landing",
  "config": {
    "theme": { "accent": "oklch(65% 0.18 240)" },
    "metadata": { "title": "Acme Corp", "description": "..." }
  }
}
```

```GET /api/v1/sites/
GET /api/v1/sites/{site_id}/
PATCH /api/v1/sites/{site_id}/
DELETE /api/v1/sites/{site_id}/
```
#### Page Management


```POST /api/v1/sites/{site_id}/pages/```

Create a page with an initial tree.

Request:

```
json
{
  "title": "Home",
  "slug": "/",
  "tree": [
    {
      "id": "node_001",
      "component": "HeroSection",
      "props": {
        "headline": "Build with AI",
        "cta_text": "Start free",
        "cta_href": "/signup"
      },
      "children": []
    },
    {
      "id": "node_002",
      "component": "FeatureGrid",
      "props": {
        "title": "Why it works",
        "features": [
          { "icon": "zap", "title": "Fast", "description": "..." },
          { "icon": "shield", "title": "Reliable", "description": "..." }
        ]
      },
      "children": []
    }
  ],
  "meta_title": "Home | Acme Corp",
  "meta_description": "Acme Corp builds AI-powered tools."
}
```
on validation failure, the response is a `422` with a list of erros:

```json
{
  "error": "validation_error",
  "detail": [
    {
      "component": "HeroSection",
      "node_id": "node_001",
      "field": "headline",
      "message": "'headline' must be at most 120 characters"
    }
  ]
}
```
```
GET /api/v1/sites/{site_id}/pages/
GET /api/v1/sites/{site_id}/pages/{page_id}/
PUT /api/v1/sites/{site_id}/pages/{page_id}/       — full tree replace
PATCH /api/v1/sites/{site_id}/pages/{page_id}/     — partial update (title, slug, meta)
DELETE /api/v1/sites/{site_id}/pages/{page_id}/
```
**Tree patch operations** — for agents making surgical edits without resending the full tree:

```
POST /api/v1/sites/{site_id}/pages/{page_id}/tree/patch```/

Request:```
json
{
  "operations": [
    {
      "op": "update_props",
      "node_id": "node_001",
      "props": { "headline": "New headline" }
    },
    {
      "op": "insert_after",
      "after_node_id": "node_002",
      "node": {
        "id": "node_003",
        "component": "TestimonialSection",
        "props": { "title": "What people say" },
        "children": []
      }
    },
    {
      "op": "delete",
      "node_id": "node_004"
    }
  ]
}
```
Supported operations: `update_props`, `insert_before`, `insert_after`, `insert_child`, `delete`, `move`.

This patch endpoint is high-value for agent efficiency. Rather than re-sending an entire 20-node tree to change one headline, the agent sends a minimal diff. Implement this after the basic CRUD endpoints are working.

#### Publishing

```
POST /api/v1/sites/{site_id}/publish```/

Request:```
json
{
  "target": "platform"
}
```
Or for GitHub:```
json
{
  "target": "github",
  "github_repo": "acme/acme-site",
  "github_branch": "main",
  "github_path": "/",
  "commit_message": "Update homepage hero"
}
```
Returns immediately with a job ID:```
json
{
  "data": {
    "job_id": "job_uuid_here",
    "status": "pending",
    "poll_url": "/api/v1/jobs/job_uuid_here/"
  }
}
```
```
GET /api/v1/jobs/{job_id}```/

Poll for publish status. Returns `status`, `result_url`, and `error_log` if failed.

---

## 8. Frontend Architecture

### Application Areas

The React frontend has three distinct areas:

**1. Marketing / Auth shell** — landing page, login, signup, billing. Minimal JS, SSR-friendly if needed.

**2. Dashboard** — site list, site settings, team management, API key management, publish history.

**3. Visual Page Editor** — the complex part. This is a drag-and-drop interface for non-technical users to assemble the same JSON tree that agents build via API. Both paths write to the same data model.

### Page Tree State Management

The editor's local state holds the current page tree. Changes are debounce-synced to the API.
```
typescript
// types.ts
export interface ComponentInstance {
  id: string;
  component: string;
  props: Record<string, unknown>;
  children: ComponentInstance[];
}

export interface PageTree {
  nodes: ComponentInstance[];
}

// editor-store.ts (Zustand)
interface EditorStore {
  tree: ComponentInstance[];
  selectedNodeId: string | null;
  isDirty: boolean;
  
  setTree: (tree: ComponentInstance[]) => void;
  updateNodeProps: (nodeId: string, props: Partial<Record<string, unknown>>) => void;
  insertNode: (node: ComponentInstance, afterId?: string) => void;
  deleteNode: (nodeId: string) => void;
  moveNode: (nodeId: string, targetId: string, position: "before" | "after" | "child") => void;
  selectNode: (nodeId: string | null) => void;
}
```
### Component Prop Inspector

When a node is selected in the editor, the right panel shows a form generated from that component's JSON Schema. This is a schema-to-form renderer.

typescript
// PropInspector.tsx
function PropInspector({ node }: { node: ComponentInstance }) {
  const schema = useComponentSchema(node.component);  // fetched from registry
  const { updateNodeProps } = useEditorStore();
  
  if (!schema) return <Skeleton />;
  
  return (
    <Form
      schema={schema.props_schema}
      defaultValues={node.props}
      onChange={(values) => updateNodeProps(node.id, values)}
    />
  );
}

For MVP, implement a `SchemaFormRenderer` that handles:
- `string` → `<Input>`
- `string` with `enum` → `<Select>`
- `boolean` → `<Switch>`
- `number` → `<Input type="number">`
- `string` with `format: "uri"` → `<Input>` with URL validation
- `array` of objects → repeatable field group with add/remove

This is non-trivial but essential. Consider [`@rjsf/core`](https://rjsf-team.github.io/react-jsonschema-form/) as a base and customize the field renderers to match the design system, rather than building from scratch.

### Live Preview

The editor renders a live preview of the page tree. Options:

**Option A: Sandboxed iframe** — render the page in an iframe using the same rendering engine that produces the published output. Most accurate, but requires a separate render endpoint.

**Option B: Same-page React render** — import the component library directly into the editor app and render the tree inline. Simpler, but means the editor bundle includes all page components.

For MVP, go with Option B. It's faster to implement and the bundle size concern is secondary to shipping. The rendering engine is a recursive `ComponentRenderer`:
```
typescript
// ComponentRenderer.tsx
const COMPONENT_MAP: Record<string, React.ComponentType<any>> = {
  HeroSection,
  FeatureGrid,
  PricingTable,
  // ... all registered components
};

function ComponentRenderer({ node }: { node: ComponentInstance }) {
  const Component = COMPONENT_MAP[node.component];
  
  if (!Component) {
    return (
      <div className="border border-dashed border-red-400 p-4 text-sm text-red-600">
        Unknown component: {node.component}
      </div>
    );
  }
  
  return (
    <Component {...node.props}>
      {node.children.map((child) => (
        <ComponentRenderer key={child.id} node={child} />
      ))}
    </Component>
  );
}

function PageRenderer({ tree }: { tree: ComponentInstance[] }) {
  return (
    <>
      {tree.map((node) => (
        <ComponentRenderer key={node.id} node={node} />
      ))}
    </>
  );
}
```
---

## 9. Multi-Tenancy

### Decision: Shared Schema with `tenant_id`

The MVP uses a single PostgreSQL schema with `tenant_id` foreign keys on every relevant table. Not schema-per-tenant, not separate databases.

**Why:**
- Far simpler to operate and migrate at this stage
- Postgres JSONB handles heterogeneous site configs without per-tenant schema changes
- Row-level security can be added later if needed
- Schema-per-tenant becomes worthwhile at hundreds of tenants with strict data isolation requirements (enterprise, regulated industries)

**How tenant isolation is enforced:**

Every DRF view and serializer uses a base queryset that filters by `request.tenant`:
```
python
# mixins.py
class TenantScopedMixin:
    """
    Enforces that all querysets are scoped to the authenticated tenant.
    Apply to all ModelViewSet subclasses.
    """
    def get_queryset(self):
        return super().get_queryset().filter(tenant=self.request.tenant)
```
The `request.tenant` is resolved in a custom DRF authentication backend that reads the API key, looks up its tenant, and attaches it to the request. Never let a tenant ID travel as a URL or body parameter — resolve it from auth only.

### Tenant Resolution Middleware
```
python
# middleware.py
class TenantResolutionMiddleware:
    """
    For dashboard (session auth) routes: resolve tenant from logged-in user's membership.
    For API routes: resolve from API key (handled in DRF auth backend instead).
    """
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        if request.path.startswith("/dashboard/") and request.user.is_authenticated:
            # User might belong to multiple tenants; use session-stored active tenant
            tenant_id = request.session.get("active_tenant_id")
            if tenant_id:
                request.tenant = Tenant.objects.filter(id=tenant_id).first()
        return self.get_response(request)
```
---

## 10. Authentication & Authorization

### Two Auth Paths

**Path 1: Human users (dashboard)**
- Django Allauth for OAuth (GitHub, Google) + email/password
- Session-based auth for dashboard views
- JWT issued on login for any SPA-style requests from the React frontend

**Path 2: Agents (API)**
- API key in `Authorization: Bearer <key>` header
- Custom DRF authentication class resolves the key to a tenant and attaches scopes
```
python
# authentication.py
class ApiKeyAuthentication(BaseAuthentication):
    def authenticate(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Bearer "):
            return None
        
        raw_key = auth_header[7:]
        
        # Look up by prefix first (fast), then verify hash
        prefix = raw_key[:8]
        try:
            api_key = ApiKey.objects.select_related("tenant").get(
                key_prefix=prefix, is_active=True
            )
        except ApiKey.DoesNotExist:
            raise AuthenticationFailed("Invalid API key")
        
        if not check_password(raw_key, api_key.key_hash):
            raise AuthenticationFailed("Invalid API key")
        
        # Attach tenant and scopes to request
        request.tenant = api_key.tenant
        request.api_key_scopes = api_key.scopes
        
        # Update last_used_at asynchronously
        ApiKey.objects.filter(pk=api_key.pk).update(last_used_at=timezone.now())
        
        # Return a minimal "user" object that satisfies DRF's contract
        return (api_key, None)
```
### Scope Enforcement
```
python
# permissions.py
class HasApiScope(BasePermission):
    required_scope = None
    
    def has_permission(self, request, view):
        if not hasattr(request, "api_key_scopes"):
            return False
        return self.required_scope in request.api_key_scopes


class CanWritePages(HasApiScope):
    required_scope = "pages:write"

class CanPublish(HasApiScope):
    required_scope = "publish"
```
Apply as `permission_classes = [IsAuthenticated, CanWritePages]` on relevant views.

---

## 11. Publishing Pipeline

Three distinct publish paths. All three are implemented as Celery tasks triggered by `POST /api/v1/sites/{site_id}/publish/`.

### Path 1: Platform Hosting

The platform serves the published site directly. The simplest path for users — no external accounts needed.

**How it works:**
1. The Celery task reads the site's page tree from the database.
2. It runs the rendering engine (a headless React SSR step, or a server-side template engine) to produce static HTML per page.
3. HTML, assets, and a site manifest are written to S3 under a path like `s3://sites/{tenant_slug}/{site_slug}/`.
4. A CloudFront (or CDN) distribution serves the bucket contents at `{site_slug}.{platform_domain}.com` or a custom domain.
5. The `Site.publish_status` is updated to `published` and `published_at` is set.

For MVP, skip SSR complexity. Serve a shell HTML that loads the React app, which fetches the page tree JSON from the API and renders it client-side. It's not ideal for SEO, but it ships fast. Proper SSG/SSR is a Phase 2 concern.

**Static export structure:**
```
/{site_slug}/
  index.html
  about/
    index.html
  blog/
    index.html
  _site.json        ← the full page tree for client-side rendering
  _manifest.json    ← page list, site config, nav
```
### Path 2: ZIP Download

Useful for users who want to self-host or inspect the generated output.

**How it works:**
1. Same rendering step as platform hosting.
2. The output is bundled into a ZIP file using Python's `zipfile` module.
3. The ZIP is uploaded to S3 with a time-limited pre-signed URL (1 hour).
4. The `PublishJob.result_url` is set to that pre-signed URL.
5. The frontend polls the job and shows a download button when ready.

The ZIP structure mirrors the static export above, plus a `README.md` with deployment instructions.

### Path 3: GitHub Commit

Users can push their site directly to a GitHub repo. Useful for Netlify/Vercel deployments.

**Prerequisites:**
- The tenant must have connected their GitHub account (OAuth flow via GitHub Apps).
- Store the GitHub access token (encrypted) in the `Tenant` model or a linked `OAuthConnection` table.

**How it works:**
1. Celery task fetches the generated static files (same as above).
2. Uses the GitHub Contents API to commit each file:
   - For each file, `GET /repos/{owner}/{repo}/contents/{path}` to check if it exists and get its current SHA.
   - `PUT /repos/{owner}/{repo}/contents/{path}` with `{"content": base64(content), "message": "...", "sha": current_sha_if_exists}`.
3. Commits are batched where possible using the Git Trees API (more efficient for large sites):
   - Create blobs for each file.
   - Create a tree.
   - Create a commit pointing to the tree.
   - Update the branch ref.

The Git Trees approach is preferred for sites with more than ~5 files, as it's a single API call rather than N calls.

**GitHub OAuth setup:**
- Register a GitHub OAuth App (not a GitHub App for MVP — simpler).
- Scopes needed: `repo` (or `public_repo` for public repos only).
- Store tokens encrypted at rest using Django's `Fernet` encryption or a secrets manager.
```
python
# tasks.py
@shared_task(bind=True, max_retries=3)
def publish_to_github(self, job_id: str):
    job = PublishJob.objects.select_related("site__tenant").get(id=job_id)
    
    try:
        job.status = "running"
        job.started_at = timezone.now()
        job.save(update_fields=["status", "started_at"])
        
        # Generate static files
        site_files = generate_static_files(job.site)
        
        # Push to GitHub using Trees API
        github_client = GitHubClient(tenant=job.site.tenant)
        commit_url = github_client.commit_files(
            repo=job.github_repo,
            branch=job.github_branch,
            base_path=job.github_path,
            files=site_files,
            message=f"Update site: {job.site.name}",
        )
        
        job.status = "success"
        job.result_url = commit_url
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "result_url", "completed_at"])
        
    except Exception as exc:
        job.status = "failed"
        job.error_log = traceback.format_exc()
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "error_log", "completed_at"])
        raise self.retry(exc=exc, countdown=60)
```
---

## 12. Milestones (M0–M6)

### M0: Project Scaffolding (Days 1–3)

- Django project with apps: `tenants`, `sites`, `pages`, `registry`, `publishing`, `api_keys`
- Docker Compose: Postgres, Redis, Django, Celery, React (Vite)
- `Tenant`, `User`, `TenantMembership` models and migrations
- Basic Django admin for registry management
- GitHub Actions CI: lint (ruff, mypy), test (pytest), build React
- Environment config: `python-decouple` or `pydantic-settings` for `.env` management

### M1: Component Registry (Days 4–7)

- `ComponentRegistryEntry` model and migrations
- Management command: `seed_registry --source ./docs/` that parses shadcn `.md` files
- Manual curation: define 10–15 composite site section schemas (Hero, FeatureGrid, etc.)
- `GET /api/v1/registry/components/` and `GET /api/v1/registry/components/{name}/` endpoints
- Unit tests: schema validation logic, `validate_page_tree()`, invalid component names, extra props rejection
- Admin: list/search/edit registry entries, activate/deactivate

### M2: Core API (Days 8–16)

- `ApiKey` model, generation endpoint, authentication backend
- `Site` CRUD endpoints with tenant scoping
- `Page` CRUD endpoints with full tree validation
- `AgentAction` logging on all writes
- `TenantScopedMixin` enforced on all viewsets
- Rate limiting (DRF throttling classes by tenant plan)
- API error envelope standardization
- Integration tests: create site → create page → validate tree rejection on bad props

### M3: Dashboard Frontend (Days 17–26)

- Vite + React + TypeScript + Tailwind + shadcn project setup
- Auth: login, signup, OAuth GitHub button, JWT handling
- Dashboard: site list, create site modal, site settings page
- API key management: list keys, create key (show once), revoke key
- Publish history table with job status polling
- Design tokens: neutral ramp + single accent in OKLCH, light/dark variable sets

### M4: Visual Page Editor (Days 27–40)

- Page editor route with three-panel layout: component palette | canvas | prop inspector
- Zustand store for page tree state
- `ComponentRenderer` for live preview (client-side render of tree)
- Drag-and-drop section reorder with `@dnd-kit`
- Component palette: searchable list of registry components, grouped by category
- Prop inspector: `SchemaFormRenderer` for string, enum, boolean, number, URI, and array-of-object fields
- Debounced auto-save to API
- Add/delete/duplicate section buttons
- Empty state: "Ask the agent to build this page" prompt with example agent prompt

### M5: Publishing Pipeline (Days 41–52)

- `PublishJob` model and Celery task setup
- `POST /api/v1/sites/{site_id}/publish/` endpoint
- `GET /api/v1/jobs/{job_id}/` status polling
- **Path 1:** Client-side render host — S3 bucket + CDN setup, shell HTML generation, `_site.json` and `_manifest.json` output
- **Path 2:** ZIP export — static file generation, ZIP assembly, S3 pre-signed URL
- **Path 3:** GitHub commit — GitHub OAuth flow, `GitHubClient` using Trees API
- Frontend: publish modal with target selection, job progress polling, result link

### M6: Polish, Testing, Launch Prep (Days 53–60)

- Tree patch operations endpoint (`POST .../tree/patch/`)
- API documentation (Swagger via `drf-spectacular`)
- End-to-end tests: agent creates site → builds page → publishes → verifies output
- Load testing: simulate 100 concurrent API calls on page creation with tree validation
- Error handling audit: every API endpoint returns consistent error shapes
- Onboarding flow: new tenant gets a starter site with a pre-built homepage
- Billing integration stub (Stripe) — track plan tier, gate pro components
- Security review: CORS config, CSP headers, API key rotation, rate limit tuning

---

## 13. Key Tradeoffs & Decisions

### 1. JSON Schema vs. Pydantic vs. Zod

Three layers of validation serve different purposes:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| API boundary | Pydantic + `jsonschema` | Validate agent payloads server-side; reject bad props before DB write |
| Registry storage | JSON Schema (draft-07) | Language-agnostic schema stored in DB; can be served to any client |
| Frontend forms | Zod | Type-safe form validation in the React editor; generated from JSON Schema at runtime |

Don't try to share a single schema format across all three. Keep the JSON Schema in the DB as the source of truth, and generate Pydantic models and Zod schemas from it as needed.

### 2. Page Tree Storage: JSONB vs. Normalized Tables

**JSONB (chosen):** Single column, flexible schema, good PostgreSQL query support with `jsonb_path_query`. Fast writes. Schema evolution happens in the registry, not in DB migrations.

**Normalized tables:** Each `ComponentInstance` as a row with a self-referential FK for children. Queryable by component type, enables analytics. Complex to write/read full trees.

For MVP, JSONB wins. The tree is always read and written as a unit. Individual node queries are not needed yet. If analytics on component usage become important later, add a materialized view or a separate analytics table written by the `AgentAction` log.

### 3. Rendering Engine: SSG at Publish Time vs. Client-Side Rendering

**SSG (proper):** Generate static HTML at publish time. Best for SEO, performance. Requires a Node.js renderer or a Python-based template engine that knows all the components. Complex to maintain.

**CSR (MVP choice):** Serve a shell HTML + React app that fetches the page tree and renders it. No Node.js needed at publish time. Poor for SEO. Fast to build.

Ship CSR for MVP. Add SSG in a subsequent phase when the component library is stable. Changing rendering strategy is isolated to the publishing pipeline and doesn't touch the data model.

### 4. Component Versioning

The `ComponentRegistryEntry` has a `version` field, but handling schema migrations between versions is deferred to post-MVP. For now, the rule is: **don't make breaking changes to component prop schemas**. Add fields (with defaults), never remove or rename them. If a breaking change is unavoidable, create a new component (`HeroSectionV2`) and migrate sites over a transition period.

### 5. Agent Token Efficiency

The registry discovery endpoint returns the full props schema for every component. For a large registry, this is a lot of tokens for an LLM to process. Optimization paths for later:

- Return a compact schema by default; full schema on request (`?verbose=true`)
- Add semantic search to the registry (`?query=pricing table with toggle`)
- Provide example payloads with each component schema so agents can copy-modify rather than compose from scratch
- Build a purpose-designed system prompt template that injects only relevant components for the current task

---

## 14. Open Questions Before Writing Code

These are the decisions that need a concrete answer before starting each milestone. Deferring them creates rework.

**Before M0:**
- What's the deployment target? (Fly.io, Railway, Render, AWS) — affects Dockerfile and Celery config
- Monorepo or two repos? (Django + React in one repo is simpler for a small team; separate repos if different teams own each)
- Custom domain support from day one or later? (affects CDN setup in M5)

**Before M2:**
- What's the API key scope list? Define all possible scopes now to avoid backward-incompatible changes later. Proposed: `sites:read`, `sites:write`, `pages:read`, `pages:write`, `registry:read`, `publish`, `api_keys:manage`
- How does billing affect the API? Should plan-gated components return a `403` with an upgrade prompt, or just not appear in the registry response?

**Before M4:**
- Who is the primary visual editor user? (developer who understands components vs. non-technical founder) — determines how much explanation/documentation to show in the UI
- Does the editor support undo/redo? (Zustand + `immer` can do this, but it's scope)

**Before M5:**
- For platform hosting: subdomain per site (`{slug}.Claude.site`) or path-based (`Claude.site/sites/{slug}`)? Subdomains require wildcard cert and DNS config.
- GitHub integration: OAuth App or GitHub App? (GitHub App is more powerful and scoped, but harder to set up; OAuth App is simpler for MVP)
- For ZIP download: include a `package.json` + Vite config so the user can run the site locally? Or just raw HTML/CSS/JS?

**Ongoing:**
- How do you handle image uploads? The current model assumes agents provide external URLs. At some point, you need an upload endpoint that returns a CDN URL. This doesn't block MVP if agents use Unsplash URLs or user-provided links, but it's on the roadmap.
- Analytics: track page views on published sites? Out of scope for MVP, but the data model should leave room for it (a `PageView` table keyed on `site_id` and `page_slug`).

## 15. Resolution of Open Questions (MVP Defaults)

To eliminate ambiguity prior to implementation, the following defaults are locked for the MVP build:

| Question | MVP Resolution | Justification |
| :--- | :--- | :--- |
| **Deployment Target** | Fly.io (Django, Celery, Postgres, Valkey/Redis) | Native Dockerfile deployment, minimal infra boilerplate, reliable internal networking. |
| **Repository Layout** | Monorepo (`apps/backend`, `apps/web`, `packages/schema`) | Simplifies sharing TypeScript interfaces generated from JSON schemas with the frontend. |
| **Custom Domains** | Deferred. Use subdomains: `{tenant-slug}-{site-slug}.platform.app` | Avoids managing ACME/SSL challenges and wildcard reverse proxy configs in M0–M5. |
| **API Scopes** | `sites:read`, `sites:write`, `pages:read`, `pages:write`, `registry:read`, `publish` | Strict, minimal set. Key creation sets all scopes by default for MVP. |
| **Billing Gate Behavior** | Registry API returns components with `is_locked: true` if above tenant plan | LLMs can see available components but are guided to prompt users to upgrade. |
| **Editor Undo/Redo** | Implemented via Zustand Temporal (`z-undo`) middleware | Minimal overhead on client tree store; eliminates custom history stacks. |
| **GitHub App vs. OAuth** | GitHub OAuth App | No webhook verification ceremony required; single user access token allows direct repo writes. |
| **Asset/Image Strategy** | Direct S3 Pre-signed URL endpoint (`POST /api/v1/media/upload-url/`) | Keeps file streaming off the Django app servers entirely. |

---

## 16. Composite Section Registry (Seed Schemas)

The component registry contains primitive shadcn wrappers and composite sections. Agents interact primarily with composite sections. Below are the canonical JSON Schemas (Draft-07) for the core seed set.

### 1. `HeroSection`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "HeroSection",
  "type": "object",
  "required": ["headline", "cta_text", "cta_href"],
  "additionalProperties": false,
  "properties": {
    "headline": { "type": "string", "maxLength": 120 },
    "subheadline": { "type": "string", "maxLength": 300 },
    "badge_text": { "type": "string", "maxLength": 40 },
    "cta_text": { "type": "string", "maxLength": 40 },
    "cta_href": { "type": "string", "format": "uri-reference" },
    "secondary_cta_text": { "type": "string", "maxLength": 40 },
    "secondary_cta_href": { "type": "string", "format": "uri-reference" },
    "image_url": { "type": "string", "format": "uri" },
    "image_alt": { "type": "string", "maxLength": 100 },
    "align": {
      "type": "string",
      "enum": ["center", "left"],
      "default": "center"
    }
  }
}
```

### 2. `FeatureGrid`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "FeatureGrid",
  "type": "object",
  "required": ["title", "features"],
  "additionalProperties": false,
  "properties": {
    "title": { "type": "string", "maxLength": 100 },
    "subtitle": { "type": "string", "maxLength": 250 },
    "columns": {
      "type": "integer",
      "enum": [2, 3, 4],
      "default": 3
    },
    "features": {
      "type": "array",
      "minItems": 1,
      "maxItems": 12,
      "items": {
        "type": "object",
        "required": ["title", "description", "icon"],
        "additionalProperties": false,
        "properties": {
          "title": { "type": "string", "maxLength": 60 },
          "description": { "type": "string", "maxLength": 200 },
          "icon": {
            "type": "string",
            "enum": [
              "zap", "shield", "layers", "cpu", "globe", 
              "lock", "refresh", "check-circle", "star", "code"
            ]
          }
        }
      }
    }
  }
}
```

### 3. `PricingTable`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PricingTable",
  "type": "object",
  "required": ["plans"],
  "additionalProperties": false,
  "properties": {
    "title": { "type": "string", "maxLength": 100 },
    "subtitle": { "type": "string", "maxLength": 200 },
    "plans": {
      "type": "array",
      "minItems": 1,
      "maxItems": 4,
      "items": {
        "type": "object",
        "required": ["name", "price", "billing_period", "cta_text", "cta_href", "features"],
        "additionalProperties": false,
        "properties": {
          "name": { "type": "string", "maxLength": 50 },
          "description": { "type": "string", "maxLength": 150 },
          "price": { "type": "string", "maxLength": 20 },
          "billing_period": { "type": "string", "enum": ["month", "year", "one-time"] },
          "highlighted": { "type": "boolean", "default": false },
          "cta_text": { "type": "string", "maxLength": 40 },
          "cta_href": { "type": "string", "format": "uri-reference" },
          "features": {
            "type": "array",
            "items": { "type": "string", "maxLength": 100 }
          }
        }
      }
    }
  }
}
```

### 4. `FAQAccordion`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "FAQAccordion",
  "type": "object",
  "required": ["items"],
  "additionalProperties": false,
  "properties": {
    "title": { "type": "string", "maxLength": 100, "default": "Frequently Asked Questions" },
    "subtitle": { "type": "string", "maxLength": 250 },
    "items": {
      "type": "array",
      "minItems": 1,
      "maxItems": 20,
      "items": {
        "type": "object",
        "required": ["question", "answer"],
        "additionalProperties": false,
        "properties": {
          "question": { "type": "string", "maxLength": 150 },
          "answer": { "type": "string", "maxLength": 600 }
        }
      }
    }
  }
}
```

---

## 17. Agent Tool-Calling Definitions

Agents interface with the API through standardized Tool/Function Calling interfaces. The schemas below represent the tool definitions compatible with OpenAI, Anthropic, or open-source agent frameworks.

```json[
  {
    "name": "get_component_registry",
    "description": "Fetch available components and their JSON prop schemas to construct or edit site pages.",
    "parameters": {
      "type": "object",
      "properties": {
        "category": {
          "type": "string",
          "enum": ["layout", "content", "navigation", "forms", "media", "cta", "data_display"],
          "description": "Optional category filter."
        }
      }
    }
  },
  {
    "name": "create_page",
    "description": "Create a new page within a site using an ordered tree of validated component instances.",
    "parameters": {
      "type": "object",
      "required": ["site_id", "title", "slug", "tree"],
      "properties": {
        "site_id": { "type": "string", "format": "uuid" },
        "title": { "type": "string", "description": "Page Title" },
        "slug": { "type": "string", "description": "URL path relative to root, e.g. 'about' or 'pricing'" },
        "meta_title": { "type": "string" },
        "meta_description": { "type": "string" },
        "tree": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "component", "props"],
            "properties": {
              "id": { "type": "string", "description": "Unique nanoid string" },
              "component": { "type": "string", "description": "Name of the component from registry" },
              "props": { "type": "object", "description": "Properties conforming to component schema" },
              "children": { "type": "array", "items": { "type": "object" } }
            }
          }
        }
      }
    }
  },
  {
    "name": "patch_page_tree",
    "description": "Perform atomic modifications to a page layout without sending the entire tree.",
    "parameters": {
      "type": "object",
      "required": ["site_id", "page_id", "operations"],
      "properties": {
        "site_id": { "type": "string", "format": "uuid" },
        "page_id": { "type": "string", "format": "uuid" },
        "operations": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["op"],
            "properties": {
              "op": {
                "type": "string",
                "enum": ["update_props", "insert_before", "insert_after", "delete", "move"]
              },
              "node_id": { "type": "string" },
              "target_node_id": { "type": "string" },
              "props": { "type": "object" },
              "node": {
                "type": "object",
                "properties": {
                  "id": { "type": "string" },
                  "component": { "type": "string" },
                  "props": { "type": "object" },
                  "children": { "type": "array" }
                }
              }
            }
          }
        }
      }
    }
  },
  {
    "name": "trigger_publish",
    "description": "Publish the site to platform CDN, export as ZIP, or push commits to GitHub.",
    "parameters": {
      "type": "object",
      "required": ["site_id", "target"],
      "properties": {
        "site_id": { "type": "string", "format": "uuid" },
        "target": { "type": "string", "enum": ["platform", "download", "github"] },
        "github_repo": { "type": "string", "description": "Required if target is github. Format: 'owner/repo'" },
        "github_branch": { "type": "string", "default": "main" },
        "commit_message": { "type": "string" }
      }
    }
  }
]
```

---

## 18. Tree Mutation Engine (`TreePatcher`)

The mutation engine executes tree patches on the backend. This guarantees transactional structural edits and validates only modified components before persisting to Postgres JSONB.

```python
# apps/pages/engine.py
import copy
from typing import Any, Dict, List, Optional, Tuple

class TreeMutationError(Exception):
    def __init__(self, message: str, op_index: int):
        super().__init__(message)
        self.op_index = op_index


class TreePatcher:
    """
    Applies an atomic list of structural operations to a JSON component tree.
    """

    def __init__(self, tree: List[Dict[str, Any]]):
        self.tree = copy.deepcopy(tree)

    def _find_node_and_parent(
        self, nodes: List[Dict[str, Any]], node_id: str, parent: Optional[List[Dict[str, Any]]] = None
    ) -> Tuple[Optional[Dict[str, Any]], Optional[List[Dict[str, Any]]], Optional[int]]:
        for index, node in enumerate(nodes):
            if node.get("id") == node_id:
                return node, nodes, index
            children = node.get("children", [])
            found_node, found_parent, found_index = self._find_node_and_parent(children, node_id, children)
            if found_node:
                return found_node, found_parent, found_index
        return None, None, None

    def apply_operations(self, operations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        for idx, op in enumerate(operations):
            op_type = op.get("op")

            if op_type == "update_props":
                node_id = op["node_id"]
                node, _, _ = self._find_node_and_parent(self.tree, node_id)
                if not node:
                    raise TreeMutationError(f"Node '{node_id}' not found", op_index=idx)
                node.setdefault("props", {}).update(op["props"])

            elif op_type == "insert_after":
                target_id = op["target_node_id"]
                _, parent_list, target_idx = self._find_node_and_parent(self.tree, target_id)
                if parent_list is None or target_idx is None:
                    raise TreeMutationError(f"Target node '{target_id}' not found", op_index=idx)
                parent_list.insert(target_idx + 1, op["node"])

            elif op_type == "insert_before":
                target_id = op["target_node_id"]
                _, parent_list, target_idx = self._find_node_and_parent(self.tree, target_id)
                if parent_list is None or target_idx is None:
                    raise TreeMutationError(f"Target node '{target_id}' not found", op_index=idx)
                parent_list.insert(target_idx, op["node"])

            elif op_type == "delete":
                node_id = op["node_id"]
                _, parent_list, target_idx = self._find_node_and_parent(self.tree, node_id)
                if parent_list is None or target_idx is None:
                    raise TreeMutationError(f"Node '{node_id}' not found", op_index=idx)
                parent_list.pop(target_idx)

            elif op_type == "move":
                node_id = op["node_id"]
                target_id = op["target_node_id"]
                position = op.get("position", "after")  # "before" or "after"

                node, parent_list, target_idx = self._find_node_and_parent(self.tree, node_id)
                if parent_list is None or target_idx is None:
                    raise TreeMutationError(f"Node to move '{node_id}' not found", op_index=idx)
                
                # Detach
                detached_node = parent_list.pop(target_idx)

                # Re-find target since indices shifted
                _, new_parent, new_target_idx = self._find_node_and_parent(self.tree, target_id)
                if new_parent is None or new_target_idx is None:
                    # Rollback detach
                    parent_list.insert(target_idx, detached_node)
                    raise TreeMutationError(f"Move target '{target_id}' not found", op_index=idx)

                insert_idx = new_target_idx + 1 if position == "after" else new_target_idx
                new_parent.insert(insert_idx, detached_node)

            else:
                raise TreeMutationError(f"Unsupported operation '{op_type}'", op_index=idx)

        return self.tree
```

---

## 19. GitHub Publishing via Git Data API (Trees)

Direct file injection via `contents` endpoints produces $N$ commits for $N$ files, polluting git history and exhausting rate limits. The publishing pipeline uses the lower-level Git Data API to write changes in a single atomic commit.

```python
# apps/publishing/github.py
import base64
import requests
from typing import Dict

class GitHubTreePublisher:
    BASE_URL = "https://api.github.com"

    def __init__(self, access_token: str):
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def commit_site(
        self,
        repo: str,
        branch: str,
        files: Dict[str, str],  # {"path/to/file.html": "file content"}
        commit_message: str
    ) -> str:
        # 1. Get branch reference
        ref_resp = requests.get(
            f"{self.BASE_URL}/repos/{repo}/git/ref/heads/{branch}",
            headers=self.headers
        )
        ref_resp.raise_for_status()
        latest_commit_sha = ref_resp.json()["object"]["sha"]

        # 2. Get the commit to locate the base tree
        commit_resp = requests.get(
            f"{self.BASE_URL}/repos/{repo}/git/commits/{latest_commit_sha}",
            headers=self.headers
        )
        commit_resp.raise_for_status()
        base_tree_sha = commit_resp.json()["tree"]["sha"]

        # 3. Create blobs for each file
        tree_elements = []
        for file_path, content in files.items():
            blob_resp = requests.post(
                f"{self.BASE_URL}/repos/{repo}/git/blobs",
                headers=self.headers,
                json={
                    "content": base64.b64encode(content.encode("utf-8")).decode("utf-8"),
                    "encoding": "base64"
                }
            )
            blob_resp.raise_for_status()
            blob_sha = blob_resp.json()["sha"]

            tree_elements.append({
                "path": file_path.lstrip("/"),
                "mode": "100644",
                "type": "blob",
                "sha": blob_sha
            })

        # 4. Create a new Tree pointing to the base tree
        new_tree_resp = requests.post(
            f"{self.BASE_URL}/repos/{repo}/git/trees",
            headers=self.headers,
            json={
                "base_tree": base_tree_sha,
                "tree": tree_elements
            }
        )
        new_tree_resp.raise_for_status()
        new_tree_sha = new_tree_resp.json()["sha"]

        # 5. Create the Commit
        new_commit_resp = requests.post(
            f"{self.BASE_URL}/repos/{repo}/git/commits",
            headers=self.headers,
            json={
                "message": commit_message,
                "tree": new_tree_sha,
                "parents": [latest_commit_sha]
            }
        )
        new_commit_resp.raise_for_status()
        new_commit_sha = new_commit_resp.json()["sha"]

        # 6. Update reference to point to new commit
        update_ref_resp = requests.patch(
            f"{self.BASE_URL}/repos/{repo}/git/refs/heads/{branch}",
            headers=self.headers,
            json={"sha": new_commit_sha, "force": False}
        )
        update_ref_resp.raise_for_status()

        return f"https://github.com/{repo}/commit/{new_commit_sha}"
```

---

## 20. Production Ready Shell HTML Generation

For Platform and ZIP publishing, the Celery worker generates static wrappers using the CSR bundle. Each page is served as an isolated entry point referencing central assets and hydration state.

```python
# apps/publishing/exporter.py
import html
import json

def generate_shell_html(site, page) -> str:
    """
    Generates a deterministic single-file shell that hydrates the React engine.
    """
    site_config = site.config or {}
    theme = site_config.get("theme", {})
    metadata = site_config.get("metadata", {})

    accent_color = theme.get("accent", "oklch(65% 0.18 240)")
    font_family = theme.get("font_family", "Inter")

    escaped_title = html.escape(page.meta_title or page.title)
    escaped_desc = html.escape(page.meta_description or metadata.get("description", ""))

    payload = {
        "site": {
            "name": site.name,
            "config": site_config,
        },
        "page": {
            "title": page.title,
            "slug": page.slug,
            "tree": page.tree,
        }
    }
    serialized_state = json.dumps(payload, separators=(',', ':'))

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{escaped_title}</title>
  <meta name="description" content="{escaped_desc}" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family={font_family}:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {{
      --accent: {accent_color};
      --font-sans: '{font_family}', sans-serif;
    }}
    body {{
      margin: 0;
      font-family: var(--font-sans);
      -webkit-font-smoothing: antialiased;
    }}
  </style>
  <link rel="stylesheet" href="/assets/engine.css" />
</head>
<body>
  <div id="root"></div>
  <script id="__SITE_DATA__" type="application/json">
    {serialized_state}
  </script>
  <script type="module" src="/assets/engine.js"></script>
</body>
</html>"""
```

---

## 21. Next Immediate Action Items

1. **Bootstrap Monorepo Structure**: Set up Django in `apps/backend` and Vite in `apps/web`.
2. **Execute M0 Migration Script**: Run initial migrations for `tenants`, `sites`, `pages`, and `api_keys`.
3. **Execute M1 Fixtures**: Seed database with the 4 seed schemas provided in Section 16 via `python manage.py loaddata seed_components.json`.