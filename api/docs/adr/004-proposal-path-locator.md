---
date: 2026-07-07
---

# ADR-004 - Proposal path resolution: pure value type, injectable locator

## Context and Problem Statement

A proposal number arrives as an untyped string or integer and is used in three ways: as a GraphQL input, as a filesystem path to the proposal's DAMNIT directory, and as a persistence key. Turning a number into a directory requires filesystem probing on GPFS - globbing under the proposal root, checking candidate directories, stat-ing for read-only status. GPFS is a network filesystem, so those calls can stall for seconds, and a hung mount can stall them indefinitely.

Two questions follow. Where does a proposal number get validated and formatted? Where does number-to-directory resolution live?

## Considered Options

- One `ProposalNumber` type that both validates and resolves its own path, reading configuration directly (the reference tree's approach: a blocking `find_damnit_path_sync` method).
- A pure `ProposalNumber` value type plus a separate injectable `ProposalPathLocator` that owns resolution.

## Decision Outcome

Chosen option: a pure value type plus a separate locator, because it keeps the value type free of I/O and settings, and isolates slow GPFS access behind a swappable, testable seam.

### Consequences

- Good: `ProposalNumber` validation and formatting are pure and trivially unit-testable, with no settings coupling.
- Good: path heuristics live in one place behind a protocol, swappable for local mode and for tests.
- Bad: resolution becomes asynchronous once fully adopted, which will ripple into repository acquisition and the resolvers that call it.

## Details

### The rules

1. `ProposalNumber` (target `core/types.py`, today `shared/models.py`) is a pure value type. It validates (1-999999, rejects floats), formats to the canonical `p{n:06d}` form, and carries a pydantic schema. It does no I/O and reads no settings.
2. Number-to-directory resolution belongs in a `ProposalPathLocator` (target `proposals/locator.py`), built by a factory, held on `AppState`, and injected where resolution is needed. Implementations are a GPFS locator (production glob heuristics) and a fixed locator (local mode and tests).
3. Filesystem calls in request paths run off the event loop with timeouts. A hung GPFS mount degrades one request, not the whole server.
4. A failed resolution raises `ProposalNotFoundError` (see [ADR-001](001-error-classes.md)) at the edge, not a bare error from a constructor.
