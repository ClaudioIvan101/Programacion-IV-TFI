"""Caso de uso: obtener y validar una respuesta estructurada del proveedor de IA.

No conoce Django ni HTTP. Recibe la carga ya validada y un presupuesto de tiempo
en segundos; devuelve la respuesta del contrato T4 con su latencia medida.
"""

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


def complete(payload, *, deadline_seconds):
    """Ejecuta el proveedor y garantiza que el resultado respete el contrato T4.

    `deadline_seconds` es el presupuesto restante que calculó el adaptador HTTP.
    El caso de uso mide su propio tiempo: no recibe relojes ni encabezados del
    transporte, solo cuánto tiempo tiene permitido trabajar.
    """
    started = monotonic()

    # T7: el escenario se elige a partir del contexto, sin interpretar el texto.
    # Si falta cualquier dato del contacto o la moneda, corresponde el ejemplo
    # parcial que pregunta por el presupuesto.
    context = payload["context"]
    partial = not (
        all(value is not None for value in context.values())
        and all(value is not None for value in context["contacto"].values())
        and context["presupuesto"]["moneda"] is not None
    )

    try:
        response = fake_completion(partial=partial)
    except OSError:
        # El adaptador no pudo leer sus datos: el servicio está no disponible.
        raise CompletionFailure("SERVICE_UNAVAILABLE") from None
    except ValueError:
        # Los datos del adaptador no son JSON válido.
        raise CompletionFailure("INVALID_PROVIDER_RESPONSE")
    except Exception:
        # Cualquier fallo inesperado no debe filtrar detalles al cliente.
        raise CompletionFailure("INTERNAL_ERROR") from None

    # El proveedor puede devolver algo sintácticamente válido pero fuera de
    # contrato: se valida contra el esquema T4 antes de aceptarlo.
    if not RESPONSE_VALIDATOR.is_valid(response):
        raise CompletionFailure("INVALID_PROVIDER_RESPONSE")

    data = response["data"]
    budget = data["extracted_data"]["presupuesto"]
    # Coherencia interna: la pregunta de seguimiento debe estar entre los
    # campos faltantes, y una moneda nula debe declararse como faltante.
    if data["next_question_key"] is not None and data["next_question_key"] not in data["missing_fields"]:
        raise CompletionFailure("INVALID_PROVIDER_RESPONSE")
    if budget is not None and budget["moneda"] is None and "presupuesto" not in data["missing_fields"]:
        raise CompletionFailure("INVALID_PROVIDER_RESPONSE")

    elapsed = monotonic() - started
    # Una sola política de tiempo: el presupuesto que fijó el adaptador HTTP.
    if elapsed > deadline_seconds:
        raise CompletionFailure("DEADLINE_EXCEEDED")

    return {**response, "latency_ms": int(elapsed * 1000)}
