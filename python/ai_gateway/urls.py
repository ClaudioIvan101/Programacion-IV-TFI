"""Rutas HTTP de la aplicación del gateway."""

from django.urls import path

from . import views


urlpatterns = [
    # Conecta la URL que usa Express con la vista que atiende el pedido.
    path("v1/structured-completions", views.structured_completions),
    path("health", views.probe),
    path("ready", views.probe, {"check_provider": True}),
    # Las dos rutas llaman a demo. Django pasa False para el ejemplo completo
    # y True para el ejemplo parcial (response-follow-up.json).
    path("demo/complete", views.demo, {"partial": False}),
    path("demo/partial", views.demo, {"partial": True}),
]
