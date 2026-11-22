"""Precondiciones del contrato T4.

Este módulo es el adaptador de entrada: verifica todo lo que debe cumplirse
*antes* de ejecutar el caso de uso. No conoce reglas de negocio; solo
credenciales, encabezados, presupuesto de tiempo y forma del cuerpo.

El orden de las verificaciones es parte del contrato y está probado:
método -> autenticación -> encabezados -> deadline -> cuerpo.
"""

import json
import re
from datetime import datetime, timezone
from typing import NamedTuple

from django.conf import settings

from ..infra.service_jwt import (
    ServiceJwtConfigurationError,
    load_service_jwt_verifier,
)
from ..validators.t4 import REQUEST_VALIDATOR

# Límites del contrato T4.
MAX_BODY_BYTES = 100 * 1024
MAX_DEADLINE_SECONDS = 15

# Los patrones son los del contrato: cualquier desvío se responde 400.
REQUEST_ID_PATTERN = re.compile(
    r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"
)
IDEMPOTENCY_KEY_PATTERN = re.compile(r"[A-Za-z0-9_-]{1,128}")
DEADLINE_PATTERN = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z"
)


class RequestRejected(Exception):
    """Una precondición falló.

    Lleva el estado y el código que el adaptador HTTP debe devolver. Se usa una
    excepción para que la vista no tenga que encadenar `if` sobre cada chequeo:
    las precondiciones se leen como una lista y el primer fallo corta el flujo.
    """

    def __init__(self, status, code, headers=None):
        super().__init__(code)
        self.status = status
        self.code = code
        self.headers = headers or {}


class GatewayRequest(NamedTuple):
    """Entrada ya validada, con lo único que el caso de uso necesita.

    `payload` es el cuerpo T4 validado contra el esquema.
    `deadline_seconds` es el presupuesto restante que fijó el cliente.
    """

    payload: dict
    deadline_seconds: float


def request_identifier(request):
    """Devuelve el X-Request-Id si respeta el contrato; si no, None.

    Se extrae primero, antes de cualquier rechazo, porque el sobre de error
    siempre lo repite para poder correlacionar la solicitud.
    """
    value = request.headers.get("X-Request-Id", "")
    return value if REQUEST_ID_PATTERN.fullmatch(value) else None


def open_request(request, request_id):
    """Aplica todas las precondiciones y devuelve la entrada del caso de uso.

    Lanza `RequestRejected` con el estado HTTP correspondiente en el primer
    chequeo que falle.
    """
    if request.method != "POST":
        raise RequestRejected(405, "INVALID_REQUEST", {"Allow": "POST"})

    _authenticate(request)
    _require_contract_headers(request, request_id)
    deadline_seconds = _deadline_seconds(request)
    payload = _read_payload(request)

    return GatewayRequest(payload=payload, deadline_seconds=deadline_seconds)


def _authenticate(request):
    """Exige el JWT de servicio RS256 emitido por core-api (Express).

    El orden es deliberado y no depende del modo de ejecución:
    - Sin credenciales se responde 401 aunque la clave pública no exista.
    - Solo un intento real de autenticación puede revelar un 503 por
      configuración faltante.
    """
    authorization = request.headers.get("Authorization")
    if not authorization or not authorization.strip():
        raise RequestRejected(
            401, "UNAUTHENTICATED", {"WWW-Authenticate": "Bearer"}
        )

    try:
        verify = load_service_jwt_verifier(settings.SERVICE_JWT_PUBLIC_KEY_FILE)
    except ServiceJwtConfigurationError:
        # La clave pública falta o es inválida: el servicio no puede autenticar
        # a nadie, así que se declara no disponible en vez de fingir un 401.
        raise RequestRejected(
            503, "SERVICE_UNAVAILABLE", {"Retry-After": "1"}
        ) from None

    if not verify(authorization):
        raise RequestRejected(
            401, "UNAUTHENTICATED", {"WWW-Authenticate": "Bearer"}
        )


def _require_contract_headers(request, request_id):
    """Exige JSON en UTF-8, un X-Request-Id válido y una Idempotency-Key válida."""
    # Django separa el tipo de contenido de sus parámetros (charset).
    charset = request.content_params.get("charset", "utf-8").lower()
    if (
        request.content_type != "application/json"
        or charset != "utf-8"
        or not request_id
        or not IDEMPOTENCY_KEY_PATTERN.fullmatch(
            request.headers.get("Idempotency-Key", "")
        )
    ):
        raise RequestRejected(400, "INVALID_REQUEST")


def _deadline_seconds(request):
    """Convierte X-Deadline en segundos restantes y acota el presupuesto.

    El cliente no puede pedir más de 15 segundos: el gateway no acepta trabajos
    que no pueda garantizar dentro de su propio límite.
    """
    value = request.headers.get("X-Deadline", "")
    if not DEADLINE_PATTERN.fullmatch(value):
        raise RequestRejected(400, "INVALID_REQUEST")

    try:
        # fromisoformat acepta el sufijo Z desde Python 3.11.
        remaining = (
            datetime.fromisoformat(value) - datetime.now(timezone.utc)
        ).total_seconds()
    except ValueError:
        raise RequestRejected(400, "INVALID_REQUEST") from None

    if remaining <= 0:
        raise RequestRejected(504, "DEADLINE_EXCEEDED")
    if remaining > MAX_DEADLINE_SECONDS:
        raise RequestRejected(400, "INVALID_REQUEST")
    return remaining


def _read_payload(request):
    """Lee el cuerpo con tope de tamaño y lo interpreta como JSON estricto."""
    try:
        raw = request.read(MAX_BODY_BYTES + 1)
        if len(raw) > MAX_BODY_BYTES:
            raise RequestRejected(413, "PAYLOAD_TOO_LARGE")
        payload = json.loads(
            raw.decode("utf-8"), parse_constant=_reject_non_json_number
        )
    except (OSError, ValueError, RecursionError):
        # Cubre JSON inválido, UTF-8 inválido y NaN/Infinity. RequestRejected no
        # hereda de ValueError, así que el 413 de arriba no cae en este except.
        raise RequestRejected(400, "INVALID_REQUEST") from None

    if not REQUEST_VALIDATOR.is_valid(payload):
        raise RequestRejected(400, "INVALID_REQUEST")
    return payload


def _reject_non_json_number(value):
    """json.loads acepta NaN/Infinity por defecto; el estándar JSON no."""
    raise ValueError(f"Constante JSON inválida: {value}")
