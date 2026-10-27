# Webhook Viewer

A tiny, dependency-free service for receiving and viewing webhook requests from microservices. Requests appear instantly in a browser dashboard using Server-Sent Events.

## Run with Docker Compose

```bash
cd ~/webhook-viewer
docker compose up --build -d
```

Open <http://localhost:8090>, then send a sample webhook:

```bash
curl -X POST 'http://localhost:8090/hooks/orders?source=demo' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer example-secret' \
  -d '{"orderId":"ORD-42","status":"completed"}'
```

Stop it with:

```bash
docker compose down
```

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /` | Live dashboard |
| `POST/PUT/PATCH/DELETE/GET /hooks/<name>` | Receive a webhook |
| `POST/PUT/PATCH/DELETE/GET /webhooks/<name>` | Alias for `/hooks` |
| `GET /api/events` | Current in-memory events as JSON |
| `DELETE /api/events` | Clear all events |
| `GET /api/stream` | Live Server-Sent Events stream |
| `GET /healthz` | Container health check |

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | HTTP listen port |
| `MAX_EVENTS` | `500` | Maximum in-memory events retained |
| `MAX_BODY_BYTES` | `1048576` | Maximum request body size (1 MiB) |

The Compose host port defaults to `8090` because `8080` is commonly occupied by other local services. Override it when needed:

```bash
WEBHOOK_VIEWER_PORT=9000 docker compose up --build -d
```

History is intentionally in memory and disappears when the container restarts. `Authorization`, `Cookie`, `Set-Cookie`, `Proxy-Authorization`, and `X-API-Key` values are redacted before storage and display.

## Network note

The Compose file publishes port `8090` on all host interfaces. This viewer has no authentication, so use it only on a trusted development network. To restrict it to the local machine, change the port mapping to `127.0.0.1:${WEBHOOK_VIEWER_PORT:-8090}:8080`.

## Run without Docker

```bash
python3 server.py
```

## Tests

```bash
python3 -m unittest discover -s tests -v
```
