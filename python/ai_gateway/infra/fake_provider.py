"""Adaptador en proceso con respuestas sintéticas del contrato T4."""

import json
from pathlib import Path


def fake_completion(*, partial=False):
    """Carga el ejemplo sintético de T4 y lo devuelve como un diccionario."""
    # 1. Si partial es True, elige el ejemplo parcial. Si es False, el completo.
    filename = "response-follow-up.json" if partial else "response-complete.json"
    examples = Path(__file__).resolve().parents[3] / "contracts" / "examples" / "valid"
    # 2. Lee el JSON elegido y devuelve sus datos como un diccionario.
    return json.loads((examples / filename).read_text(encoding="utf-8"))
