from django.urls import path

from .views import (
    MessageListView,
    RunCancelView,
    RunEventsView,
    RunRevertView,
    SessionDetailView,
    SessionListCreateView,
)

urlpatterns = [
    path("sessions/", SessionListCreateView.as_view(), name="agent-sessions"),
    path("sessions/<uuid:session_id>/", SessionDetailView.as_view(), name="agent-session"),
    path("sessions/<uuid:session_id>/messages/", MessageListView.as_view(), name="agent-messages"),
    path("runs/<uuid:run_id>/events/", RunEventsView.as_view(), name="agent-run-events"),
    path("runs/<uuid:run_id>/cancel/", RunCancelView.as_view(), name="agent-run-cancel"),
    path("runs/<uuid:run_id>/revert/", RunRevertView.as_view(), name="agent-run-revert"),
]
