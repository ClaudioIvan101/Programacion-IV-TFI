import json
import re
from datetime import datetime, timezone
from pathlib import Path
from time import monotonic

from django.conf import settings
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

from .fake_provider import fake_completion
from .responses import json_response


MAX_BODY_BYTES = 100 * 1024
SCHEMAS = Path(__file__).resolve().parents[2] / "contracts" / "schemas"
# Las referencias de T4 se resuelven solo contra los archivos del repositorio.
REGISTRY = Registry().with_resources(
    (path.as_uri(), Resource.from_contents(json.loads(path.read_text(encoding="utf-8"))))
    for path in SCHEMAS.glob("*.schema.json")
)
REQUEST_VALIDATOR, RESPONSE_VALIDATOR = (
    Draft202012Validator(
        {"$ref": (SCHEMAS / f"{name}.schema.json").as_uri()},
        registry=REGISTRY,
        format_checker=FormatChecker(),
    )
    for name in ("request", "response")
)


def reject_non_json_number(value):
    raise ValueError(f"Constante JSON inválida: {value}")


def structured_completions(request):
    started = monotonic()
    request_id = request.headers.get("X-Request-Id", "")
    if not re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", request_id):
        request_id = None
    headers = {"X-Request-Id": request_id} if request_id else {}

    def error(status, code, extra_headers=None):
        body = {"error": {"code": code, "message": "No se pudo completar la solicitud.", "request_id": request_id}}
        return json_response(status, body, {**headers, **(extra_headers or {})}, head=request.method == "HEAD")

    if request.method != "POST":
        return error(405, "INVALID_REQUEST", {"Allow": "POST"})

    # Hasta integrar la verificación JWT de Claudio, el proveedor falso solo opera en desarrollo.
    if not settings.DEMO_ENABLED:
        return error(401, "UNAUTHENTICATED", {"WWW-Authenticate": "Bearer"})

    if (
        request.content_type != "application/json"
        or request.content_params.get("charset", "utf-8").lower() != "utf-8"
        or not request_id
        or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", request.headers.get("Idempotency-Key", ""))
    ):
        return error(400, "INVALID_REQUEST")

    deadline = request.headers.get("X-Deadline", "")
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z", deadline):
        return error(400, "INVALID_REQUEST")
    try:
        remaining = (datetime.fromisoformat(deadline) - datetime.now(timezone.utc)).total_seconds()
    except ValueError:
        return error(400, "INVALID_REQUEST")
    if remaining <= 0:
        return error(504, "DEADLINE_EXCEEDED")
    if remaining > 15:
        return error(400, "INVALID_REQUEST")
    expires = monotonic() + remaining

    try:
        raw = request.read(MAX_BODY_BYTES + 1)
        if len(raw) > MAX_BODY_BYTES:
            return error(413, "PAYLOAD_TOO_LARGE")
        payload = json.loads(raw.decode("utf-8"), parse_constant=reject_non_json_number)
        if not REQUEST_VALIDATOR.is_valid(payload):
            return error(400, "INVALID_REQUEST")
    except (OSError, ValueError, RecursionError):
        return error(400, "INVALID_REQUEST")

    context = payload["context"]
    # T7 selecciona un ejemplo fijo a partir del contexto, sin interpretar el texto.
    partial = not (
        all(value is not None for value in context.values())
        and all(value is not None for value in context["contacto"].values())
        and context["presupuesto"]["moneda"] is not None
    )
    try:
        response = fake_completion(partial=partial)
    except OSError:
        return error(503, "SERVICE_UNAVAILABLE", {"Retry-After": "1"})
    except ValueError:
        return error(502, "INVALID_PROVIDER_RESPONSE")
    except Exception:
        return error(500, "INTERNAL_ERROR")

    if not RESPONSE_VALIDATOR.is_valid(response):
        return error(502, "INVALID_PROVIDER_RESPONSE")
    data = response["data"]
    budget = data["extracted_data"]["presupuesto"]
    if data["next_question_key"] is not None and data["next_question_key"] not in data["missing_fields"]:
        return error(502, "INVALID_PROVIDER_RESPONSE")
    if budget is not None and budget["moneda"] is None and "presupuesto" not in data["missing_fields"]:
        return error(502, "INVALID_PROVIDER_RESPONSE")
    finished = monotonic()
    if finished >= expires or finished - started > 15:
        return error(504, "DEADLINE_EXCEEDED")
    return json_response(200, {**response, "latency_ms": int((finished - started) * 1000)}, headers)
