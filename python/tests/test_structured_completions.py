import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from django.test import Client, SimpleTestCase, override_settings

from backend.app import app  # Inicializa Django para ejecutar unittest sin manage.py.


EXAMPLES = Path(__file__).resolve().parents[2] / "contracts" / "examples" / "valid"
URL = "/v1/structured-completions"
REQUEST_ID = "8e76b390-b948-4a72-9db7-82af3325c910"


def example(name):
    return json.loads((EXAMPLES / f"{name}.json").read_text(encoding="utf-8"))


@override_settings(DEMO_ENABLED=True)
class StructuredCompletionsTests(SimpleTestCase):
    def post(self, body, *, deadline_seconds=10, **headers):
        deadline = datetime.now(timezone.utc) + timedelta(seconds=deadline_seconds)
        request_headers = {
            "X-Request-Id": REQUEST_ID,
            "Idempotency-Key": "operacion-001",
            "X-Deadline": deadline.isoformat().replace("+00:00", "Z"),
            **headers,
        }
        return Client().post(URL, body, content_type="application/json", headers=request_headers, HTTP_HOST="ai-gateway")

    def assert_error(self, response, status, code, request_id=REQUEST_ID):
        self.assertEqual(response.status_code, status)
        self.assertEqual(response.headers.get("X-Request-Id"), request_id)
        self.assertEqual(response.json()["error"], {
            "code": code, "message": "No se pudo completar la solicitud.", "request_id": request_id,
        })

    def test_returns_the_matching_t4_example(self):
        for case, expected in [("complete", "complete"), ("partial", "follow-up")]:
            with self.subTest(case=case):
                response = self.post(example(f"request-{case}"))
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response["X-Request-Id"], REQUEST_ID)
                body = response.json()
                self.assertIn(body.pop("latency_ms"), range(15001))
                fixture = example(f"response-{expected}")
                fixture.pop("latency_ms")
                self.assertEqual(body, fixture)

    def test_rejects_malformed_json_and_a_non_t4_body(self):
        self.assert_error(self.post("{"), 400, "INVALID_REQUEST")
        self.assert_error(self.post({**example("request-complete"), "score": 99}), 400, "INVALID_REQUEST")
        self.assert_error(self.post(example("request-partial"), **{"Idempotency-Key": ""}), 400, "INVALID_REQUEST")
        self.assert_error(self.post(example("request-partial"), **{"X-Request-Id": "invalid"}), 400, "INVALID_REQUEST", None)
        self.assert_error(self.post(example("request-partial"), deadline_seconds=16), 400, "INVALID_REQUEST")

    def test_applies_the_body_limit_and_deadline(self):
        self.assert_error(self.post(" " * (102400 + 1)), 413, "PAYLOAD_TOO_LARGE")
        self.assert_error(self.post(example("request-complete"), deadline_seconds=-1), 504, "DEADLINE_EXCEEDED")

    def test_requires_post(self):
        response = Client().get(URL, HTTP_HOST="ai-gateway")
        self.assert_error(response, 405, "INVALID_REQUEST", None)
        self.assertEqual(response["Allow"], "POST")

    def test_handles_provider_failures(self):
        with patch("backend.structured_completions.fake_completion", return_value={"bad": True}):
            self.assert_error(self.post(example("request-complete")), 502, "INVALID_PROVIDER_RESPONSE")
        with patch("backend.structured_completions.fake_completion", side_effect=FileNotFoundError("private")):
            response = self.post(example("request-complete"))
            self.assert_error(response, 503, "SERVICE_UNAVAILABLE")
            self.assertEqual(response["Retry-After"], "1")

    @override_settings(DEMO_ENABLED=False)
    def test_fails_closed_until_jwt_is_connected(self):
        response = self.post(example("request-complete"), Authorization="Bearer cualquier-valor")
        self.assert_error(response, 401, "UNAUTHENTICATED")
        self.assertEqual(response["WWW-Authenticate"], "Bearer")
