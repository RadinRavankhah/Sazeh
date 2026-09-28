"""
Test settings: hermetic by default (in-memory SQLite + LocMem cache).
CI can point DATABASE_URL at a real Postgres service to validate prod parity.
"""
import os

from .settings import *  # noqa: F401,F403

if os.environ.get("DATABASE_URL"):
    DATABASES = {
        "default": dj_database_url.parse(  # noqa: F405
            os.environ["DATABASE_URL"], conn_max_age=0
        )
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
        }
    }

CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}
}
