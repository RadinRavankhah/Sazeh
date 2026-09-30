"""Agent REST + SSE surface (dev plan v2 §7).

The run loop executes inside the SSE request (GET /runs/{id}/events/) so a
generation lives and dies with its stream — the MVP topology, with the
adapter/orchestrator designed to move behind Celery later unchanged.
"""
from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import structlog
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.sites.models import Page, Site
from apps.sites.validators import validate_tree
from apps.workspaces.scoping import member_workspaces

from .context import find_node
from .locks import session_lock
from .models import AgentMessage, AgentRun, AgentSession, ToolRun
from .orchestrator import stream_run
from .serializers import (
    AgentMessageSerializer,
    AgentRunSerializer,
    AgentSessionSerializer,
    PostMessageSerializer,
)

logger = structlog.get_logger("agent.api")


def session_for(request, session_id: str) -> AgentSession:
    """Session lookup scoped to the requester's workspaces (tenancy floor)."""
    return get_object_or_404(
        AgentSession,
        pk=session_id,
        workspace__in=member_workspaces(request.user),
    )


def run_for(request, run_id: str) -> AgentRun:
    return get_object_or_404(
        AgentRun,
        pk=run_id,
        session__workspace__in=member_workspaces(request.user),
    )


def _sse(event: dict[str, Any]) -> str:
    name = event.pop("type")
    return f"event: {name}\ndata: {json.dumps(event)}\n\n"


class SessionListCreateView(ListCreateAPIView):
    serializer_class = AgentSessionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = AgentSession.objects.filter(
            workspace__in=member_workspaces(self.request.user)
        ).select_related("site", "page")
        site_id = self.request.query_params.get("site")
        if site_id:
            qs = qs.filter(site_id=site_id)
        return qs

    def perform_create(self, serializer):
        data = self.request.data
        site = get_object_or_404(
            Site, pk=data.get("site"), workspace__in=member_workspaces(self.request.user)
        )
        page = None
        page_id = data.get("page")
        if page_id:
            page = get_object_or_404(Page, pk=page_id, site=site)
        serializer.save(
            workspace=site.workspace, site=site, page=page,
            title=data.get("title", "")[:255],
        )


class SessionDetailView(RetrieveUpdateDestroyAPIView):
    serializer_class = AgentSessionSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "session_id"

    def get_queryset(self):
        return AgentSession.objects.filter(
            workspace__in=member_workspaces(self.request.user)
        )

    def perform_update(self, serializer):
        page_id = self.request.data.get("page")
        if page_id is not None and page_id != "":
            get_object_or_404(
                Page, pk=page_id, site=self.get_object().site
            )
        serializer.save()


class MessageListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, session_id: str):
        session = session_for(request, session_id)
        messages = session.messages.all()
        return Response(AgentMessageSerializer(messages, many=True).data)

    def post(self, request, session_id: str):
        session = session_for(request, session_id)
        serializer = PostMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        active = AgentRun.objects.filter(
            session=session, status__in=[AgentRun.Status.PENDING, AgentRun.Status.RUNNING]
        ).exists()
        if active:
            return Response(
                {"detail": "This chat is already running — wait or cancel first."},
                status=status.HTTP_409_CONFLICT,
            )

        content = serializer.validated_data["content"]
        page_id = serializer.validated_data.get("page")
        selection = serializer.validated_data.get("selection")

        # D6.1 selection context: the referenced page must belong to the
        # session's site and the node must still exist in its tree.
        selection_page = None
        if selection:
            selection_page = get_object_or_404(
                Page, pk=selection["page"], site=session.site
            )
            if find_node(selection_page.tree or {}, selection["node"]) is None:
                return Response(
                    {"selection": {"node": ["Selected element no longer exists on this page."]}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            page_id = page_id or selection_page.id

        if page_id:
            get_object_or_404(Page, pk=page_id, site=session.site)

        user_message = AgentMessage.objects.create(
            session=session,
            role=AgentMessage.Role.USER,
            content={"role": "user", "content": content},
        )
        if not session.title:
            session.title = content[:48]
            session.save(update_fields=["title", "updated_at"])
        if page_id:
            session.page_id = page_id
            session.save(update_fields=["page", "updated_at"])

        run = AgentRun.objects.create(
            session=session,
            page_id=page_id or session.page_id,
            selection_node_id=(selection["node"] if selection else None),
        )
        logger.info("run.created", run_id=str(run.id), session_id=str(session.id))
        return Response(
            {
                "message": AgentMessageSerializer(user_message).data,
                "run": AgentRunSerializer(run).data,
            },
            status=status.HTTP_201_CREATED,
        )


class RunEventsView(APIView):
    """SSE: drives the run loop (if fresh) or replays a terminal run."""

    permission_classes = [IsAuthenticated]

    def get(self, request, run_id: str):
        run = run_for(request, run_id)

        if run.status in {AgentRun.Status.PENDING, AgentRun.Status.RUNNING}:
            lock = session_lock(str(run.session_id))
            if not lock.acquire(block=False):
                return self._replay_response(run, busy=True)
            generator = self._drive(run)
            response = StreamingHttpResponse(
                streaming_content=(_sse(e) for e in generator),
                content_type="text/event-stream",
            )
            response["Cache-Control"] = "no-cache"
            response["X-Accel-Buffering"] = "no"
            return response
        return self._replay_response(run)

    def _replay_response(self, run: AgentRun, busy: bool = False) -> StreamingHttpResponse:
        def events() -> Iterator[dict[str, Any]]:
            if busy:
                yield {
                    "type": "error",
                    "code": "busy",
                    "message": "This chat is already generating a reply.",
                }
                return
            last = (
                run.session.messages.filter(role=AgentMessage.Role.ASSISTANT)
                .order_by("-created_at")
                .first()
            )
            text = ""
            if last and isinstance(last.content, dict):
                text = last.content.get("content") or ""
            if text:
                yield {"type": "message_delta", "text": text}
            yield {
                "type": "run_completed",
                "run_id": str(run.id),
                "status": run.status,
                "reason": run.finish_reason,
                "message_id": str(last.id) if last else None,
                "tokens_in": run.tokens_in,
                "tokens_out": run.tokens_out,
            }

        response = StreamingHttpResponse(
            streaming_content=(_sse(e) for e in events()),
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache"
        return response

    def _drive(self, run: AgentRun) -> Iterator[dict[str, Any]]:
        try:
            yield from stream_run(run)
        except Exception:  # pragma: no cover - defensive
            logger.exception("run.crashed", run_id=str(run.id))
            run.status = AgentRun.Status.FAILED
            run.finish_reason = "internal error"
            run.finished_at = timezone.now()
            run.save(update_fields=["status", "finish_reason", "finished_at"])
            yield {"type": "error", "code": "internal", "message": "The agent run failed."}
        finally:
            lock = session_lock(str(run.session_id))
            try:
                lock.release()
            except Exception:  # noqa: S110 - best effort
                pass


class RunCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, run_id: str):
        run = run_for(request, run_id)
        if run.status == AgentRun.Status.PENDING:
            run.status = AgentRun.Status.CANCELLED
            run.finish_reason = "cancelled before start"
            run.finished_at = timezone.now()
            run.save(update_fields=["status", "finish_reason", "finished_at"])
        elif run.status in {AgentRun.Status.PENDING, AgentRun.Status.RUNNING}:
            run.cancel_requested = True
            run.save(update_fields=["cancel_requested"])
        else:
            return Response({"detail": "Run already finished."}, status=400)
        return Response(AgentRunSerializer(run).data)


class RunRevertView(APIView):
    """Restore every page this run mutated to its pre-run state (D5.1)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, run_id: str):
        run = run_for(request, run_id)
        if run.status == AgentRun.Status.RUNNING:
            return Response({"detail": "Cancel the run before reverting."}, status=409)

        tool_runs = list(
            ToolRun.objects.filter(message__session__runs=run)
            .select_related("message")
            .order_by("created_at")
        )
        restored: list[str] = []
        seen_pages: set[str] = set()
        for tool_run in tool_runs:
            if tool_run.tree_snapshot_before is None:
                continue
            args = tool_run.args or {}
            page_id = str(args.get("page_id") or "")
            if not page_id or page_id in seen_pages:
                continue
            seen_pages.add(page_id)
            snapshot = tool_run.tree_snapshot_before
            errors = validate_tree(snapshot)
            if errors:
                logger.warning("revert.snapshot_invalid", run_id=str(run.id), page_id=page_id)
                continue
            updated = Page.objects.filter(pk=page_id, site=run.session.site).update(
                tree=snapshot
            )
            if updated:
                restored.append(page_id)

        if not restored:
            return Response(
                {"detail": "Nothing to revert — this run did not change any page tree."},
                status=400,
            )
        logger.info("run.reverted", run_id=str(run.id), pages=restored)
        return Response({"reverted_page_ids": restored})

