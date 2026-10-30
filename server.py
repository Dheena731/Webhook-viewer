#!/usr/bin/env python3
"""A dependency-free webhook receiver with a live browser dashboard."""

from __future__ import annotations

import base64
import ipaddress
import json
import mimetypes
import os
import queue
import signal
import threading
import urllib.request
import urllib.error
import uuid
from collections import deque
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8080"))
MAX_EVENTS = int(os.getenv("MAX_EVENTS", "500"))
MAX_BODY_BYTES = int(os.getenv("MAX_BODY_BYTES", str(1024 * 1024)))
MAX_TOTAL_BODY_BYTES = max(MAX_BODY_BYTES, int(os.getenv("MAX_TOTAL_BODY_BYTES", str(64 * 1024 * 1024))))
MAX_CONTROL_BYTES = 64 * 1024
STATIC_DIR = Path(__file__).resolve().parent / "static"
DOCS_DIR = Path(__file__).resolve().parent / "docs"
REDACTED_HEADERS = {
    "authorization",
    "cookie",
    "proxy-authorization",
    "set-cookie",
    "x-api-key",
}
HOP_BY_HOP_HEADERS = {
    "host", "content-length", "connection", "keep-alive", "proxy-authenticate",
    "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade",
}


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def allowed_replay_target(target_url: str) -> bool:
    try:
        parsed = urlsplit(target_url)
        hostname = parsed.hostname
        _ = parsed.port
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https") or not hostname or parsed.username is not None or parsed.password is not None or parsed.fragment:
        return False
    if hostname.lower() in ("localhost", "host.docker.internal"):
        return True
    try:
        return ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        return False


def validate_mock_rule(rule: dict) -> str | None:
    if set(rule) - {"path", "method", "status", "body", "headers", "intercept"}:
        return "Unknown mock rule field"
    path = rule.get("path")
    if not isinstance(path, str) or not (path.startswith("/hooks/") or path.startswith("/webhooks/")) or len(path) > 512:
        return "path must be a /hooks/<name> or /webhooks/<name> path"
    method = rule.get("method", "")
    if not isinstance(method, str) or method.upper() not in ("", "GET", "POST", "PUT", "PATCH", "DELETE"):
        return "method must be GET, POST, PUT, PATCH, DELETE, or empty"
    status = rule.get("status", 200)
    if isinstance(status, bool) or not isinstance(status, int) or status < 200 or status > 599 or status in (204, 304):
        return "status must be 200–599, excluding 204 and 304"
    if not isinstance(rule.get("body", ""), str) or len(rule.get("body", "").encode("utf-8")) > MAX_CONTROL_BYTES:
        return "body must be a string of at most 64 KiB"
    if not isinstance(rule.get("intercept", False), bool):
        return "intercept must be a boolean"
    headers = rule.get("headers", {})
    if not isinstance(headers, dict) or len(headers) > 20:
        return "headers must be an object with at most 20 entries"
    for name, value in headers.items():
        if (not isinstance(name, str) or not isinstance(value, str) or
            not name or len(name) > 128 or len(value) > 1024 or
            any(c in name + value for c in "\r\n") or name.lower() in HOP_BY_HOP_HEADERS):
            return "headers contain an invalid or connection-specific entry"
    return None

# Mock rules: list of {"path": str, "method": str, "status": int, "body": str, "headers": dict}
MOCK_RULES: list[dict] = []
MOCK_RULES_LOCK = threading.Lock()


