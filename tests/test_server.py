import unittest
from email.message import Message

from server import decode_body, redact_headers


class DecodeBodyTests(unittest.TestCase):
    def test_json(self):
        body, kind = decode_body(b'{"ok":true}', "application/json")
        self.assertEqual(body, {"ok": True})
        self.assertEqual(kind, "json")

    def test_form(self):
        body, kind = decode_body(b"status=done&id=42", "application/x-www-form-urlencoded")
        self.assertEqual(body, {"status": ["done"], "id": ["42"]})
        self.assertEqual(kind, "form")

    def test_binary_becomes_base64(self):
        body, kind = decode_body(b"\xff\x00", "application/octet-stream")
        self.assertEqual(body, "/wA=")
        self.assertEqual(kind, "base64")


class HeaderTests(unittest.TestCase):
    def test_secrets_are_redacted(self):
        headers = Message()
        headers["Authorization"] = "Bearer secret"
        headers["X-Request-Id"] = "abc"
        self.assertEqual(
            redact_headers(headers),
            {"Authorization": "[redacted]", "X-Request-Id": "abc"},
        )


if __name__ == "__main__":
    unittest.main()
