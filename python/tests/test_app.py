import json
import unittest
from unittest.mock import patch

from django.test import RequestFactory

from backend.app import app


class AppTests(unittest.TestCase):
    def request(self, path="/health", method="GET"):
        captured = []
        request = RequestFactory().generic(method, f"{path}?token=secret", HTTP_HOST="localhost")
        body = app(
            request.environ,
            lambda status, headers: captured.append((status, dict(headers))),
        )
        try:
            return *captured[0], b"".join(body)
        finally:
            body.close()

    def test_health_is_a_non_cached_liveness_response(self):
        status, headers, body = self.request()
        self.assertEqual(status, "200 OK")
        self.assertEqual(json.loads(body), {"status": "ok"})
        self.assertEqual(headers["Cache-Control"], "no-store")

    def test_unknown_route_returns_json_without_reflecting_query(self):
        status, _, body = self.request("/missing")
        self.assertEqual(status, "404 Not Found")
        self.assertEqual(json.loads(body), {"error": "Not found"})

    def test_health_rejects_writes_with_allow_header(self):
        status, headers, body = self.request(method="POST")
        self.assertEqual(status, "405 Method Not Allowed")
        self.assertEqual(headers["Allow"], "GET, HEAD")
        self.assertEqual(json.loads(body), {"error": "Method not allowed"})

    def test_head_has_get_headers_but_no_body(self):
        status, headers, body = self.request(method="HEAD")
        self.assertEqual(status, "200 OK")
        self.assertGreater(int(headers["Content-Length"]), 0)
        self.assertEqual(body, b"")

    def test_ready_loads_both_fake_responses(self):
        status, _, body = self.request("/ready")
        self.assertEqual(status, "200 OK")
        self.assertEqual(json.loads(body), {"status": "ok"})

    def test_ready_reports_fake_provider_failure_without_affecting_health(self):
        for error in (FileNotFoundError("private path"), ValueError("private content")):
            with self.subTest(error=type(error)):
                with patch("backend.urls.fake_completion", side_effect=[{}, error]) as fake:
                    health_status, _, _ = self.request()
                    fake.assert_not_called()
                    status, _, body = self.request("/ready")
                    self.assertEqual(fake.call_count, 2)
                self.assertEqual(health_status, "200 OK")
                self.assertEqual(status, "503 Service Unavailable")
                self.assertEqual(json.loads(body), {"status": "unavailable"})
