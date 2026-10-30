# Thoondil product context

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers building and debugging webhook consumers on their own machine. They need to see what arrived, inspect the request, and reproduce a failure while working on an integration.

## Product Purpose

Thoondil is a local-first, self-hosted webhook viewer. Success means a developer can send a request to a named endpoint, understand its method, headers, query, and body, then replay its body to a local service with clear feedback.

## Positioning

A small Python standard-library tool with a browser interface and no required database or account. Event history is temporary and is lost on restart.

## Operating Context

The app runs directly with Python or in Docker. Local test requests can be sent with curl. External webhook providers require the developer to expose the receiver through their own public deployment or tunnel.

## Capabilities and Constraints

- Preserve the current capture, live stream, search, mock response, export, and replay workflows.
- Keep the first release local-first. The dashboard and control API must not be advertised as safe to expose without access control.
- Keep temporary in-memory history in this release and state its limits clearly.
- Use a static documentation site that can be published from `docs/` through GitHub Pages.

## Brand Commitments

The approved working name is Thoondil (தூண்டில்), a Tamil word for a fishing hook. The interface and docs should feel precise and useful to developers. The project needs an original logo that works at favicon and full wordmark sizes.

## Evidence on Hand

The existing Python server, browser UI, tests, README, and draft docs are the product evidence. Current `docs/assets/app-preview.svg` is an illustration, not an application screenshot. No user testimonials or usage metrics are available.

## Product Principles

- Show what actually happened, including limitations of capture and replay.
- Keep the path from first request to useful inspection short.
- Make powerful actions understandable and contained.
- Keep documentation aligned with tested behavior.
