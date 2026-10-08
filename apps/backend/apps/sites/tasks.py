from django.conf import settings

from .models import PublishBranch, Site
from .services import build_bundle, upload_to_vps


def publish_site(branch_id: str) -> None:
    """Build the static bundle and upload to the VPS. MVP: sync (Celery when Redis is up)."""
    branch = PublishBranch.objects.select_related("site", "created_by").get(id=branch_id)
    branch.status = PublishBranch.Status.PUBLISHING
    branch.save(update_fields=["status"])

    try:
        bundle = build_bundle(branch.site, branch)
        url = upload_to_vps(bundle, branch.site.slug, branch.name)
        branch.status = PublishBranch.Status.PUBLISHED
        branch.result_url = url
        branch.published_at = branch.created_at  # placeholder; set to now in prod
        branch.save(update_fields=["status", "result_url", "published_at"])
        # Mark site as published + point to this branch
        branch.site.published_branch = branch
        branch.site.status = Site.Status.PUBLISHED
        branch.site.save(update_fields=["published_branch", "status"])
    except Exception as e:
        branch.status = PublishBranch.Status.FAILED
        branch.error_log = str(e)
        branch.save(update_fields=["status", "error_log"])
        raise