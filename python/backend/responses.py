"""Construye respuestas JSON con longitud calculada sobre bytes."""

from django.http import JsonResponse


def json_response(status, data, extra_headers=None, *, head=False):
    response = JsonResponse(
        data,
        status=status,
        content_type="application/json; charset=utf-8",
        json_dumps_params={"ensure_ascii": False, "allow_nan": False},
        headers=extra_headers,
    )
    response["Content-Length"] = str(len(response.content))
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "no-store"
    if head:
        response.content = b""
    return response
