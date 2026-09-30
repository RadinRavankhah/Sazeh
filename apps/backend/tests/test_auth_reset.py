"""Password reset via allauth headless (Phase 3 remainder).

The reset email must link to the SPA route configured in
HEADLESS_FRONTEND_URLS (/auth/reset-password?key=…), and the reset endpoint
must accept the key from that link.
"""
import re

import pytest
from django.core import mail

PASSWORD_REQUEST_URL = "/_allauth/browser/v1/auth/password/request"
PASSWORD_RESET_URL = "/_allauth/browser/v1/auth/password/reset"
SPA_RESET_PATH = "/auth/reset-password?key="

NEW_PASSWORD = "brand-new-pass-456"


def key_from_email(body: str) -> str:
    match = re.search(r"[?&]key=([A-Za-z0-9\-_]+)", body)
    assert match is not None, f"No reset key in email: {body!r}"
    return match.group(1)


@pytest.mark.django_db
def test_password_request_sends_spa_link(api, user_a):
    resp = api.post(PASSWORD_REQUEST_URL, {"email": user_a.email}, format="json")
    assert resp.status_code in (200, 401)  # allauth may 401 for flows it flags
    assert len(mail.outbox) == 1
    body = " ".join(mail.outbox[0].body.split())
    assert SPA_RESET_PATH in body


@pytest.mark.django_db
def test_password_request_unknown_email_is_quiet(api, db):
    """No user enumeration: unknown emails get the same status code as known
    ones (allauth may mail a courtesy notice, but never a reset link)."""
    resp = api.post(
        PASSWORD_REQUEST_URL, {"email": "nobody@example.com"}, format="json"
    )
    assert resp.status_code in (200, 401)
    for message in mail.outbox:  # no usable reset key may leak
        assert SPA_RESET_PATH not in message.body


@pytest.mark.django_db
def test_password_reset_completes_and_new_password_logs_in(api, user_a):
    api.post(PASSWORD_REQUEST_URL, {"email": user_a.email}, format="json")
    key = key_from_email(mail.outbox[0].body)

    resp = api.post(
        PASSWORD_RESET_URL,
        {"key": key, "password": NEW_PASSWORD},
        format="json",
    )
    # allauth answers the anonymous success with its "not authenticated yet"
    # 401 (it never auto-logs-in after a reset) — the reset itself happened.
    assert resp.status_code in (200, 401)

    login = api.post(
        "/_allauth/browser/v1/auth/login",
        {"email": user_a.email, "password": NEW_PASSWORD},
        format="json",
    )
    assert login.status_code == 200


@pytest.mark.django_db
def test_password_reset_bad_key_is_rejected(api, db):
    resp = api.post(
        PASSWORD_RESET_URL,
        {"key": "not-a-real-key", "password": NEW_PASSWORD},
        format="json",
    )
    assert resp.status_code == 400
