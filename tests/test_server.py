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


class EventStoreTests(unittest.TestCase):
    def test_body_budget_evicts_oldest_event_and_keeps_raw_private(self):
        from server import EventStore
        store = EventStore(max_events=10, max_body_bytes=5)
        store.add({"id": "old", "method": "POST", "path": "/hooks/a", "body": "abc", "headers": {}}, b"abc")
        store.add({"id": "new", "method": "POST", "path": "/hooks/b", "body": "xyz", "headers": {}}, b"xyz")
        self.assertIsNone(store.get("old"))
        self.assertIsNone(store.get_raw_body("old"))
        self.assertEqual(store.get_raw_body("new"), b"xyz")
        self.assertNotIn("rawBody", store.list()[0])

    def test_store_filtering_and_retrieval(self):
        from server import EventStore
        store = EventStore(max_events=10)
        store.add({
            "id": "evt1",
            "method": "POST",
            "path": "/hooks/orders",
            "body": {"order": 123},
            "headers": {"Content-Type": "application/json"},
        })
        store.add({
            "id": "evt2",
            "method": "GET",
            "path": "/hooks/health",
            "body": None,
            "headers": {},
        })

        self.assertEqual(len(store.list()), 2)
        self.assertEqual(store.get("evt1")["id"], "evt1")
        self.assertIsNone(store.get("nonexistent"))

        # Filter by method
        posts = store.list(method="POST")
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0]["id"], "evt1")

        # Filter by path
        orders = store.list(path="/hooks/orders")
        self.assertEqual(len(orders), 1)
        self.assertEqual(orders[0]["id"], "evt1")

        # Filter by search query
        q_results = store.list(q="123")
        self.assertEqual(len(q_results), 1)
        self.assertEqual(q_results[0]["id"], "evt1")

        store.clear()
        self.assertEqual(len(store.list()), 0)


if __name__ == "__main__":
    unittest.main()