class EventStore:
    def __init__(self, max_events: int, max_body_bytes: int = 64 * 1024 * 1024) -> None:
        self._events: deque[dict] = deque()
        self._raw_bodies: dict[str, bytes] = {}
        self._total_body_bytes = 0
        self._max_events = max_events
        self._max_body_bytes = max_body_bytes
        self._subscribers: set[queue.Queue] = set()
        self._lock = threading.Lock()

    def add(self, event: dict, raw_body: bytes = b"") -> None:
        with self._lock:
            self._events.appendleft(event)
            self._raw_bodies[event["id"]] = raw_body
            self._total_body_bytes += len(raw_body)
            while len(self._events) > self._max_events or self._total_body_bytes > self._max_body_bytes:
                oldest = self._events.pop()
                self._total_body_bytes -= len(self._raw_bodies.pop(oldest["id"], b""))
            subscribers = tuple(self._subscribers)
        for subscriber in subscribers:
            try:
                subscriber.put_nowait(event)
            except queue.Full:
                pass

    def list(self, method: str = "", path: str = "", q: str = "") -> list[dict]:
        with self._lock:
            events = list(self._events)
        if method:
            events = [e for e in events if e["method"].upper() == method.upper()]
        if path:
            events = [e for e in events if path.lower() in e["path"].lower()]
        if q:
            q_lower = q.lower()
            events = [
                e for e in events
                if q_lower in e["path"].lower()
                or q_lower in json.dumps(e.get("body", ""), ensure_ascii=False).lower()
                or q_lower in json.dumps(e.get("headers", {}), ensure_ascii=False).lower()
                or q_lower in e["method"].lower()
            ]
        return events

    def get(self, event_id: str) -> dict | None:
        with self._lock:
            for e in self._events:
                if e["id"] == event_id:
                    return dict(e)
        return None

    def get_raw_body(self, event_id: str) -> bytes | None:
        with self._lock:
            return self._raw_bodies.get(event_id)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()
            self._raw_bodies.clear()
            self._total_body_bytes = 0

    def subscribe(self) -> queue.Queue:
        subscriber: queue.Queue = queue.Queue(maxsize=100)
        with self._lock:
            self._subscribers.add(subscriber)
        return subscriber

    def unsubscribe(self, subscriber: queue.Queue) -> None:
        with self._lock:
            self._subscribers.discard(subscriber)


STORE = EventStore(MAX_EVENTS, MAX_TOTAL_BODY_BYTES)


def redact_headers(headers) -> dict[str, str]:
    return {
        name: "[redacted]" if name.lower() in REDACTED_HEADERS else value
        for name, value in headers.items()
    }


def decode_body(raw: bytes, content_type: str) -> tuple[object, str]:
    if not raw:
        return None, "empty"

    media_type = content_type.split(";", 1)[0].strip().lower()
    charset = "utf-8"
    for part in content_type.split(";")[1:]:
        if part.strip().lower().startswith("charset="):
            charset = part.split("=", 1)[1].strip().strip('"')

    try:
        text = raw.decode(charset)
    except (LookupError, UnicodeDecodeError):
        return base64.b64encode(raw).decode("ascii"), "base64"

    if media_type == "application/json" or media_type.endswith("+json"):
        try:
            return json.loads(text), "json"
        except json.JSONDecodeError:
            return text, "text"
    if media_type == "application/x-www-form-urlencoded":
        return parse_qs(text, keep_blank_values=True), "form"
    return text, "text"


def find_mock_rule(path: str, method: str) -> dict | None:
    with MOCK_RULES_LOCK:
        for rule in MOCK_RULES:
            rule_path = rule.get("path", "")
            rule_method = rule.get("method", "").upper()
            if rule_path and rule_path != path:
                continue
            if rule_method and rule_method != method.upper():
                continue
            return rule
    return None


