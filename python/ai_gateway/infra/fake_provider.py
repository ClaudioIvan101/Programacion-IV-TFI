"""Adaptador en proceso con respuestas sintéticas del contrato T4."""

import json
from pathlib import Path


def fake_completion(*, partial=False):
    """Carga el ejemplo sintético de T4 y lo devuelve como un diccionario."""
    filename = "response-follow-up.json" if partial else "response-complete.json"
    # Subimos hasta la raíz que contiene python/ y contracts/, también en Docker.
    examples = Path(__file__).resolve().parents[3] / "contracts" / "examples" / "valid"
    return json.loads((examples / filename).read_text(encoding="utf-8"))
