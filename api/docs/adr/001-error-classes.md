---
date: 2026-07-07
---

# ADR-001 - Error Classes: DamnitWebError and Transport Mapping

## Context and Problem Statement

The API has a few distinct (expected) failure modes/errors, such as unknown/missing proposals, upstream service errors, expected/unexpected permission errors, etc...

Using standard/builtin/re-raising exceptions makes it harder to distinguish between these, and harder to dispatch to the appropriate error handler.

To address this, we define a single `DamnitWebError` class hierarchy in `shared/errors.py`, and raise application-specific subclasses from application code.

## Considered Options

- Keep raising builtin exceptions and map them ad hoc at each transport boundary
- A single `DamnitWebError` class hierarchy, raised by application code and mapped to transport responses once, at the edge

## Decision Outcome

Chosen option: a single `DamnitWebError` hierarchy in `shared/errors.py`, because it makes caller-distinguishable failures easy to identify in application code and lets each transport map errors to a response exactly once, rather than re-deriving the mapping at every call site.

### Consequences

- Good: the frontend gets stable, machine-readable error codes; support gets `request_id` correlation for every failure response.
- Good: "what can go wrong here" is visible (`raise ProposalNotFoundError` vs anonymous `ValueError`s).
- Bad: a small ongoing tax, new failure modes require choosing (or adding) a subclass; that is the review conversation working as intended.

## Details

### The error classes

Defined in `shared/errors.py`, framework-free:

```python
class DamnitWebError(Exception):
    code: int = 500            # class attribute, always defined
    message: str
    details: str | dict | None
    request_id: str | None     # from structlog contextvars

class InvalidInputError(DamnitWebError):              code = 400
class UnauthenticatedError(DamnitWebError):           code = 401
class ForbiddenError(DamnitWebError):                 code = 403
class NotFoundError(DamnitWebError):                  code = 404
class ProposalNotFoundError(NotFoundError):    ...
class UpstreamServiceError(DamnitWebError):           code = 502   # MyMdC, OIDC provider
class DataUnavailableError(DamnitWebError):           code = 503   # GPFS timeouts, unreadable runs.sqlite
```

Subclasses are added per _caller-distinguishable situation_, not per call site.

### Rules

1. **Application code raises `DamnitWebError` subclasses** for any failure that can reach a client.
   - Builtin exceptions in routers/resolvers/services are reserved for programming errors
   - Any builtin (not custom) exceptions will become a 500/internal error.
2. **Mapping happens once, at the edge:**
   - REST: a `DamnitWebError` exception handler returns `{"message", "details", "request_id"}` with `exc.code`.
   - GraphQL: the intent is for `DamnitWebError`s raised in resolvers to surface as GraphQL errors with `extensions: {"code": <name>, "request_id": ...}` via an error formatter, so the frontend branches on `code`, not message text (_planned, not yet implemented_). <!--TODO-->
   - Permission denials use the Strawberry permission mechanism (message on the permission class); `ForbiddenError` is the same concept for non-GraphQL paths.
3. **Boundaries translate exceptions.** Infrastructure exceptions do not cross layer boundaries raw:
   - MyMdC client errors become `UpstreamServiceError`
   - Locator/repository/filesystem failures become `ProposalNotFoundError`/`DataUnavailableError`, logged with context at the point of translation (log-then-raise).