class WebhookHandler(BaseHTTPRequestHandler):
    server_version = "Thoondil/1.0"
    protocol_version = "HTTP/1.1"

    def do_GET(self) -> None:
        if not self._allowed_browser_origin():
            return
        parsed = urlsplit(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query, keep_blank_values=True)

        if path == "/":
            self._serve_static("index.html")
        elif path.startswith("/static/"):
            self._serve_static(path.removeprefix("/static/"))
        elif path == "/docs":
            self.send_response(HTTPStatus.PERMANENT_REDIRECT)
            self.send_header("Location", "/docs/")
            self.send_header("Content-Length", "0")
            self.end_headers()
        elif path == "/docs/":
            self._serve_docs("index.html")
        elif path.startswith("/docs/"):
            self._serve_docs(path.removeprefix("/docs/"))
        elif path == "/api/events":
            method_filter = self._first(qs.get("method", []))
            path_filter = self._first(qs.get("path", []))
            q_filter = self._first(qs.get("q", []))
            events = STORE.list(method=method_filter, path=path_filter, q=q_filter)
            self._send_json({"events": events, "maxEvents": MAX_EVENTS, "total": len(events)})
        elif path == "/api/stream":
            self._stream_events()
        elif path == "/api/export":
            self._export_events()
        elif path == "/healthz":
            self._send_json({"status": "ok"})
        elif path == "/api/mock-rules":
            with MOCK_RULES_LOCK:
                self._send_json({"rules": list(MOCK_RULES)})
        elif self._is_webhook_path(path):
            self._capture_webhook()
        else:
            self._send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        if not self._allowed_browser_origin():
            return
        path = urlsplit(self.path).path
        if path == "/api/replay":
            self._replay_event()
        elif path == "/api/mock-rules":
            self._add_mock_rule()
        else:
            self._capture_or_reject()

    def do_PUT(self) -> None:
        if not self._allowed_browser_origin():
            return
        self._capture_or_reject()

    def do_PATCH(self) -> None:
        if not self._allowed_browser_origin():
            return
        self._capture_or_reject()

    def do_DELETE(self) -> None:
        if not self._allowed_browser_origin():
            return
        path = urlsplit(self.path).path
        if path == "/api/events":
            STORE.clear()
            self._send_json({"cleared": True})
        elif path == "/api/mock-rules":
            self._delete_mock_rule()
        else:
            self._capture_or_reject()

    def do_OPTIONS(self) -> None:
        if not self._allowed_browser_origin():
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _capture_or_reject(self) -> None:
        if self._is_webhook_path(urlsplit(self.path).path):
            self._capture_webhook()
        else:
            self._send_json(
                {"error": "Send webhooks to /hooks/<name> or /webhooks/<name>"},
                HTTPStatus.NOT_FOUND,
            )

    @staticmethod
    def _is_webhook_path(path: str) -> bool:
        return (
            path == "/hooks"
            or path.startswith("/hooks/")
            or path == "/webhooks"
            or path.startswith("/webhooks/")
        )

    def _capture_webhook(self) -> None:
        path = urlsplit(self.path).path
        method = self.command

        # Check for mock rule
        rule = find_mock_rule(path, method)
        if rule and rule.get("intercept", False):
            self.close_connection = True
            status_code = rule.get("status", 200)
            body_text = rule.get("body", '{"mocked": true}')
            extra_headers = rule.get("headers", {})
            body_bytes = body_text.encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", extra_headers.get("Content-Type", "application/json; charset=utf-8"))
            for k, v in extra_headers.items():
                if k.lower() != "content-type":
                    self.send_header(k, v)
            self.send_header("Content-Length", str(len(body_bytes)))
            self.end_headers()
            self.wfile.write(body_bytes)
            return

        if self.headers.get("Transfer-Encoding"):
            self.close_connection = True
            self._send_json({"error": "Transfer-Encoding is not supported"}, HTTPStatus.BAD_REQUEST)
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json({"error": "Invalid Content-Length"}, HTTPStatus.BAD_REQUEST)
            return

        if content_length < 0:
            self.close_connection = True
            self._send_json({"error": "Invalid Content-Length"}, HTTPStatus.BAD_REQUEST)
            return

        if content_length > MAX_BODY_BYTES:
            self.close_connection = True
            self._send_json(
                {"error": f"Body exceeds MAX_BODY_BYTES ({MAX_BODY_BYTES})"},
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
            )
            return

        raw = self.rfile.read(content_length) if content_length else b""
        body, body_format = decode_body(raw, self.headers.get("Content-Type", ""))
        parsed = urlsplit(self.path)
        event = {
            "id": uuid.uuid4().hex,
            "receivedAt": datetime.now(timezone.utc).isoformat(),
            "method": method,
            "path": parsed.path,
            "query": parse_qs(parsed.query, keep_blank_values=True),
            "client": self.client_address[0],
            "headers": redact_headers(self.headers),
            "body": body,
            "bodyFormat": body_format,
            "sizeBytes": len(raw),
            "status": 202,
            "pinned": False,
        }
        response_status = HTTPStatus.ACCEPTED
        response_body = {"received": True, "id": event["id"], "receivedAt": event["receivedAt"]}

        # Apply non-intercept mock rule (custom response code/body but still record)
        if rule:
            response_status = rule.get("status", 202)
            if rule.get("body"):
                try:
                    response_body = json.loads(rule["body"])
                except Exception:
                    response_body = rule["body"]

        event["status"] = int(response_status)
        STORE.add(event, raw)

        self._send_json(response_body, response_status)

    def _stream_events(self) -> None:
        subscriber = STORE.subscribe()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        try:
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            while True:
                try:
                    event = subscriber.get(timeout=15)
                    payload = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
                    self.wfile.write(f"event: webhook\ndata: {payload}\n\n".encode("utf-8"))
                except queue.Empty:
                    self.wfile.write(b": keepalive\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass
        finally:
            STORE.unsubscribe(subscriber)

    def _export_events(self) -> None:
        events = STORE.list()
        content = json.dumps(events, indent=2, ensure_ascii=False).encode("utf-8")
        filename = f"webhooks-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.json"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _replay_event(self) -> None:
        """Replay original body bytes to a local target."""
        body_data = self._read_control_json()
        if body_data is None:
            return

        event_id = body_data.get("eventId")
        target_url = body_data.get("targetUrl", "")
        if not isinstance(target_url, str):
            self._send_json({"error": "targetUrl must be a URL string"}, HTTPStatus.BAD_REQUEST)
            return
        target_url = target_url.strip()

        if not event_id or not target_url:
            self._send_json({"error": "eventId and targetUrl are required"}, HTTPStatus.BAD_REQUEST)
            return

        if not allowed_replay_target(target_url):
            self._send_json({"error": "Replay target must be an HTTP(S) localhost or host.docker.internal URL"}, HTTPStatus.BAD_REQUEST)
            return

        event = STORE.get(event_id)
        if not event:
            self._send_json({"error": "Event not found"}, HTTPStatus.NOT_FOUND)
            return

        replay_headers = {
            k: v for k, v in event["headers"].items()
            if v != "[redacted]" and k.lower() not in HOP_BY_HOP_HEADERS
        }
        replay_body = STORE.get_raw_body(event_id)
        if replay_body is None:
            self._send_json({"error": "Original body is no longer available"}, HTTPStatus.NOT_FOUND)
            return

        try:
            req = urllib.request.Request(
                target_url,
                data=replay_body,
                headers=replay_headers,
                method=event["method"],
            )
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirectHandler())
            with opener.open(req, timeout=10) as resp:
                resp_body = resp.read(4096)
                self._send_json({
                    "replayed": True,
                    "targetUrl": target_url,
                    "status": resp.status,
                    "responseBody": resp_body.decode("utf-8", errors="replace"),
                    "omittedHeaders": [k for k, v in event["headers"].items() if v == "[redacted]" or k.lower() in HOP_BY_HOP_HEADERS],
                })
        except urllib.error.HTTPError as exc:
            with exc:
                response_body = exc.read(4096).decode("utf-8", errors="replace")
            self._send_json({"replayed": True, "targetUrl": target_url, "status": exc.code,
                             "responseBody": response_body,
                             "omittedHeaders": [k for k, v in event["headers"].items() if v == "[redacted]" or k.lower() in HOP_BY_HOP_HEADERS]})
        except Exception as exc:
            self._send_json({
                "replayed": False,
                "error": str(exc),
                "targetUrl": target_url,
            }, HTTPStatus.BAD_GATEWAY)

    def _add_mock_rule(self) -> None:
        rule = self._read_control_json()
        if rule is None:
            return
        error = validate_mock_rule(rule)
        if error:
            self._send_json({"error": error}, HTTPStatus.BAD_REQUEST)
            return
        rule["id"] = uuid.uuid4().hex
        with MOCK_RULES_LOCK:
            if len(MOCK_RULES) >= 100:
                self._send_json({"error": "Maximum of 100 mock rules reached"}, HTTPStatus.BAD_REQUEST)
                return
            MOCK_RULES.append(rule)
        self._send_json({"created": True, "rule": rule}, HTTPStatus.CREATED)

    def _delete_mock_rule(self) -> None:
        parsed = urlsplit(self.path)
        qs = parse_qs(parsed.query)
        rule_id = self._first(qs.get("id", []))
        if not rule_id:
            self._send_json({"error": "id query param required"}, HTTPStatus.BAD_REQUEST)
            return
        with MOCK_RULES_LOCK:
            before = len(MOCK_RULES)
            MOCK_RULES[:] = [r for r in MOCK_RULES if r.get("id") != rule_id]
            deleted = len(MOCK_RULES) < before
        self._send_json({"deleted": deleted})

    def _serve_static(self, relative_path: str) -> None:
        requested = (STATIC_DIR / relative_path).resolve()
        if STATIC_DIR.resolve() not in requested.parents and requested != STATIC_DIR.resolve():
            self._send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
            return
        if not requested.is_file():
            self._send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
            return
        content = requested.read_bytes()
        content_type = mimetypes.guess_type(requested.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8" if content_type.startswith("text/") or content_type in ("application/javascript", "application/json") else content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(content)

    def _serve_docs(self, relative_path: str) -> None:
        requested = (DOCS_DIR / relative_path).resolve()
        if DOCS_DIR.resolve() not in requested.parents and requested != DOCS_DIR.resolve():
            self._send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
            return
        if requested.is_dir():
            requested = requested / "index.html"
        if not requested.is_file():
            self._send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
            return
        content = requested.read_bytes()
        content_type = mimetypes.guess_type(requested.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8" if content_type.startswith("text/") or content_type in ("application/javascript", "application/json") else content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(content)

    def _send_json(self, payload: object, status: int = HTTPStatus.OK) -> None:
        content = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _allowed_browser_origin(self) -> bool:
        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "")
        if self.headers.get("Sec-Fetch-Site", "").lower() == "cross-site" or (
            origin and (origin == "null" or urlsplit(origin).netloc.lower() != host.lower()
                        or urlsplit(origin).scheme not in ("http", "https"))
        ):
            self.close_connection = True
            self._send_json({"error": "Cross-origin browser requests are not allowed"}, HTTPStatus.FORBIDDEN)
            return False
        return True

    def _read_control_json(self) -> dict | None:
        if self.headers.get("Transfer-Encoding"):
            self.close_connection = True
            self._send_json({"error": "Transfer-Encoding is not supported"}, HTTPStatus.BAD_REQUEST)
            return None
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self.close_connection = True
            self._send_json({"error": "Content-Length is required"}, HTTPStatus.LENGTH_REQUIRED)
            return None
        if length < 1 or length > MAX_CONTROL_BYTES:
            self.close_connection = True
            self._send_json({"error": f"Control body must be 1–{MAX_CONTROL_BYTES} bytes"}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE if length > MAX_CONTROL_BYTES else HTTPStatus.BAD_REQUEST)
            return None
        try:
            value = json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json({"error": "Body must be valid JSON"}, HTTPStatus.BAD_REQUEST)
            return None
        if not isinstance(value, dict):
            self._send_json({"error": "Body must be a JSON object"}, HTTPStatus.BAD_REQUEST)
            return None
        return value

    @staticmethod
    def _first(lst: list) -> str:
        return lst[0] if lst else ""

    def log_message(self, format_string: str, *args) -> None:
        print(f"{self.address_string()} - {format_string % args}", flush=True)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), WebhookHandler)
    server.daemon_threads = True

    def shutdown(_signum, _frame) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    print(f"Thoondil listening on http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
