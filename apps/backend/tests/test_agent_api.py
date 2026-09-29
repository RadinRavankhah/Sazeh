"""Agent REST + SSE surface: sessions, messages, streaming, cancel, tenancy."""
import json

import pytest
from test_agent_loop import make_session, prepare, turn_insert

from apps.agent import orchestrator
from apps.agent.models import AgentRun


def parse_sse(raw: bytes) -> list[dict]:
    events = []
    for block in raw.decode("utf-8").split("\n\n"):
        block = block.strip()
        if not block:
            continue
        data: dict = {"type": None}
        for line in block.splitlines():
            if line.startswith("event: "):
                data["type"] = line[7:]
            elif line.startswith("data: "):
                data.update(json.loads(line[6:]))
        events.append(data)
    return events


@pytest.fixture
def session(user_a, site_a, page_a, seeded_registry):
    return make_session(site_a, page_a)


# ---------------------------------------------------------------- sessions

@pytest.mark.django_db
def test_create_session_for_site(api, user_a, site_a):
    api.force_authenticate(user=user_a)
    resp = api.post(
        "/api/v1/agent/sessions/",
        {"site": str(site_a.id), "title": "Landing chat"},
        format="json",
    )
    assert resp.status_code == 201
    assert str(resp.data["site"]) == str(site_a.id)


@pytest.mark.django_db
def test_create_session_into_foreign_site_is_404(api, user_b, site_a):
    api.force_authenticate(user=user_b)
    resp = api.post(
        "/api/v1/agent/sessions/", {"site": str(site_a.id)}, format="json"
    )
    assert resp.status_code == 404


@pytest.mark.django_db
def test_sessions_list_filters_by_site(api, user_a, site_a):
    api.force_authenticate(user=user_a)
    api.post("/api/v1/agent/sessions/", {"site": str(site_a.id)}, format="json")
    api.post("/api/v1/agent/sessions/", {"site": str(site_a.id)}, format="json")
    resp = api.get(f"/api/v1/agent/sessions/?site={site_a.id}")
    assert resp.data["count"] == 2


@pytest.mark.django_db
def test_session_tenancy(api, user_b, session):
    api.force_authenticate(user=user_b)
    assert api.get(f"/api/v1/agent/sessions/{session.id}/").status_code == 404
    patch = api.patch(
        f"/api/v1/agent/sessions/{session.id}/", {"title": "x"}, format="json"
    )
    assert patch.status_code == 404


@pytest.mark.django_db
def test_session_page_context_update(api, user_a, session, site_a):
    api.force_authenticate(user=user_a)
    from apps.sites.models import Page

    other = Page.objects.create(
        site=site_a, title="Pricing", slug="pricing",
        tree={"id": "root", "component": "Section", "props": {}, "children": []},
    )
    resp = api.patch(
        f"/api/v1/agent/sessions/{session.id}/", {"page": str(other.id)}, format="json"
    )
    assert resp.status_code == 200
    assert str(resp.data["page"]) == str(other.id)


# ---------------------------------------------------------------- messages

@pytest.mark.django_db
def test_post_message_creates_pending_run_and_autotitle(api, user_a, session):
    api.force_authenticate(user=user_a)
    resp = api.post(
        f"/api/v1/agent/sessions/{session.id}/messages/",
        {"content": "Build me a pottery studio landing page"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["run"]["status"] == AgentRun.Status.PENDING
    session.refresh_from_db()
    assert session.title.startswith("Build me a pottery")


@pytest.mark.django_db
def test_second_message_while_pending_is_409(api, user_a, session):
    api.force_authenticate(user=user_a)
    url = f"/api/v1/agent/sessions/{session.id}/messages/"
    first = api.post(url, {"content": "one"}, format="json")
    assert first.status_code == 201
    second = api.post(url, {"content": "two"}, format="json")
    assert second.status_code == 409


@pytest.mark.django_db
def test_post_message_tenancy(api, user_b, session):
    api.force_authenticate(user=user_b)
    resp = api.post(
        f"/api/v1/agent/sessions/{session.id}/messages/",
        {"content": "hi"},
        format="json",
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------- SSE runs

def drain_events(client, run_id) -> list[dict]:
    response = client.get(f"/api/v1/agent/runs/{run_id}/events/", stream=True)
    assert response.status_code == 200
    assert response["Content-Type"] == "text/event-stream"
    raw = b"".join(response.streaming_content)
    return parse_sse(raw)


@pytest.mark.django_db
def test_sse_drives_the_loop(api, user_a, session, page_a, seeded_registry):
    orchestrator.FAKE_SCRIPT.clear()
    orchestrator.FAKE_SCRIPT.extend(
        prepare([turn_insert(), {"text": "Added it."}], page_a)
    )
    api.force_authenticate(user=user_a)
    resp = api.post(
        f"/api/v1/agent/sessions/{session.id}/messages/",
        {"content": "Add a button"},
        format="json",
    )
    run_id = resp.data["run"]["id"]

    events = drain_events(api, run_id)
    run = AgentRun.objects.get(pk=run_id)

    kinds = [e["type"] for e in events]
    assert "message_delta" in kinds
    assert "tool_started" in kinds and "tool_succeeded" in kinds
    assert kinds[-1] == "run_completed"
    assert events[-1]["status"] == "completed"
    assert run.status == AgentRun.Status.COMPLETED


@pytest.mark.django_db
def test_sse_replay_of_terminal_run(api, user_a, session, page_a, seeded_registry):
    """Reconnecting to a finished run replays its final state, no re-run."""
    orchestrator.FAKE_SCRIPT.clear()
    orchestrator.FAKE_SCRIPT.extend(prepare([{"text": "All done earlier."}], page_a))
    api.force_authenticate(user=user_a)
    resp = api.post(
        f"/api/v1/agent/sessions/{session.id}/messages/",
        {"content": "hi"},
        format="json",
    )
    run_id = resp.data["run"]["id"]
    first = drain_events(api, run_id)
    assert first[-1]["type"] == "run_completed"

    replay = drain_events(api, run_id)
    assert replay[-1]["type"] == "run_completed"
    assert replay[-1]["status"] == "completed"
    assert any("All done earlier." in (e.get("text") or "") for e in replay)


@pytest.mark.django_db
def test_cancel_pending_run(api, user_a, session):
    api.force_authenticate(user=user_a)
    resp = api.post(
        f"/api/v1/agent/sessions/{session.id}/messages/",
        {"content": "hi"},
        format="json",
    )
    run_id = resp.data["run"]["id"]
    cancel = api.post(f"/api/v1/agent/runs/{run_id}/cancel/")
    assert cancel.status_code == 200
    assert cancel.data["status"] == AgentRun.Status.CANCELLED
    # A cancelled run can be replaced by a new message (no 409 anymore)
    ok = api.post(
        f"/api/v1/agent/sessions/{session.id}/messages/", {"content": "go"}, format="json"
    )
    assert ok.status_code == 201


@pytest.mark.django_db
def test_run_events_tenancy(api, user_a, user_b, session, page_a, seeded_registry):
    api.force_authenticate(user=user_a)
    resp = api.post(
        f"/api/v1/agent/sessions/{session.id}/messages/", {"content": "hi"}, format="json"
    )
    run_id = resp.data["run"]["id"]
    api.force_authenticate(user=user_b)
    assert api.get(f"/api/v1/agent/runs/{run_id}/events/").status_code == 404
