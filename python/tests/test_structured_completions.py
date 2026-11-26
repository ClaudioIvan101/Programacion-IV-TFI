"""Pruebas HTTP del endpoint de completados estructurados (contrato T4).

Cada prueba firma un JWT de servicio real con una clave RSA efímera, de modo que
se ejercita exactamente el mismo verificador que usará Express en producción:
no se parchea la autenticación.
"""

import json
from io import BytesIO
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.test import Client, SimpleTestCase, override_settings

from ai_gateway.infra.service_jwt import load_service_jwt_verifier
from backend.app import app  # Inicializa Django para ejecutar unittest sin manage.py.


EXAMPLES = Path(__file__).resolve().parents[2] / "contracts" / "examples" / "valid"
URL = "/v1/structured-completions"
REQUEST_ID = "8e76b390-b948-4a72-9db7-82af3325c910"


def example(name):
    """Carga un ejemplo JSON del contrato T4."""
    return json.loads((EXAMPLES / f"{name}.json").read_text(encoding="utf-8"))


@override_settings(AI_GATEWAY_PROVIDER="fake")
class StructuredCompletionsTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Par de claves efímero: la privada firma, la pública configura Django.
        cls.private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

        cls.directory = tempfile.TemporaryDirectory()
        cls.public_file = Path(cls.directory.name) / "service-public.pem"
        cls.public_file.write_bytes(
            cls.private_key.public_key().public_bytes(
                serialization.Encoding.PEM,
                serialization.PublicFormat.SubjectPublicKeyInfo,
            )
        )
        # Se inyecta la ruta como si fuera configuración de despliegue.
        cls.enterClassContext(
            override_settings(SERVICE_JWT_PUBLIC_KEY_FILE=str(cls.public_file))
        )
        # El verificador está cacheado por ruta; se limpia al cambiar de suite.
        load_service_jwt_verifier.cache_clear()

    @classmethod
    def tearDownClass(cls):
        load_service_jwt_verifier.cache_clear()
        cls.directory.cleanup()
        super().tearDownClass()

    def service_token(self, *, key=None, **overrides):
        """Firma un JWT de servicio con el perfil T4 acordado con Express."""
        now = int(time.time())
        claims = {
            "iss": "core-api",
            "aud": "ai-gateway",
            "sub": "core-api",
            "scope": "ai:structured-completions",
            "iat": now,
            "nbf": now,
            "exp": now + 60,
        }
        claims.update(overrides)
        token = jwt.encode(
            claims,
            key or self.private_key,
            algorithm="RS256",
            headers={"typ": "JWT"},
        )
        return f"Bearer {token}"

    def post(self, body, *, deadline_seconds=10, authorization="valid", headers=None):
        """Envía el cuerpo tal cual, con los encabezados del contrato T4.

        `authorization="valid"` firma un token nuevo; `None` lo omite.
        """
        deadline = datetime.now(timezone.utc) + timedelta(seconds=deadline_seconds)
        request_headers = {
            "X-Request-Id": REQUEST_ID,
            "Idempotency-Key": "operacion-001",
            "X-Deadline": deadline.isoformat().replace("+00:00", "Z"),
            **(headers or {}),
        }
        if authorization == "valid":
            request_headers["Authorization"] = self.service_token()
        elif authorization is not None:
            request_headers["Authorization"] = authorization

        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")

        # generic envía los bytes exactos, sin serializar de nuevo.
        return Client().generic(
            "POST",
            URL,
            data=body,
            content_type="application/json",
            headers=request_headers,
            HTTP_HOST="ai-gateway",
        )

    def assert_error(self, response, status, code, request_id=REQUEST_ID):
        """Comprueba el sobre de error uniforme del contrato T4."""
        self.assertEqual(response.status_code, status)
        self.assertEqual(response.headers.get("X-Request-Id"), request_id)
        self.assertEqual(
            response.json()["error"],
            {
                "code": code,
                "message": "No se pudo completar la solicitud.",
                "request_id": request_id,
            },
        )

    # --- Camino feliz -------------------------------------------------------

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

    # --- Autenticación del JWT de servicio ---------------------------------

    def test_rejects_a_request_without_credentials(self):
        self.assert_error(self.post(example("request-complete"), authorization=None), 401, "UNAUTHENTICATED")

    def test_rejects_a_token_signed_by_another_key(self):
        forged = self.service_token(key=self.other_key)
        self.assert_error(self.post(example("request-complete"), authorization=forged), 401, "UNAUTHENTICATED")

    def test_rejects_an_expired_token(self):
        now = int(time.time())
        expired = self.service_token(iat=now - 120, nbf=now - 120, exp=now - 60)
        self.assert_error(self.post(example("request-complete"), authorization=expired), 401, "UNAUTHENTICATED")

    def test_rejects_a_token_with_the_wrong_scope(self):
        wrong = self.service_token(scope="ai:otro")
        self.assert_error(self.post(example("request-complete"), authorization=wrong), 401, "UNAUTHENTICATED")

    def test_challenges_with_bearer_on_rejection(self):
        # El 401 debe incluir el desafío WWW-Authenticate del contrato.
        response = self.post(example("request-complete"), authorization=None)
        self.assertEqual(response["WWW-Authenticate"], "Bearer")

    @override_settings(DEMO_ENABLED=True)
    def test_requires_credentials_even_in_development(self):
        # El modo de ejecución no habilita el acceso: solo un token válido lo hace.
        self.assert_error(self.post(example("request-complete"), authorization=None), 401, "UNAUTHENTICATED")

    @override_settings(SERVICE_JWT_PUBLIC_KEY_FILE=None)
    def test_fails_closed_when_the_public_key_is_not_configured(self):
        # Sin clave pública no se puede autenticar: 503, no 401 ni 200.
        response = self.post(example("request-complete"))
        self.assert_error(response, 503, "SERVICE_UNAVAILABLE")
        self.assertEqual(response["Retry-After"], "1")

    # --- Precondiciones del contrato ---------------------------------------

    def test_rejects_malformed_json_and_a_non_t4_body(self):
        self.assert_error(self.post(b"{"), 400, "INVALID_REQUEST")
        self.assert_error(
            self.post({**example("request-complete"), "score": 99}), 400, "INVALID_REQUEST"
        )
        self.assert_error(
            self.post(example("request-partial"), headers={"Idempotency-Key": ""}),
            400,
            "INVALID_REQUEST",
        )
        self.assert_error(
            self.post(example("request-partial"), headers={"X-Request-Id": "invalid"}),
            400,
            "INVALID_REQUEST",
            None,
        )
        self.assert_error(self.post(example("request-partial"), deadline_seconds=16), 400, "INVALID_REQUEST")

    def test_applies_the_body_limit_and_deadline(self):
        self.assert_error(self.post(b" " * (102400 + 1)), 413, "PAYLOAD_TOO_LARGE")
        self.assert_error(self.post(example("request-complete"), deadline_seconds=-1), 504, "DEADLINE_EXCEEDED")

    def test_requires_post(self):
        # El método se valida antes que la autenticación: 405 sin credenciales.
        response = Client().get(URL, HTTP_HOST="ai-gateway")
        self.assert_error(response, 405, "INVALID_REQUEST", None)
        self.assertEqual(response["Allow"], "POST")

    # --- Fallos del proveedor ----------------------------------------------

    def gemini_response(self, text):
        return BytesIO(json.dumps({
            "status": "completed",
            "model": "gemini-3.1-flash-lite",
            "steps": [{"type": "model_output", "content": [{"type": "text", "text": text}]}],
            "usage": {"total_input_tokens": 20, "total_output_tokens": 9},
        }).encode())

    @override_settings(AI_GATEWAY_PROVIDER="gemini", GEMINI_API_KEY="test-key")
    def test_gemini_gets_conversation_and_retries_an_invalid_response(self):
        request = example("request-partial")
        request["messages"][0]["content"] = "Quiero comprar, tengo 500 mil dólares"
        request["context"]["presupuesto"] = None
        expected = example("response-follow-up")["data"]
        expected["extracted_data"].update(necesidades="Comprar", presupuesto={"monto": 500000, "moneda": "USD"})
        expected.update(
            assistant_message="¿En qué zona querés comprar?",
            summary="Quiere comprar con USD 500.000; no indicó ubicación ni plazo.",
            next_question_key="necesidades",
            missing_fields=["contacto", "necesidades", "urgencia"],
        )
        with patch("ai_gateway.infra.gemini_provider.urlopen", side_effect=[
            self.gemini_response('{"bad":true}'),
            self.gemini_response(json.dumps(expected)),
        ]) as call:
            response = self.post(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"], expected)
        self.assertEqual(response.json()["usage"], {"input_tokens": 40, "output_tokens": 18})
        self.assertEqual(call.call_count, 2)
        sent = call.call_args.args[0]
        self.assertEqual(sent.get_header("X-goog-api-key"), "test-key")
        body = json.loads(sent.data)
        self.assertEqual(json.loads(body["input"]), {"messages": request["messages"], "context": request["context"]})
        self.assertIn("dólares".encode(), sent.data)
        self.assertFalse(body["store"])
        self.assertEqual(body["generation_config"]["max_output_tokens"], request["max_tokens"])
        self.assertIn("previous output failed validation", body["system_instruction"])
        self.assertEqual(body["response_format"]["mime_type"], "application/json")
        self.assertGreater(call.call_args_list[0].kwargs["timeout"], call.call_args.kwargs["timeout"])

    @override_settings(AI_GATEWAY_PROVIDER="gemini", GEMINI_API_KEY="test-key")
    def test_gemini_returns_typed_failure_after_one_retry(self):
        with patch("ai_gateway.infra.gemini_provider.urlopen", side_effect=[
            self.gemini_response("not-json"),
            self.gemini_response("{}"),
        ]) as call:
            self.assert_error(self.post(example("request-partial")), 502, "INVALID_PROVIDER_RESPONSE")
        self.assertEqual(call.call_count, 2)

    @override_settings(AI_GATEWAY_PROVIDER="gemini", GEMINI_API_KEY="")
    def test_gemini_does_not_fall_back_to_fake_without_key(self):
        self.assert_error(self.post(example("request-partial")), 503, "SERVICE_UNAVAILABLE")

    @override_settings(AI_GATEWAY_PROVIDER="gemini", GEMINI_API_KEY="test-key")
    def test_gemini_overload_does_not_retry_or_leak_provider_details(self):
        unavailable = HTTPError("https://example.test", 503, "private detail", {}, None)
        with patch("ai_gateway.infra.gemini_provider.urlopen", side_effect=unavailable) as call:
            self.assert_error(self.post(example("request-partial")), 503, "SERVICE_UNAVAILABLE")
        call.assert_called_once()

    def test_handles_provider_failures(self):
        with patch(
            "ai_gateway.services.structured_completions.fake_completion",
            return_value={"bad": True},
        ):
            self.assert_error(self.post(example("request-complete")), 502, "INVALID_PROVIDER_RESPONSE")
        with patch(
            "ai_gateway.services.structured_completions.fake_completion",
            side_effect=FileNotFoundError("private"),
        ):
            response = self.post(example("request-complete"))
            self.assert_error(response, 503, "SERVICE_UNAVAILABLE")
            self.assertEqual(response["Retry-After"], "1")
