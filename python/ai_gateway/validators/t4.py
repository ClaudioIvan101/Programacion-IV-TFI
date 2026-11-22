"""Shared T4 request and response schema validators."""

import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

SCHEMAS = Path(__file__).resolve().parents[3] / "contracts" / "schemas"
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
