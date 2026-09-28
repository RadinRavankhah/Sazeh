"""Tests for the site theme tokens (decision D2.2 — extended granularity)."""
import pytest

from apps.sites.theme import DEFAULT_THEME, apply_theme, validate_theme


def test_valid_theme_passes():
    assert validate_theme({
        "accent_color": "#10b981",
        "font_family": "geist",
        "radius": "lg",
        "heading_scale": "compact",
    }) == []


def test_default_theme_passes():
    assert validate_theme(DEFAULT_THEME) == []


def test_invalid_accent_color_is_flagged():
    errors = validate_theme({"accent_color": "blue"})
    assert errors and "accent_color" in errors[0]


def test_invalid_enum_values_are_flagged():
    for key, value in (
        ("font_family", "comic-sans"),
        ("radius", "xxl"),
        ("heading_scale", "gigantic"),
    ):
        errors = validate_theme({key: value})
        assert errors, key


def test_unknown_tokens_are_rejected():
    errors = validate_theme({"evil_token": "#fff000"})
    assert errors


@pytest.mark.django_db
def test_apply_theme_merges_into_site_config(user_a, site_a):
    errors = apply_theme(site_a, {"accent_color": "#f59e0b", "radius": "lg"})
    assert errors == []
    site_a.refresh_from_db()
    assert site_a.config["theme"]["accent_color"] == "#f59e0b"
    assert site_a.config["theme"]["font_family"] == DEFAULT_THEME["font_family"]


@pytest.mark.django_db
def test_apply_theme_rejects_invalid(user_a, site_a):
    before = site_a.config
    errors = apply_theme(site_a, {"accent_color": "not-a-color"})
    assert errors
    site_a.refresh_from_db()
    assert site_a.config == before
