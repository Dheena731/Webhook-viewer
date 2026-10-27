#!/usr/bin/env python3
"""A dependency-free webhook receiver with a live browser dashboard."""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import queue
import signal
import threading
import uuid
from collections import deque
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8080"))
MAX_EVENTS = int(os.getenv("MAX_EVENTS", "500"))
MAX_BODY_BYTES = int(os.getenv("MAX_BODY_BYTES", str(1024 * 1024)))
STATIC_DIR = Path(__file__).resolve().parent / "static"
REDACTED_HEADERS = {
    "authorization",
    "cookie",
    "proxy-authorization",
    "set-cookie",
    "x-api-key",
}


class EventStore:
    def __init__(self, max_events: int) -> None:
        self._events: deque[dict] = deque(maxlen=max_events)
        self._subscribers: set[queue.Queue] = set()
        self._lock = threading.Lock()

    def add(self, event: dict) -> None:
        with self._lock:
            self._events.appendleft(event)
            subscribers = tuple(self._subscribers)
        for subscriber in subscribers:
            try:
                subscriber.put_nowait(event)
            except queue.Full:
                pass

    def list(self) -> list[dict]:
        with self._lock:
            return list(self._events)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()

    def subscribe(self) -> queue.Queue:
        subscriber: queue.Queue = queue.Queue(maxsize=100)
        with self._lock:
            self._subscribers.add(subscriber)
        return subscriber

    def unsubscribe(self, subscriber: queue.Queue) -> None:
        with self._lock:
            self._subscribers.discard(subscriber)


STORE = EventStore(MAX_EVENTS)


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


class WebhookHandler(BaseHTTPRequestHandler):
    server_version = "WebhookViewer/1.0"
    protocol_version = "HTTP/1.1"

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/":
            self._serve_static("index.html")
        elif path.startswith("/static/"):
            self._serve_static(path.removeprefix("/static/"))
        elif path == "/api/events":
            self._send_json({"events": STORE.list(), "maxEvents": MAX_EVENTS})
        elif path == "/api/stream":
            self._stream_events()
        elif path == "/healthz":
            self._send_json({"status": "ok"})
        elif self._is_webhook_path(path):
            self._capture_webhook()
        else:
            self._send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        self._capture_or_reject()

    def do_PUT(self) -> None:
        self._capture_or_reject()

    def do_PATCH(self) -> None:
        self._capture_or_reject()

    def do_DELETE(self) -> None:
        path = urlsplit(self.path).path
        if path == "/api/events":
            STORE.clear()
            self._send_json({"cleared": True})
        else:
            self._capture_or_reject()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
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
        return path == "/hooks" or path.startswith("/hooks/") or path == "/webhooks" or path.startswith("/webhooks/")

    def _capture_webhook(self) -> None:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
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
            "method": self.command,
            "path": parsed.path,
            "query": parse_qs(parsed.query, keep_blank_values=True),
            "client": self.client_address[0],
            "headers": redact_headers(self.headers),
            "body": body,
            "bodyFormat": body_format,
            "sizeBytes": len(raw),
        }
        STORE.add(event)
        self._send_json(
            {"received": True, "id": event["id"], "receivedAt": event["receivedAt"]},
            HTTPStatus.ACCEPTED,
        )

    def _stream_events(self) -> None:
        subscriber = STORE.subscribe()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self._cors_headers()
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
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(content)

    def _send_json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        content = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(content)

    def _cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")

    def log_message(self, format_string: str, *args) -> None:
        print(f"{self.address_string()} - {format_string % args}", flush=True)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), WebhookHandler)
    server.daemon_threads = True

    def shutdown(_signum, _frame) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    print(f"Webhook Viewer listening on http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
