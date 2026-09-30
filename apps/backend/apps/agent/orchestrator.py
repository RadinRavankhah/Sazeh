"""The agent orchestrator loop (dev plan v2 §8) — hand-rolled by decision.

One generator per run drives the loop and yields protocol events; the SSE
view translates them to the wire. Invariants:

- Budgets (turns, total/output tokens, wall clock) are checked ONLY at turn
  boundaries — a tool call in flight always completes.
- Counters are persisted incrementally per turn, so a crashed worker loses
  nothing that matters for metering.
- Every page-tree mutation snapshots the tree into its ToolRun (revert path).
- Cancel is cooperative: checked between turns and before each tool call.
- The model can produce a *poor* page, never a *broken* one: validation is
  the floor, and validation errors are fed back for self-healing (capped).
"""
from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Any

import structlog
from django.conf import settings
from django.utils import timezone

from apps.usage.models import UsageEvent

from .context import build_messages
from .llm import LLMAdapter, LLMError, OpenAICompatAdapter, TurnResult
from .models import AgentMessage, AgentRun, ToolRun
from .tools import execute_tool, tool_definitions

logger = structlog.get_logger("agent.orchestrator")

# Tests inject scripted turns here when settings.AGENT_LLM_ADAPTER == "fake".
FAKE_SCRIPT: list[TurnResult | dict[str, Any]] = []

BUDGET_MESSAGES = {
    "turns": (
        "I hit the work limit for this run — send another message and "
        "I'll pick up where I left off."
    ),
    "tokens": "I used up the token budget for this run — send another message to continue.",
    "output": "I hit the output limit for this run — send another message to continue.",
    "wall_clock": (
        "This run took too long, so I stopped to stay safe. "
        "Send another message to continue."
    ),
}


def get_llm() -> LLMAdapter:
    kind = getattr(settings, "AGENT_LLM_ADAPTER", "openai")
    if kind == "fake":
        from .llm import FakeLLMAdapter

        return FakeLLMAdapter(FAKE_SCRIPT)
    return OpenAICompatAdapter()


def _b(msg: dict[str, Any]) -> dict[str, Any]:
    return msg  # readability helper for message-list appends below


