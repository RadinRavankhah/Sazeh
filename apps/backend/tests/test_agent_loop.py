"""Orchestrator loop behavior with a scripted fake LLM (deterministic)."""
from copy import deepcopy

import pytest

from apps.agent import orchestrator
from apps.agent.llm import FakeLLMAdapter, LLMError
from apps.agent.models import AgentMessage, AgentRun, AgentSession, ToolRun
from apps.usage.models import UsageEvent

# ---------------------------------------------------------------- helpers

def make_session(site_a, page_a) -> AgentSession:
    session = AgentSession.objects.create(
        workspace=site_a.workspace, site=site_a, page=page_a, title=""
    )
    AgentMessage.objects.create(
        session=session,
        role=AgentMessage.Role.USER,
        content={"role": "user", "content": "Add a button that says Hi"},
    )
    return session


def make_run(session) -> AgentRun:
    return AgentRun.objects.create(session=session, page=session.page)


def turn_insert(page_id=None, component="Button", label="Hi") -> dict:
    return {
        "tool_calls": [
            {
                "name": "patch_page_tree",
                "arguments": {
                    "page_id": page_id,
                    "operations": [
                        {"op": "insert", "parent_id": "root",
                         "component": component, "props": {"label": label}}
                    ],
                },
            }
        ]
    }


def prepare(script: list, page) -> list:
    """Inject the real page id into scripted tool arguments."""
    prepared = []
    for item in deepcopy(script):
        if isinstance(item, dict):
            for tc in item.get("tool_calls", []):
                if tc["arguments"].get("page_id") is None:
                    tc["arguments"]["page_id"] = str(page.id)
        prepared.append(item)
    return prepared


@pytest.fixture
def ctx(user_a, site_a, page_a, seeded_registry):
    session = make_session(site_a, page_a)

    def build(script: list) -> tuple[AgentSession, AgentRun, FakeLLMAdapter]:
        run = make_run(session)
        return session, run, FakeLLMAdapter(prepare(script, page_a))

    return session, page_a, build


# ---------------------------------------------------------------- tests

@pytest.mark.django_db
def test_happy_path_tool_then_done(ctx):
    session, page, build = ctx
    _, run, fake = build([turn_insert(), {"text": "Added the button."}])
    events = list(orchestrator.stream_run(run, llm=fake))
    run.refresh_from_db()

    assert run.status == AgentRun.Status.COMPLETED
    assert run.finish_reason == "done"
    assert run.turns == 2
    kinds = [e["type"] for e in events]
    assert "tool_started" in kinds and "tool_succeeded" in kinds
    assert kinds[-1] == "run_completed"

    # Page tree mutated; audit trail written
    page.refresh_from_db()
    assert page.tree["children"][0]["component"] == "Button"
    tool_run = ToolRun.objects.get()
    assert tool_run.result_status == ToolRun.ResultStatus.SUCCESS
    assert tool_run.tree_snapshot_before["children"] == []

    # History reconstructs a valid OpenAI protocol sequence
    contents = list(session.messages.values_list("content", flat=True))
    roles = [c["role"] for c in contents]
    assert roles == ["user", "assistant", "tool", "assistant"]
    assert contents[1]["tool_calls"][0]["function"]["name"] == "patch_page_tree"
    assert contents[2]["tool_call_id"]

    # Metering written
    assert UsageEvent.objects.filter(kind="llm_tokens").count() == 1


@pytest.mark.django_db
def test_self_heals_on_hallucinated_component(ctx):
    session, page, build = ctx
    _, run, fake = build([
        turn_insert(component="NotAComponent"),
        turn_insert(),
        {"text": "Added the button."},
    ])
    events = list(orchestrator.stream_run(run, llm=fake))
    run.refresh_from_db()

    assert run.status == AgentRun.Status.COMPLETED
    failed_events = [e for e in events if e["type"] == "tool_failed"]
    assert failed_events and "NotAComponent" in failed_events[0]["error"]

    # The validation error was fed back as the tool result
    tool_content = (
        session.messages.filter(role=AgentMessage.Role.TOOL).first().content
    )
    assert tool_content["tool_call_id"]


