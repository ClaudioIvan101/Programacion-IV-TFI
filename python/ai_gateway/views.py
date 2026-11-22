"""Vistas HTTP del gateway.

Cada vista es un adaptador fino: traduce HTTP a una entrada del caso de uso y
vuelve a traducir el resultado. Las precondiciones viven en
`http/preconditions` y el sobre de error en `http/errors`, para que acá no haya
ni reglas de negocio ni políticas de autenticación.
"""

from django.conf import settings
from django.http import Http404

from .http.errors import error_response, service_error_response
from .http.preconditions import RequestRejected, open_request, request_identifier
from .http.responses import json_response
from .infra.fake_provider import fake_completion
from .services.structured_completions import CompletionFailure, complete


def structured_completions(request):
    """POST /v1/structured-completions: valida el contrato T4 y delega el caso de uso."""
    # 1. El identificador se extrae primero porque el sobre de error lo repite.
    request_id = request_identifier(request)
    head = request.method == "HEAD"

    # 2. Precondiciones: método, JWT de servicio, encabezados, deadline y cuerpo.
    try:
        gateway_request = open_request(request, request_id)
    except RequestRejected as rejected:
        return error_response(
            rejected.status,
            rejected.code,
            request_id=request_id,
            extra_headers=rejected.headers,
            head=head,
        )

    # 3. Caso de uso: no conoce Django ni HTTP, solo el presupuesto de tiempo.
    try:
        response = complete(
            gateway_request.payload,
            deadline_seconds=gateway_request.deadline_seconds,
        )
    except CompletionFailure as failure:
        return service_error_response(failure, request_id=request_id, head=head)

    # 4. Respuesta exitosa, con el X-Request-Id correlacionado.
    headers = {"X-Request-Id": request_id} if request_id else {}
    return json_response(200, response, headers)


def probe(request, *, check_provider=False):
    """GET /health y /ready: liveness y readiness sin exponer datos internos."""
    if request.method not in ("GET", "HEAD"):
        return json_response(405, {"error": "Method not allowed"}, {"Allow": "GET, HEAD"})

    head = request.method == "HEAD"
    # /ready verifica que el adaptador pueda cargar ambos ejemplos T4.
    if check_provider:
        try:
            fake_completion()
            fake_completion(partial=True)
        except (OSError, ValueError):
            return json_response(503, {"status": "unavailable"}, head=head)

    return json_response(200, {"status": "ok"}, head=head)


def not_found(request, exception):
    """Manejador global de 404: responde JSON en vez de la página de Django."""
    return json_response(404, {"error": "Not found"}, head=request.method == "HEAD")


def demo(request, *, partial):
    """Muestra los ejemplos T4 en desarrollo; fuera de ahí se comporta como 404."""
    # Fuera de desarrollo, se responde igual que si la ruta no existiera.
    if not settings.DEMO_ENABLED:
        raise Http404

    # GET devuelve el JSON y HEAD devuelve solo los encabezados.
    if request.method not in ("GET", "HEAD"):
        return json_response(405, {"error": "Method not allowed"}, {"Allow": "GET, HEAD"})

    # El adaptador carga el ejemplo T4 y json_response lo envía con estado 200.
    return json_response(200, fake_completion(partial=partial), head=request.method == "HEAD")
