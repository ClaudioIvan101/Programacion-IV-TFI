"""Traducción de fallos internos a las respuestas de error del contrato T4.

El caso de uso no conoce códigos HTTP: informa un código de fallo y este módulo
decide el estado y los encabezados. Así la política de errores queda en un solo
lugar y no repartida por las vistas.
"""

from .responses import json_response

# Mensaje único del contrato: nunca se expone la causa real al cliente.
MESSAGE = "No se pudo completar la solicitud."

# Código interno del caso de uso -> (estado HTTP, encabezados adicionales).
SERVICE_ERRORS = {
    "SERVICE_UNAVAILABLE": (503, {"Retry-After": "1"}),
    "INVALID_PROVIDER_RESPONSE": (502, None),
    "INTERNAL_ERROR": (500, None),
    "DEADLINE_EXCEEDED": (504, None),
}


def error_response(status, code, *, request_id, extra_headers=None, head=False):
    """Construye el sobre de error uniforme {error: {code, message, request_id}}.

    El X-Request-Id solo se repite como encabezado cuando es válido: si el
    cliente envió uno malformado, la respuesta no lo refleja.
    """
    headers = {"X-Request-Id": request_id} if request_id else {}
    headers.update(extra_headers or {})
    body = {"error": {"code": code, "message": MESSAGE, "request_id": request_id}}
    return json_response(status, body, headers, head=head)


def service_error_response(failure, *, request_id, head=False):
    """Traduce un `CompletionFailure` del caso de uso a su respuesta HTTP."""
    status, extra_headers = SERVICE_ERRORS[failure.code]
    return error_response(
        status,
        failure.code,
        request_id=request_id,
        extra_headers=extra_headers,
        head=head,
    )
