"""Punto de entrada de las rutas del proyecto Django."""

from django.urls import include, path


handler404 = "ai_gateway.views.not_found"
urlpatterns = [path("", include("ai_gateway.urls"))]
