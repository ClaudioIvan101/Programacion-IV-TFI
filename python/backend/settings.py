"""Configuración del gateway Django para desarrollo local y Compose."""

import os
from secrets import token_urlsafe


SECRET_KEY = token_urlsafe(50)
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "[::1]", "ai-gateway"]
ROOT_URLCONF = "backend.urls"
INSTALLED_APPS = ["ai_gateway.apps.AiGatewayConfig"]
MIDDLEWARE = ["django.middleware.common.CommonMiddleware"]
APPEND_SLASH = False
DEMO_ENABLED = os.environ.get("AI_GATEWAY_ENV") == "development"
AI_GATEWAY_PROVIDER = os.environ.get("AI_GATEWAY_PROVIDER", "gemini")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
# Ruta al archivo PEM público que Django usa para verificar los tokens de Express.
SERVICE_JWT_PUBLIC_KEY_FILE = os.environ.get("AI_GATEWAY_SERVICE_JWT_PUBLIC_KEY_FILE")
