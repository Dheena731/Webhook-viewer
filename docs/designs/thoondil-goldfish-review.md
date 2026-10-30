# Goldfish review — Thoondil first release

Three fresh-context reviewers read the release design and existing implementation: design critique, implementation readiness, and comprehension/codebase detail. All three independently identified the same release risks.

## Findings and resolutions

| Finding | Resolution in the design |
| --- | --- |
| Local-first promise did not cover direct Python runs | Default `HOST` is loopback; Compose publishes only on loopback. Remote exposure requires a deliberate override and upstream access control. |
| Replay destination checks could be bypassed by redirects | Accept only HTTP(S) loopback literals, `localhost`, or `host.docker.internal`; reject URL credentials; disable redirects and proxies. |
| Raw body storage could leak via list, stream, or export and consume large amounts of memory | Keep raw bytes in a private store, omit them from event APIs, and evict oldest events at 64 MiB of original bodies or the event-count limit. |
| “Exact replay” was underspecified | Promise exact body bytes only. Method and safe headers are sent; redacted and hop-by-hop headers are omitted. The target URL replaces original path and query. |
| Mock response rules lacked validation and exact matching | Validate the rule shape and size; match exact paths; record actual non-intercept status; keep intercept mode uncaptured. |
| Mobile inspector was inaccessible | Feed selection opens a detail view with Back and focus restoration; feed rows activate by keyboard. |
| GitHub Pages, screenshots, and license were unresolved | Publish the static `docs/` project site, capture real browser screenshots, and add MIT text matching the repository's existing claim. |

## Remaining limits

The app has no authentication, durable storage, or public webhook URL. A remote provider requires a tunnel or a separately secured deployment. Request bodies and query parameters can contain secrets; header redaction is limited to the named header list. These limits belong in the shipped docs.
