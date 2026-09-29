"""LLM adapter (decision D0.2 — OpenAI-compatible endpoint).

One adapter speaks the OpenAI wire format (chat completions + tool calling +
streaming) against any compatible gateway. The orchestrator consumes a
version-agnostic event stream, so the SDK is an implementation detail.

Transport-level failures (timeouts, 5xx, rate limits) are retried here with
backoff — the orchestrator only ever sees model-level results.
"""
from __future__ import annotations

import json
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any, Protocol

import structlog
from django.conf import settings

logger = structlog.get_logger("agent.llm")


@dataclass
class ToolCall:
    """One tool invocation requested by the model (args still a JSON string)."""

    id: str
    name: str
    arguments: str  # raw JSON — parsed by the tool layer for error context


@dataclass
class TurnResult:
    """The complete result of one LLM turn."""

    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    tokens_in: int = 0
    tokens_out: int = 0
    model: str = ""


class LLMError(Exception):
    """Non-retryable model/protocol failure."""


class LLMAdapter(Protocol):
    """The seam the orchestrator loops over (and tests fake out)."""

    def stream_turn(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> Iterator[dict[str, Any]]:
        """Yield {"type": "text_delta", "text"} events; return TurnResult."""
        ...  # pragma: no cover


class OpenAICompatAdapter:
    """Streaming chat-completions adapter for OpenAI-compatible endpoints."""

    RETRYABLE_STATUS = {408, 409, 429, 500, 502, 503, 504}

    def __init__(self, model: str | None = None) -> None:
        from openai import OpenAI  # local import: optional dependency at boot

        self.model = model or settings.LLM_MODEL
        self._client = OpenAI(
            base_url=settings.LLM_BASE_URL or None,
            api_key=settings.LLM_API_KEY or "missing-key",
            timeout=getattr(settings, "AGENT_LLM_TIMEOUT_S", 120),
            max_retries=0,  # we own retry policy (backoff + Retry-After)
        )

    def stream_turn(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> Iterator[dict[str, Any]]:
        attempts = 2
        for attempt in range(1, attempts + 1):
            try:
                yield from self._stream_once(messages, tools)
                return
            except LLMError:
                raise
            except Exception as exc:  # transport / protocol — maybe retryable
                status = getattr(exc, "status_code", None)
                retry_after = self._retry_after(exc)
                retryable = status is None or status in self.RETRYABLE_STATUS
                if not retryable or attempt == attempts:
                    logger.error(
                        "llm.call_failed", attempt=attempt, error=str(exc), status=status
                    )
                    raise LLMError(f"LLM request failed: {exc}") from exc
                delay = max(retry_after, 2**attempt)
                logger.warning(
                    "llm.call_retry", attempt=attempt, delay_s=delay, status=status
                )
                time.sleep(delay)

    def _stream_once(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> Iterator[dict[str, Any]]:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if tools:
            kwargs["tools"] = tools

        # The SDK raises on connection/auth errors before iteration starts.
        response = self._client.chat.completions.create(**kwargs)

        text_parts: list[str] = []
        tool_calls: dict[int, dict[str, Any]] = {}
        usage = None

        for chunk in response:
            if chunk.usage is not None:
                usage = chunk.usage
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta.content:
                text_parts.append(delta.content)
                yield {"type": "text_delta", "text": delta.content}
            for tc in delta.tool_calls or []:
                slot = tool_calls.setdefault(
                    tc.index, {"id": "", "name": "", "arguments": ""}
                )
                if tc.id:
                    slot["id"] = tc.id
                if tc.function and tc.function.name:
                    slot["name"] += tc.function.name
                if tc.function and tc.function.arguments:
                    slot["arguments"] += tc.function.arguments

        result = TurnResult(
            text="".join(text_parts),
            tool_calls=[
                ToolCall(id=slot["id"], name=slot["name"], arguments=slot["arguments"])
                for slot in (tool_calls[key] for key in sorted(tool_calls))
            ],
            tokens_in=getattr(usage, "prompt_tokens", 0) or 0,
            tokens_out=getattr(usage, "completion_tokens", 0) or 0,
            model=self.model,
        )
        yield {"type": "turn", "result": result}

    @staticmethod
    def _retry_after(exc: Exception) -> float:
        raw = getattr(exc, "response", None)
        header = getattr(raw, "headers", {}).get("retry-after") if raw else None
        try:
            return float(header) if header else 0.0
        except (TypeError, ValueError):
            return 0.0


class FakeLLMAdapter:
    """Scripted adapter for deterministic orchestrator tests.

    `script` is a list of TurnResult factory values (dicts or TurnResult);
    each stream_turn pops the next one. Text is streamed in deltas so the
    SSE protocol is exercised.
    """

    def __init__(self, script: list[TurnResult | dict[str, Any]]) -> None:
        self.script = list(script)
        self.calls: list[dict[str, Any]] = []

    def stream_turn(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> Iterator[dict[str, Any]]:
        self.calls.append({"messages": messages, "tools": tools})
        if not self.script:
            raise LLMError("FakeLLM script exhausted")
        item = self.script.pop(0)
        result = (
            item
            if isinstance(item, TurnResult)
            else TurnResult(
                text=item.get("text", ""),
                tool_calls=[
                    ToolCall(
                        id=f"call_{i}",
                        name=tc["name"],
                        arguments=json.dumps(tc.get("arguments", {})),
                    )
                    for i, tc in enumerate(item.get("tool_calls", []))
                ],
                tokens_in=item.get("tokens_in", 10),
                tokens_out=item.get("tokens_out", 5),
                model="fake",
            )
        )
        if result.text:
            for word in result.text.split(" "):
                yield {"type": "text_delta", "text": word + " "}
        yield {"type": "turn", "result": result}

