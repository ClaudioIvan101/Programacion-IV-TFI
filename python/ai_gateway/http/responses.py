"""Construcción de respuestas JSON del gateway.

Este es el único lugar que decide cómo se escribe una respuesta HTTP: tipo de
contenido, longitud en bytes y encabezados de seguridad. Si mañana cambia el
formato de salida, se cambia acá y no en cada vista.
"""

from django.http import JsonResponse


def json_response(status, data, extra_headers=None, *, head=False):
    """Devuelve una respuesta JSON con longitud calculada sobre bytes UTF-8.

    `head=True` conserva los encabezados que tendría un GET pero descarta el
    cuerpo, que es exactamente lo que exige el método HEAD.
    """
    response = JsonResponse(
        data,
        status=status,
        content_type="application/json; charset=utf-8",
        # ensure_ascii=False conserva acentos; allow_nan=False evita emitir
        # NaN/Infinity, que no son JSON válido y romperían al cliente.
        json_dumps_params={"ensure_ascii": False, "allow_nan": False},
        headers=extra_headers,
    )
    # Content-Length se calcula sobre el cuerpo ya serializado, no sobre el
    # texto original: un acento ocupa dos bytes en UTF-8.
    response["Content-Length"] = str(len(response.content))
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "no-store"
    if head:
        response.content = b""
    return response
