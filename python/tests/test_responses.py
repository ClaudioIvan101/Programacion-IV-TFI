import json
import unittest

from backend.responses import json_response


class ResponseTests(unittest.TestCase):
    def test_json_is_utf8_with_correct_byte_length(self):
        response = json_response(404, {"error": "Not found", "text": "á"})
        body = response.content
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.reason_phrase, "Not Found")
        self.assertEqual(json.loads(body), {"error": "Not found", "text": "á"})
        self.assertEqual(response["Content-Length"], str(len(body)))
        self.assertEqual(response["Content-Type"], "application/json; charset=utf-8")

    def test_safe_headers_and_explicit_extras(self):
        response = json_response(405, {}, {"Allow": "GET, HEAD"})
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(response["Allow"], "GET, HEAD")

    def test_non_finite_numbers_are_rejected_instead_of_invalid_json(self):
        for value in (float("nan"), float("inf"), float("-inf")):
            with self.subTest(value=value), self.assertRaises(ValueError):
                json_response(200, {"value": value})
