"""Redis access for the agent orchestrator (locks, cancel flags).

Locks use redis-py's token-checked Lock (SET NX PX + compare-on-release).
A per-session lock guarantees one generation at a time; the TTL is a crash
safety net so a dead worker never holds a chat hostage.

In tests (no Redis service) `settings.AGENT_LOCKS = "off"` hands out
process-local threading locks instead.
"""
from __future__ import annotations

import functools
import threading
from typing import TYPE_CHECKING, Any

from django.conf import settings

if TYPE_CHECKING:
    from types import TracebackType


class _NoLock:
    """Drop-in stand-in for redis.Lock when lock backend is disabled."""

    def __init__(self) -> None:
        self._lock = threading.Lock()

    def acquire(self, block: bool = False) -> bool:  # noqa: ARG002
        return self._lock.acquire(blocking=False)

    def release(self) -> None:
        self._lock.release()

    def __enter__(self) -> _NoLock:
        self._lock.acquire()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if self._lock.locked():
            self._lock.release()


@functools.lru_cache(maxsize=1)
def _redis() -> Any:
    import redis  # local import: only needed when locks are enabled

    return redis.Redis.from_url(
        settings.REDIS_URL, decode_responses=True, socket_timeout=5
    )


def session_lock(session_id: str) -> Any:
    """Acquire-able lock for one agent session (context manager)."""
    if getattr(settings, "AGENT_LOCKS", "redis") == "off":
        return _NoLock()
    name = f"{settings.REDIS_LOCK_PREFIX}agent-session:{session_id}"
    return _redis().lock(
        name,
        timeout=getattr(settings, "AGENT_RUN_TIMEOUT_S", 300) + 60,
        blocking_timeout=0.05,  # never queue: a busy chat rejects, not waits
    )
