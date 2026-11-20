"""Configuración del gateway Django para desarrollo local y Compose."""

import os
from secrets import token_urlsafe


SECRET_KEY = token_urlsafe(50)
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "[::1]", "ai-gateway"]
ROOT_URLCONF = "backend.urls"
MIDDLEWARE = ["django.middleware.common.CommonMiddleware"]
APPEND_SLASH = False
DEMO_ENABLED = os.environ.get("AI_GATEWAY_ENV") == "development"
