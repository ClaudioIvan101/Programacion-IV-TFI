"""Caso de uso: obtener y validar una respuesta estructurada del proveedor de IA.

No conoce Django ni HTTP. Recibe la carga ya validada y un presupuesto de tiempo
en segundos; devuelve la respuesta del contrato T4 con su latencia medida.
"""

from math import isfinite
from time import monotonic

from ..infra.fake_provider import fake_completion
from ..validators.t4 import RESPONSE_VALIDATOR


class CompletionFailure(Exception):
    """Fallo conocido del flujo, identificado por código y sin detalles HTTP.

    El adaptador HTTP decide qué estado corresponde a cada código; así el caso
    de uso no arrastra la tabla de estados ni encabezados.
    """

    def __init__(self, code):
        super().__init__(code)
        self.code = code


def fake_provider(payload, *, timeout, retry):
    """Selecciona el escenario determinista para pruebas."""
    context = payload["context"]
    partial = not (
        all(value is not None for value in context.values())
        and all(value is not None for value in context["contacto"].values())
        and context["presupuesto"]["moneda"] is not None
    )
    return fake_completion(partial=partial)


def complete(payload, *, deadline_seconds, provider, retry_invalid=False):
    """Ejecuta el proveedor y garantiza que el resultado respete el contrato T4.

    `deadline_seconds` es el presupuesto restante que calculó el adaptador HTTP.
    El caso de uso mide su propio tiempo: no recibe relojes ni encabezados del
    transporte, solo cuánto tiempo tiene permitido trabajar.
    """
    started = monotonic()

    usage = {"input_tokens": 0, "output_tokens": 0}
    for attempt in range(2 if retry_invalid else 1):
        remaining = deadline_seconds - (monotonic() - started)
        if remaining <= 0:
            raise CompletionFailure("DEADLINE_EXCEEDED")
        try:
            response = provider(payload, timeout=remaining, retry=bool(attempt))
        except TimeoutError:
            raise CompletionFailure("DEADLINE_EXCEEDED") from None
        except OSError:
            raise CompletionFailure("SERVICE_UNAVAILABLE") from None
        except ValueError:
            continue
        except Exception:
            raise CompletionFailure("INTERNAL_ERROR") from None

        # Los intentos rechazados también consumen tokens si llegaron con métricas válidas.
        attempt_usage = response.get("usage") if isinstance(response, dict) else None
        if isinstance(attempt_usage, dict):
            for key in usage:
                count = attempt_usage.get(key)
                if type(count) is int and count >= 0:
                    usage[key] += count
        if _valid_response(response):
            elapsed = monotonic() - started
            if elapsed > deadline_seconds:
                raise CompletionFailure("DEADLINE_EXCEEDED")
            return {**response, "usage": usage, "latency_ms": int(elapsed * 1000)}

    if monotonic() - started > deadline_seconds:
        raise CompletionFailure("DEADLINE_EXCEEDED")
    raise CompletionFailure("INVALID_PROVIDER_RESPONSE")


def _valid_response(response):
    if not RESPONSE_VALIDATOR.is_valid(response):
        return False

    data = response["data"]
    budget = data["extracted_data"]["presupuesto"]
    # Coherencia interna: la pregunta de seguimiento debe estar entre los
    # campos faltantes, y una moneda nula debe declararse como faltante.
    if data["next_question_key"] is not None and data["next_question_key"] not in data["missing_fields"]:
        return False
    return budget is None or (
        isfinite(budget["monto"]) and (budget["moneda"] is not None or "presupuesto" in data["missing_fields"])
    )
