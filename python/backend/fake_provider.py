"""Adaptador en proceso con respuestas sintéticas del contrato T4."""

import json
from pathlib import Path


def fake_completion(*, partial=False):
    """Devuelve el ejemplo completo o el de seguimiento, según el escenario."""
    filename = "response-follow-up.json" if partial else "response-complete.json"
    examples = Path(__file__).resolve().parents[2] / "contracts" / "examples" / "valid"
    return json.loads((examples / filename).read_text(encoding="utf-8"))
