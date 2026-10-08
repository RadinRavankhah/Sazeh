"""
Django settings for Sazeh.
Values are loaded from environment via pydantic-settings, then mapped to Django.
"""
from pathlib import Path

import dj_database_url
from pydantic_settings import BaseSettings, SettingsConfigDict

# ---------------------------------------------------------------------------
# 1. Pydantic settings from environment
# ---------------------------------------------------------------------------

class _Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Django
    DJANGO_SECRET_KEY: str = "insecure-dev-key-change-me"
    DJANGO_DEBUG: bool = False
    DJANGO_ALLOWED_HOSTS: str = "localhost,127.0.0.1"

    # Database
    DATABASE_URL: str = "postgres://sazeh:sazeh@localhost:5432/sazeh"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # AWS
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_STORAGE_BUCKET_NAME: str = "sazeh-media"
    AWS_S3_REGION_NAME: str = "us-east-1"

    # VPS hosting (Phase 7 — no AWS needed for MVP)
    PUBLISH_BUNDLE_DIR: str = "/var/www/sazeh/bundles"
    PLATFORM_DOMAIN: str = "platform.app"
    CLOUDFLARE_DNS_TOKEN: str = ""
    CLOUDFLARE_ZONE_ID: str = ""

    # LLM (OpenAI-compatible: base URL, key, and model are env-configured;
    # see decision D0.2 in sazeh-dev-plan-v2.md)
    LLM_PROVIDER: str = "openai"
    LLM_BASE_URL: str = ""  # e.g. https://api.openai.com/v1 or a custom gateway
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "gpt-4o-mini"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"

    # Agent run budgets (decision D5.4 — env-overridable defaults)
    AGENT_MAX_TURNS: int = 25
    AGENT_MAX_TOKENS_RUN_TOTAL: int = 100_000
    AGENT_MAX_TOKENS_RUN_OUTPUT: int = 32_000
    AGENT_MAX_SELFHEAL_RETRIES: int = 2
    AGENT_RUN_TIMEOUT_S: int = 300
    AGENT_LLM_TIMEOUT_S: int = 120
    AGENT_LLM_ADAPTER: str = "openai"  # "fake" in tests (scripted)
    AGENT_LOCKS: str = "redis"  # "off" in tests (no redis service)

    # Logging (console verbosity; empty = DEBUG in dev, INFO in prod)
    LOG_LEVEL: str = ""

    # Email (empty = console backend in dev, SMTP in prod)
    EMAIL_BACKEND: str = ""
    DEFAULT_FROM_EMAIL: str = "Sazeh <noreply@sazeh.local>"


_env = _Settings()

# ---------------------------------------------------------------------------
# 2. Django core
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = _env.DJANGO_SECRET_KEY
DEBUG = _env.DJANGO_DEBUG
ALLOWED_HOSTS = [h.strip() for h in _env.DJANGO_ALLOWED_HOSTS.split(",") if h.strip()]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.sites",
    # Third-party
    "rest_framework",
    "corsheaders",
    "allauth",
    "allauth.account",
    "allauth.headless",
    "django_filters",
    # Local apps
    "apps.accounts",
    "apps.workspaces",
    "apps.registry",
    "apps.sites",
    "apps.agent",
    "apps.usage",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Database
DATABASES = {
    "default": dj_database_url.parse(
        _env.DATABASE_URL,
        conn_max_age=600,
        conn_health_checks=True,
    )
}

# Auth
AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]
SITE_ID = 1
ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_USERNAME_REQUIRED = False
ACCOUNT_AUTHENTICATION_METHOD = "email"
# MVP (D3.1): email/password only, no SMTP in dev — verification deferred.
ACCOUNT_EMAIL_VERIFICATION = "none"

# allauth headless: SPA-only auth over session cookies (decision D3.2).
HEADLESS_ONLY = True
HEADLESS_CLIENT_TYPE = "browser"
# SPA routes allauth refers to in emails/redirects (wired as UI lands).
HEADLESS_FRONTEND_URLS = {
    "account_confirm_email": "/auth/verify-email?key={key}",
    "account_reset_password_from_key": "/auth/reset-password?key={key}",
    "account_set_password_from_key": "/auth/set-password?key={key}",
    "account_signup": "/signup",
    "account_login": "/login",
    "account_logout": "/",
    "email_verification_sent": "/auth/verify-email-sent",
}

# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# 3. DRF
# ---------------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
}

# ---------------------------------------------------------------------------
# 4. CORS / CSRF (dev: Vite on 5173 talks to Django on 8000)
# ---------------------------------------------------------------------------

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
SESSION_COOKIE_SAMESITE = "Lax"

# Email: console backend in dev (reset emails print to the runserver
# terminal); override with the env for real SMTP in prod.
EMAIL_BACKEND = _env.EMAIL_BACKEND or (
    "django.core.mail.backends.console.EmailBackend"
    if DEBUG
    else "django.core.mail.backends.smtp.EmailBackend"
)

# ---------------------------------------------------------------------------
# 5. Redis / Cache
# ---------------------------------------------------------------------------

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": _env.REDIS_URL,
    }
}

# ---------------------------------------------------------------------------
# 6. Celery
# ---------------------------------------------------------------------------

CELERY_BROKER_URL = _env.CELERY_BROKER_URL
CELERY_RESULT_BACKEND = _env.REDIS_URL
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "UTC"

# ---------------------------------------------------------------------------
# 7. Application settings
# ---------------------------------------------------------------------------

# LLM
LLM_PROVIDER = _env.LLM_PROVIDER
LLM_BASE_URL = _env.LLM_BASE_URL
LLM_API_KEY = _env.LLM_API_KEY
LLM_MODEL = _env.LLM_MODEL

# VPS hosting (Phase 7 — no AWS needed for MVP)
PUBLISH_BUNDLE_DIR = _env.PUBLISH_BUNDLE_DIR or "/var/www/sazeh/bundles"
PLATFORM_DOMAIN = _env.PLATFORM_DOMAIN or "platform.app"
CLOUDFLARE_DNS_TOKEN = _env.CLOUDFLARE_DNS_TOKEN
CLOUDFLARE_ZONE_ID = _env.CLOUDFLARE_ZONE_ID

# Redis lock prefix (agent orchestrator)
REDIS_LOCK_PREFIX = "sazeh:locks:"

# Limits
DEFAULT_FREE_SITES_LIMIT = 1
DEFAULT_FREE_PAGES_LIMIT = 5
DEFAULT_FREE_CREDITS = 50

# ---------------------------------------------------------------------------
# 8. Logging (structlog: JSON in prod, pretty console in dev)
# ---------------------------------------------------------------------------

import structlog  # noqa: E402

_LOG_LEVEL = (_env.LOG_LEVEL or ("DEBUG" if DEBUG else "INFO")).upper()
_TIMESTAMPER = structlog.processors.TimeStamper(fmt="iso", utc=True)

_PRE_CHAIN: list = [
    structlog.contextvars.merge_contextvars,
    structlog.stdlib.add_logger_name,
    structlog.stdlib.add_log_level,
    _TIMESTAMPER,
    structlog.stdlib.ExtraAdder(),
    structlog.processors.StackInfoRenderer(),
    structlog.processors.format_exc_info,
]

structlog.configure(
    processors=[
        *_PRE_CHAIN,
        structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
    ],
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

_formatter = structlog.stdlib.ProcessorFormatter(
    foreign_pre_chain=_PRE_CHAIN,
    processors=[
        structlog.stdlib.ProcessorFormatter.remove_processors_meta,
        structlog.processors.JSONRenderer()
        if not DEBUG
        else structlog.dev.ConsoleRenderer(colors=False),
    ],
)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"structlog": {"()": lambda: _formatter}},
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "structlog"},
    },
    "loggers": {
        "agent": {"handlers": ["console"], "level": _LOG_LEVEL, "propagate": False},
        "django": {"handlers": ["console"], "level": _LOG_LEVEL},
        "django.server": {"handlers": ["console"], "level": _LOG_LEVEL},
    },
}
