"""Rutas de estado del gateway."""

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


handler404 = not_found
urlpatterns = [
    path("health", probe),
    path("ready", probe, {"check_provider": True}),
]
