"""Punto de entrada de las rutas del proyecto Django."""

from django.urls import include, path


# Usa una respuesta JSON cuando Django devuelve un 404.
handler404 = "ai_gateway.views.not_found"
# Incluye las rutas del gateway sin agregar un prefijo.
urlpatterns = [path("", include("ai_gateway.urls"))]
