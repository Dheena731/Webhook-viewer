import http.client
import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import server


class TargetHandler(BaseHTTPRequestHandler):
    received = []

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        self.received.append((self.path, body, dict(self.headers)))
        if self.path == "/redirect":
            self.send_response(302)
            self.send_header("Location", "http://169.254.169.254/latest/meta-data/")
            self.send_header("Content-Length", "0")
        else:
            self.send_response(418)
            self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *_args):
        pass


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = ThreadingHTTPServer(("127.0.0.1", 0), server.WebhookHandler)
        cls.target = ThreadingHTTPServer(("127.0.0.1", 0), TargetHandler)
        cls.app_thread = threading.Thread(target=cls.app.serve_forever, daemon=True)
        cls.target_thread = threading.Thread(target=cls.target.serve_forever, daemon=True)
        cls.app_thread.start()
        cls.target_thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.app.shutdown()
        cls.target.shutdown()
        cls.app.server_close()
        cls.target.server_close()

    def setUp(self):
        server.STORE.clear()
        with server.MOCK_RULES_LOCK:
            server.MOCK_RULES.clear()
        TargetHandler.received.clear()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.app.server_port, timeout=5)
        conn.request(method, path, body=body, headers=headers or {})
        response = conn.getresponse()
        data = response.read()
        status = response.status
        response_headers = dict(response.getheaders())
        conn.close()
        return status, data, response_headers

    def test_replay_uses_original_body_and_does_not_follow_redirect(self):
        raw = b'{  "event" : "paid", "number": 1 }'
        status, data, _ = self.request("POST", "/hooks/payments?source=test", raw,
                                       {"Content-Type": "application/json", "Authorization": "Bearer secret"})
        self.assertEqual(status, 202)
        event_id = json.loads(data)["id"]
        target_url = f"http://127.0.0.1:{self.target.server_port}/capture?run=1"
        status, data, _ = self.request("POST", "/api/replay", json.dumps({"eventId": event_id, "targetUrl": target_url}),
                                       {"Content-Type": "application/json"})
        result = json.loads(data)
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], 418)
        self.assertEqual(TargetHandler.received[0][0], "/capture?run=1")
        self.assertEqual(TargetHandler.received[0][1], raw)
        self.assertNotIn("Authorization", TargetHandler.received[0][2])
        self.assertIn("Authorization", result["omittedHeaders"])

        redirect_url = f"http://127.0.0.1:{self.target.server_port}/redirect"
        status, data, _ = self.request("POST", "/api/replay", json.dumps({"eventId": event_id, "targetUrl": redirect_url}),
                                       {"Content-Type": "application/json"})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data)["status"], 302)

    def test_replay_target_and_control_body_rejections(self):
        self.assertFalse(server.allowed_replay_target("http://169.254.169.254/"))
        self.assertFalse(server.allowed_replay_target("http://user:pass@localhost/"))
        self.assertTrue(server.allowed_replay_target("http://[::1]:3000/"))
        status, _, _ = self.request("POST", "/api/replay", "[]")
        self.assertEqual(status, 400)
        status, _, _ = self.request("POST", "/api/replay", "{", {"Origin": "http://evil.example"})
        self.assertEqual(status, 403)
        status, _, _ = self.request("GET", "/api/events", headers={"Origin": "null"})
        self.assertEqual(status, 403)

    def test_mock_status_and_exact_path(self):
        rule = {"path": "/hooks/orders", "method": "POST", "status": 400, "body": '{"error":"try again"}', "intercept": False}
        status, _, _ = self.request("POST", "/api/mock-rules", json.dumps(rule))
        self.assertEqual(status, 201)
        status, _, _ = self.request("POST", "/hooks/orders", b"{}")
        self.assertEqual(status, 400)
        self.assertEqual(server.STORE.list()[0]["status"], 400)
        status, _, _ = self.request("POST", "/hooks/orders-extra", b"{}")
        self.assertEqual(status, 202)

    def test_docs_redirect_and_assets(self):
        status, _, headers = self.request("GET", "/docs")
        self.assertEqual(status, 308)
        self.assertEqual(headers["Location"], "/docs/")
        status, _, _ = self.request("GET", "/docs/styles.css")
        self.assertEqual(status, 200)


if __name__ == "__main__":
    unittest.main()