@pytest.mark.django_db
def test_selfheal_cap_fails_gracefully(ctx, settings):
    session, page, build = ctx
    settings.AGENT_MAX_SELFHEAL_RETRIES = 2
    _, run, fake = build([
        turn_insert(component="Nope1"),
        turn_insert(component="Nope2"),
        turn_insert(component="Nope3"),
        turn_insert(component="Nope4"),
    ])
    list(orchestrator.stream_run(run, llm=fake))
    run.refresh_from_db()

    assert run.status == AgentRun.Status.FAILED
    assert run.finish_reason == "selfheal_capped"
    last = (
        session.messages.filter(role=AgentMessage.Role.ASSISTANT)
        .order_by("-id")
        .first()
    )
    assert "stopped" in last.content["content"]


@pytest.mark.django_db
def test_turn_budget_exhausts_gracefully(ctx, settings):
    session, page, build = ctx
    settings.AGENT_MAX_TURNS = 1
    _, run, fake = build([
        turn_insert(),
        turn_insert(),  # second turn blocked by the cap
    ])
    events = list(orchestrator.stream_run(run, llm=fake))
    run.refresh_from_db()

    assert run.status == AgentRun.Status.BUDGET_EXHAUSTED
    assert run.finish_reason == "turns"
    assert events[-1]["reason"] == "turns"
    last = (
        session.messages.filter(role=AgentMessage.Role.ASSISTANT)
        .order_by("-id")
        .first()
    )
    assert "work limit" in last.content["content"]


@pytest.mark.django_db
def test_token_budget_exhausts(ctx, settings):
    session, page, build = ctx
    settings.AGENT_MAX_TOKENS_RUN_TOTAL = 5  # fake turns report tokens_in=10
    _, run, fake = build([turn_insert(), {"text": "done"}])
    list(orchestrator.stream_run(run, llm=fake))
    run.refresh_from_db()
    assert run.status == AgentRun.Status.BUDGET_EXHAUSTED
    assert run.finish_reason == "tokens"


@pytest.mark.django_db
def test_cancel_between_turns(ctx):
    session, page, build = ctx
    _, run, fake = build([turn_insert(), {"text": "never reached"}])
    original_stream = orchestrator.stream_run

    def cancel_after_first_tool(*args, **kwargs):
        for event in original_stream(*args, **kwargs):
            yield event
            if event["type"] == "tool_succeeded":
                AgentRun.objects.filter(pk=run.pk).update(cancel_requested=True)

    events = list(cancel_after_first_tool(run, llm=fake))
    run.refresh_from_db()

    assert run.status == AgentRun.Status.CANCELLED
    assert events[-1]["status"] == "cancelled"


@pytest.mark.django_db
def test_revert_restores_tree(ctx, api):
    session, page, build = ctx
    _, run, fake = build([turn_insert(label="First"), {"text": "done"}])
    list(orchestrator.stream_run(run, llm=fake))

    page.refresh_from_db()
    assert len(page.tree["children"]) == 1

    api.force_authenticate(user=page.site.workspace.owner)
    resp = api.post(f"/api/v1/agent/runs/{run.id}/revert/")
    assert resp.status_code == 200
    assert resp.data["reverted_page_ids"] == [str(page.id)]

    page.refresh_from_db()
    assert page.tree["children"] == []


@pytest.mark.django_db
def test_revert_without_mutations_is_400(ctx, api):
    session, page, build = ctx
    _, run, fake = build([{"text": "just chat"}])
    list(orchestrator.stream_run(run, llm=fake))
    api.force_authenticate(user=page.site.workspace.owner)
    resp = api.post(f"/api/v1/agent/runs/{run.id}/revert/")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_wall_clock_budget(ctx, settings):
    session, page, build = ctx
    settings.AGENT_RUN_TIMEOUT_S = -1  # expired immediately
    _, run, fake = build([{"text": "hello"}])
    list(orchestrator.stream_run(run, llm=fake))
    run.refresh_from_db()
    assert run.status == AgentRun.Status.BUDGET_EXHAUSTED
    assert run.finish_reason == "wall_clock"


@pytest.mark.django_db
def test_llm_error_fails_run(ctx):
    session, page, build = ctx

    class Exploding:
        model = "fake"

        def stream_turn(self, messages, tools):
            raise LLMError("gateway down")
            yield  # pragma: no cover

    _, run, _ = build([])
    events = list(orchestrator.stream_run(run, llm=Exploding()))
    run.refresh_from_db()
    assert run.status == AgentRun.Status.FAILED
    assert any(e["type"] == "error" for e in events)
    assert UsageEvent.objects.get().meta["reason"] == "llm_error"