def stream_run(run: AgentRun, llm: LLMAdapter | None = None) -> Iterator[dict[str, Any]]:
    """Execute the run, yielding protocol events. The caller holds the lock."""
    session = run.session
    adapter = llm or get_llm()
    deadline = time.monotonic() + getattr(settings, "AGENT_RUN_TIMEOUT_S", 300)
    max_turns = getattr(settings, "AGENT_MAX_TURNS", 25)
    max_total = getattr(settings, "AGENT_MAX_TOKENS_RUN_TOTAL", 100_000)
    max_output = getattr(settings, "AGENT_MAX_TOKENS_RUN_OUTPUT", 32_000)
    max_selfheal = getattr(settings, "AGENT_MAX_SELFHEAL_RETRIES", 2)

    run.status = AgentRun.Status.RUNNING
    run.model_name = getattr(adapter, "model", "fake")
    run.save(update_fields=["status", "model_name"])
    logger.info(
        "run.started",
        run_id=str(run.id),
        session_id=str(session.id),
        site_id=str(session.site_id),
    )

    messages = build_messages(session, run)
    tools = tool_definitions()
    turns = 0
    tokens_in = 0
    tokens_out = 0
    failed_turns_in_a_row = 0

    def _persist_counters() -> None:
        run.turns = turns
        run.tokens_in = tokens_in
        run.tokens_out = tokens_out
        run.save(update_fields=["turns", "tokens_in", "tokens_out"])

    def _finish(
        status: str, reason: str, final_message: AgentMessage | None = None
    ) -> Iterator[dict[str, Any]]:
        run.status = status
        run.finish_reason = reason
        run.finished_at = timezone.now()
        run.save(
            update_fields=[
                "status", "finish_reason", "finished_at",
                "turns", "tokens_in", "tokens_out",
            ]
        )
        UsageEvent.objects.create(
            workspace=session.workspace,
            kind=UsageEvent.Kind.LLM_TOKENS,
            amount=tokens_in + tokens_out,
            meta={
                "run_id": str(run.id),
                "session_id": str(session.id),
                "model": run.model_name,
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "turns": turns,
                "reason": reason,
            },
        )
        logger.info(
            "run.finished",
            run_id=str(run.id),
            status=status,
            reason=reason,
            turns=turns,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
        )
        yield {
            "type": "run_completed",
            "run_id": str(run.id),
            "status": status,
            "reason": reason,
            "message_id": str(final_message.id) if final_message else None,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
        }

    def _budget_stop(reason_key: str) -> Iterator[dict[str, Any]]:
        message = AgentMessage.objects.create(
            session=session,
            role=AgentMessage.Role.ASSISTANT,
            content={"role": "assistant", "content": BUDGET_MESSAGES[reason_key]},
            model_name=run.model_name,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
        )
        logger.warning("run.budget_exhausted", run_id=str(run.id), reason=reason_key)
        yield {"type": "message_delta", "text": BUDGET_MESSAGES[reason_key]}
        yield from _finish(str(AgentRun.Status.BUDGET_EXHAUSTED), reason_key, message)

    while True:
        # --- budget checks at the turn boundary ----------------------------
        run.refresh_from_db(fields=["cancel_requested"])  # external cancels
        if run.cancel_requested:
            logger.info("run.cancelled", run_id=str(run.id))
            yield from _finish(str(AgentRun.Status.CANCELLED), "cancelled by user")
            return
        if time.monotonic() > deadline:
            yield from _budget_stop("wall_clock")
            return
        if turns >= max_turns:
            yield from _budget_stop("turns")
            return
        if tokens_in + tokens_out >= max_total:
            yield from _budget_stop("tokens")
            return
        if tokens_out >= max_output:
            yield from _budget_stop("output")
            return

        # --- one LLM turn ---------------------------------------------------
        try:
            text = ""
            result: TurnResult | None = None
            for event in adapter.stream_turn(messages, tools):
                if event["type"] == "text_delta":
                    text += event["text"]
                    yield {"type": "message_delta", "text": event["text"]}
                else:
                    result = event["result"]
            assert result is not None
        except LLMError as exc:
            message = AgentMessage.objects.create(
                session=session,
                role=AgentMessage.Role.ASSISTANT,
                content={
                    "role": "assistant",
                    "content": "Something went wrong talking to the AI service. "
                    "Try again in a moment.",
                },
                model_name=run.model_name,
            )
            logger.error("run.llm_error", run_id=str(run.id), error=str(exc))
            yield {"type": "error", "code": "llm_error", "message": str(exc)}
            yield from _finish(str(AgentRun.Status.FAILED), "llm_error", message)
            return

        turns += 1
        tokens_in += result.tokens_in
        tokens_out += result.tokens_out

        assistant_content: dict[str, Any] = {"role": "assistant", "content": result.text or None}
        if result.tool_calls:
            assistant_content["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.name, "arguments": tc.arguments},
                }
                for tc in result.tool_calls
            ]
        assistant_message = AgentMessage.objects.create(
            session=session,
            role=AgentMessage.Role.ASSISTANT,
            content=assistant_content,
            model_name=result.model,
            tokens_in=result.tokens_in,
            tokens_out=result.tokens_out,
        )
        _persist_counters()
        messages.append(_b(assistant_content))

        if not result.tool_calls:
            yield from _finish(str(AgentRun.Status.COMPLETED), "done", assistant_message)
            return

        # --- execute the turn's tool calls -----------------------------------
        any_success = False
        any_validation_error = False
        for tc in result.tool_calls:
            if run.cancel_requested:
                yield from _finish(str(AgentRun.Status.CANCELLED), "cancelled by user")
                return
            if time.monotonic() > deadline:
                yield from _budget_stop("wall_clock")
                return

            yield {
                "type": "tool_started",
                "run_id": str(run.id),
                "tool_name": tc.name,
            }
            outcome, snapshot = execute_tool(session, tc.name, tc.arguments)
            ok = outcome.get("ok") is True
            ToolRun.objects.create(
                message=assistant_message,
                tool_name=tc.name,
                args=_safe_args(tc),
                result_status=(
                    ToolRun.ResultStatus.SUCCESS
                    if ok
                    else ToolRun.ResultStatus.VALIDATION_ERROR
                    if outcome.get("code") == "validation_error"
                    else ToolRun.ResultStatus.ERROR
                ),
                result_summary=outcome,
                tree_snapshot_before=snapshot,
            )
            tool_event = {
                "type": "tool_succeeded" if ok else "tool_failed",
                "run_id": str(run.id),
                "tool_name": tc.name,
            }
            if ok and outcome.get("touched_node_ids"):
                tool_event["touched_node_ids"] = outcome["touched_node_ids"]
            if not ok:
                tool_event["error"] = outcome.get("error", "unknown error")
            yield tool_event

            tool_content = _b({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": _json_compact(outcome),
            })
            AgentMessage.objects.create(
                session=session,
                role=AgentMessage.Role.TOOL,
                content=tool_content,
                model_name=run.model_name,
            )
            messages.append(tool_content)
            if ok:
                any_success = True
            elif outcome.get("code") == "validation_error":
                any_validation_error = True

        # --- self-healing guard ----------------------------------------------
        failed_turns_in_a_row = 0 if any_success else failed_turns_in_a_row + 1
        if (
            failed_turns_in_a_row and any_validation_error
            and failed_turns_in_a_row > max_selfheal
        ):
            message = AgentMessage.objects.create(
                session=session,
                role=AgentMessage.Role.ASSISTANT,
                content={
                    "role": "assistant",
                    "content": "My last changes kept failing validation, so I stopped "
                    "rather than guess. The error was: "
                    + str(outcome.get("error", ""))[:200],
                },
                model_name=run.model_name,
            )
            logger.warning("run.selfheal_capped", run_id=str(run.id))
            yield from _finish(str(AgentRun.Status.FAILED), "selfheal_capped", message)
            return


def _safe_args(tc: Any) -> dict[str, Any]:
    """Tool args for audit — capped so a runaway payload can't bloat rows."""
    import json

    try:
        parsed = json.loads(tc.arguments or "{}")
        return parsed if isinstance(parsed, dict) else {"raw": str(parsed)[:500]}
    except json.JSONDecodeError:
        return {"raw": tc.arguments[:500]}


def _json_compact(payload: dict[str, Any]) -> str:
    import json

    return json.dumps(payload)

