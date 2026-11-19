"""Rutas de estado y demostración del gateway."""

from django.conf import settings
from django.http import Http404
from django.urls import path

from .fake_provider import fake_completion
from .responses import json_response


def probe(request, *, check_provider=False):
    if request.method not in ("GET", "HEAD"):
        return json_response(405, {"error": "Method not allowed"}, {"Allow": "GET, HEAD"})

    head = request.method == "HEAD"
    if check_provider:
        try:
            fake_completion()
            fake_completion(partial=True)
        except (OSError, ValueError):
            return json_response(503, {"status": "unavailable"}, head=head)

    return json_response(200, {"status": "ok"}, head=head)


def not_found(request, exception):
    return json_response(404, {"error": "Not found"}, head=request.method == "HEAD")


def demo(request, *, partial):
    # Fuera de desarrollo, se responde igual que si la ruta no existiera.
    if not settings.DEMO_ENABLED:
        raise Http404

    # GET devuelve el JSON y HEAD devuelve solo los encabezados.
    if request.method not in ("GET", "HEAD"):
        return json_response(405, {"error": "Method not allowed"}, {"Allow": "GET, HEAD"})

    # El adaptador carga el ejemplo T4 y json_response lo envía con estado 200.
    return json_response(200, fake_completion(partial=partial), head=request.method == "HEAD")


handler404 = not_found
urlpatterns = [
    path("health", probe),
    path("ready", probe, {"check_provider": True}),
    # Las dos rutas llaman a demo. Django pasa False para el ejemplo completo
    # y True para el ejemplo parcial (response-follow-up.json).
    path("demo/complete", demo, {"partial": False}),
    path("demo/partial", demo, {"partial": True}),
]
