# Thoondil first open-source release

## Problem and goals

Developers need a small local webhook receiver that makes an incoming request easy to inspect and reproduce. The current prototype works, but release documentation overstates replay fidelity, the mobile inspector is hidden, Docker omits the docs, and control endpoints can be used without authentication if exposed. The first release will fix these gaps, use the Thoondil identity, and ship credible documentation with real screenshots.

Goals: accurate capture and replay messaging; usable desktop and mobile inspection; local-first defaults; a static GitHub Pages docs site; accurate README; original vector logo; meaningful server and browser checks.

Non-goals: hosted public endpoints, team accounts, persistent event history, scheduled retry queues, Temporal integration, and a cloud service.

## Technical plan

1. In `server.py`, retain bounded in-memory events and original request bytes in a private store. Limit the event count and total stored body bytes; evict oldest events to stay within both limits. Public list, SSE, and export continue to contain decoded bodies but never a new raw byte field. Replay uses the original bytes for every body type. The supplied target URL replaces the original path and query. Replay preserves method, body bytes, and safe unredacted end-to-end headers; it omits credential headers already redacted, Host, Content-Length, and hop-by-hop headers. The UI and docs must describe this boundary.
2. Bind direct Python to `127.0.0.1` by default. Container publishing binds `127.0.0.1` on the host by default. A developer can deliberately opt into another binding but must provide access control upstream; the app does not promise safe unauthenticated public operation. Reject foreign `Origin` and cross-site Fetch Metadata on dashboard/control routes. Do not send wildcard CORS headers.
3. Replay accepts only HTTP(S) targets with no URL credentials or fragment, whose hostname is `localhost`, `host.docker.internal`, or a literal loopback IP. It does not follow redirects or use system proxies. Document that `localhost` inside Docker is the container and `host.docker.internal` reaches the host. No arbitrary target allowlist in v1.
4. Bound JSON control request sizes and reject missing, invalid, negative, oversized, and unsupported transfer lengths with clear 4xx responses. Validate mock rules: exact path match, optional method, status 200–599 except 204 and 304, string body within limit, safe response headers, and maximum rule count. Intercept rules return before capture and close the connection; ordinary mock rules capture and record their actual response status.
5. In `compose.yaml`, bind the published port to loopback by default. Include `docs/` in `Dockerfile`, serve `/docs/` consistently, and document Docker-to-host replay addresses.
6. In `static/`, refine the three-pane workspace rather than replace it. At narrow widths, selecting a feed item opens its inspector and Back returns to the feed; Escape also returns. Restore focus to the selected item. Event rows activate with Enter or Space. Keep status and replay messaging precise. Replace HookInspect brand assets with Thoondil SVG assets.
7. In `docs/`, retain a static site suitable for GitHub Pages at `https://dheena731.github.io/Webhook-viewer/`. Rework the page around the first useful webhook, actual product workflows, API facts, local-first deployment limits, and troubleshooting. Use relative paths that work under the project subpath; the app link points to the local instance and is labeled as such. Include real application screenshots captured after the UI is complete.
8. Rebuild `README.md` as a concise project entry point with a real screenshot, quickstart, feature boundaries, tested examples, docs link, security guidance, and contribution/license links. Use MIT license terms, matching the existing README claim, and add the actual `LICENSE` file.

## Alternatives considered

- Temporal: durable workflow infrastructure adds a service, worker, and persistence concerns to a viewer with temporary events. Revisit only if scheduled delivery or durable retries become core requirements.
- Persistent storage now: useful for teams, but increases setup and data handling scope. Keep history temporary and explicit in v1.
- Public multi-user deployment now: requires authentication, isolation, and stronger abuse controls. Keep the first release local-first.
- Replacing the static UI stack: adds build tooling without addressing the current user problems. Extend the existing HTML, CSS, and JavaScript.

## Detailed implementation plan

- `server.py`: add original-body storage with a 64 MiB total default budget (`MAX_TOTAL_BODY_BYTES`), replay target policy, bounded 64 KiB control request parsing, origin checks, and tested mock rule validation. Preserve existing API routes where possible.
- `tests/test_http.py`: add HTTP integration cases for exact replay bytes, invalid targets, mock status, docs routes, and request errors.
- `Dockerfile`, `compose.yaml`: include docs and local bind; document container networking.
- `static/index.html`, `static/styles.css`, `static/app.js`, `static/logo.svg`, `static/favicon.svg`: apply Thoondil identity and responsive inspector/navigation changes.
- `docs/index.html`, `docs/styles.css`, `docs/assets/*`: rebuild truthful documentation and add real desktop/mobile captures.
- `README.md`, `CONTRIBUTING.md`, `LICENSE`: align project entry and contributor information with shipped behavior and selected licensing.
- Verify Python tests, actual HTTP requests, a Docker build when Docker is installed, GitHub Pages relative paths, and visual screenshots at 1440px desktop and 390px mobile widths. Check keyboard selection and the mobile feed/detail transition.
