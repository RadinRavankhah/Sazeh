"""Session auth flow via allauth headless (decision D3.2: session cookies).

The SPA talks to /_allauth/browser/v1/* with credentials: "include" and a
CSRF token header; these tests prove signup/login/logout round-trips and
that /api/v1/me/ exposes the auto-created personal workspace.
"""
import pytest
from django.test import Client

SIGNUP = "/_allauth/browser/v1/auth/signup"
LOGIN = "/_allauth/browser/v1/auth/login"
SESSION = "/_allauth/browser/v1/auth/session"


def post_json(client: Client, url: str, payload: dict, **kwargs):
    return client.post(url, payload, content_type="application/json", **kwargs)


@pytest.mark.django_db
def test_signup_authenticates_session_and_creates_workspace():
    c = Client()
    resp = post_json(c, SIGNUP, {
        "email": "founder@example.com",
        "password": "long-enough-Pw1",
    })
    assert resp.status_code == 200, resp.content

    resp = c.get("/api/v1/me/")
    assert resp.status_code == 200
    ws = resp.data["default_workspace"]
    assert ws is not None
    assert ws["slug"] == "founder"
    assert ws["plan"] == "free"


@pytest.mark.django_db
def test_login_and_logout_roundtrip():
    c = Client()
    assert post_json(c, SIGNUP, {
        "email": "login@example.com", "password": "long-enough-Pw1",
    }).status_code == 200
    # Logout = DELETE the session (allauth headless protocol)
    assert c.delete(SESSION).status_code == 401

    resp = post_json(c, LOGIN, {
        "email": "login@example.com", "password": "long-enough-Pw1",
    })
    assert resp.status_code == 200

    resp = c.get("/api/v1/me/")
    assert resp.status_code == 200
    assert resp.data["email"] == "login@example.com"


@pytest.mark.django_db
def test_me_requires_authentication():
    c = Client()
    resp = c.get("/api/v1/me/")
    assert resp.status_code in (401, 403)


@pytest.mark.django_db
def test_session_reports_anonymous_then_authenticated():
    c = Client()
    resp = c.get(SESSION)
    assert resp.status_code == 401

    post_json(c, SIGNUP, {"email": "sess@example.com", "password": "long-enough-Pw1"})
    resp = c.get(SESSION)
    assert resp.status_code == 200
    assert resp.json()["meta"]["is_authenticated"] is True


@pytest.mark.django_db
def test_signup_rejects_weak_password():
    c = Client()
    resp = post_json(c, SIGNUP, {"email": "weak@example.com", "password": "123"})
    assert resp.status_code == 400
