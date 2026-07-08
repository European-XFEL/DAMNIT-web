---
date: 2026-07-08
---

# ADR-006 - Web framework: Litestar

## Context and Problem Statement

The API needs an async Python web framework. It has to provide REST routing, ASGI websockets for GraphQL subscriptions, session middleware, dependency injection, and OpenAPI generation.

Two requirements discriminate between candidates. Runtime dependencies are built once at startup and injected into handlers, so the framework must support typed application state with lifespan management and dependency declaration that is not welded to route signatures ([ADR-002](002-no-global-mutable-state.md)). The web framework must also stay at the edges of the codebase, so that domain and service code never imports it ([ADR-000](000-vertical-slice-architecture.md)).

## Considered Options

- FastAPI (the status quo).
- Litestar.

## Decision Outcome

Chosen option: "Litestar", because it provides typed `State`, layered `Provide`-based dependency injection, lifespan context managers, native session middleware, and an official Strawberry integration.

FastAPI satisfies the basics. Its dependency injection is expressed per route through `Depends` in signatures, its application state is an untyped `app.state` namespace, and its authlib OAuth integration is Starlette-specific. Litestar avoids each of these.

### Consequences

- Good: application state is typed and lifespan-managed, and dependencies are declared off the route signatures.
- Good: FastAPI and Starlette are no longer dependencies.
- Bad: the OAuth flow is implemented natively rather than through a framework integration, so it needs its own tests and security review.
- Bad: Litestar has a smaller ecosystem than FastAPI.

## Details

Framework types (`Request`, `ASGIConnection`, `Provide`) stay at the edges: route handlers, dependency providers, and permission classes. The narrow per-slice providers read Litestar's injected `State` and return a single `AppState` attribute, rather than declaring an `AppState` parameter, because `AppState`'s fields are `TYPE_CHECKING`-only forward references and only the composition root may import it ([ADR-002](002-no-global-mutable-state.md)).

Dependency injection resolves by parameter name against the `Provide` map, not by a `Depends` default, so the old `Annotated[T, Depends(...)]` aliases collapse to plain type aliases. Injected collaborators whose type is a union of concrete classes are annotated with `SkipValidation`, because Litestar's msgspec-based signature validation cannot build a decoder for a union of custom types.

FastAPI's `@app.exception_handler` decorators become a Litestar `exception_handlers` mapping. The 401-to-login redirect for known paths is preserved inside the `HTTPException` handler. The uvicorn proxy-headers middleware is dropped in favour of a `trust_forwarded_host` setting that gates use of the `x-forwarded-host` header in the OAuth callback URL only.
