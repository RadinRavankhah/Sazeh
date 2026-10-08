import json
import os
from pathlib import Path

from django.conf import settings

from apps.sites.models import Page, PublishBranch, Site


SHELL_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <style>body{{margin:0;font-family:system-ui,sans-serif;}}</style>
</head>
<body>
  <div id="root" data-tree="{tree_json}"></div>
  <script src="/_site.js"></script>
</body>
</html>"""


def build_bundle(site: Site, branch: PublishBranch) -> dict:
    """Render the site tree into static files. Returns {pages: [{slug, html, tree}], manifest}."""
    pages = list(
        Page.objects.filter(site=site, parent__isnull=True)
        .select_related("site")
        .order_by("order")
    )
    if not pages:
        pages = list(Page.objects.filter(site=site).order_by("order"))

    rendered = []
    for page in pages:
        tree_json = json.dumps(page.tree, ensure_ascii=False)
        html = SHELL_HTML.format(
            title=page.title,
            tree_json=tree_json.replace("'", "&#39;").replace('"', "&quot;"),
        )
        rendered.append({"slug": page.slug, "html": html, "tree": page.tree})

    manifest = {
        "site": {
            "name": site.name,
            "slug": site.slug,
            "config": site.config,
        },
        "pages": [{"slug": p["slug"], "title": p["tree"].get("props", {}).get("title", p["slug"])} for p in rendered],
    }
    return {"pages": rendered, "manifest": manifest}


def upload_to_vps(bundle: dict, site_slug: str, branch_name: str) -> str:
    """Write bundle files to the VPS directory. Returns the root URL."""
    base = Path(settings.PUBLISH_BUNDLE_DIR) / site_slug / branch_name
    base.mkdir(parents=True, exist_ok=True)

    for page in bundle["pages"]:
        dir_path = base / page["slug"]
        dir_path.mkdir(parents=True, exist_ok=True)
        (dir_path / "index.html").write_text(page["html"], encoding="utf-8")

    (base / "_site.json").write_text(
        json.dumps({"pages": bundle["pages"], "site": bundle["manifest"]["site"]}, ensure_ascii=False),
        encoding="utf-8",
    )
    (base / "_manifest.json").write_text(
        json.dumps(bundle["manifest"], ensure_ascii=False),
        encoding="utf-8",
    )
    (base / "index.html").write_text(
        SHELL_HTML.format(
            title=bundle["manifest"]["site"]["name"],
            tree_json=json.dumps(bundle["pages"][0]["tree"], ensure_ascii=False).replace("'", "&#39;").replace('"', "&quot;") if bundle["pages"] else "{}",
        ),
        encoding="utf-8",
    )

    return f"https://{site_slug}.{settings.PLATFORM_DOMAIN}"