---
date: 2026-07-07
---

# ADR-005 - Repository pattern for DAMNIT run data

## Context and Problem Statement

Run and variable data lives in per-proposal SQLite files (`runs.sqlite`) produced by DAMNIT itself. The schema is external: the API reads it but does not own it, must reflect it at runtime, and there is one database per proposal on a network filesystem.

Reading that data directly with SQLAlchemy from the GraphQL resolvers welds the transport layer to the DAMNIT schema, makes resolver logic untestable without real SQLite fixtures, and scatters session handling and caching across call sites. The data-access layer needs a seam: a narrow interface the resolvers depend on, with the SQL, reflection, and caching behind it.

## Considered Options

- Direct SQLAlchemy access from the resolvers (the status quo).
- A `DamnitRepository` interface the resolvers depend on, with SQL, reflection, and caching behind it.

## Decision Outcome

Chosen option: the repository interface, because it decouples resolvers from SQLAlchemy and the DAMNIT schema, lets them be tested against a lightweight backend, and gives caching and session handling a single home.

### Consequences

- Good: resolvers depend only on the interface and plain domain models, so they are testable against the CSV backend without SQLite fixtures.
- Good: a new data source (a DAMNIT HTTP API, Parquet exports) is a new `runs/<backend>/` package implementing the same ABC.
- Bad: the registry accumulates one repository, and one engine, per accessed proposal for the process lifetime; eviction is available but not automatic (acceptable at current scale).

## Details

### The rules

1. **`DamnitRepository`** (`runs/repository.py`, ABC) is the only way application code reads DAMNIT run data. One instance per proposal. Contract: `get_runs`, `get_latest_runs`, `get_metadata`, `get_extracted_data` (must not block the event loop, see [ADR-004](004-proposal-path-locator.md)), and `invalidate_metadata_cache`.
2. **Return types are plain domain dataclasses** (`runs/models.py`: `RunRecord`, `VariableValue`, `MetadataSnapshot`, `VariableInfo`, `TagInfo`, `KnownVariable`) - no framework or SQLAlchemy types. Serialisation to transport shapes happens outside the repository.
3. **A `DamnitRepositoryRegistry`** (held on `AppState`, see [ADR-002](002-no-global-mutable-state.md)) lazily creates and caches one repository per `ProposalNumber` via an injected factory, and supports eviction (`pop`, `clear`).
4. **Implementations.** `runs/sqlite/` is production: async SQLAlchemy over `runs.sqlite`, read-only sessions (`PRAGMA query_only = ON`), `NullPool`, connection timeouts, and a per-repo table-reflection cache plus a metadata TTL cache (the approved cache pattern of [ADR-002](002-no-global-mutable-state.md)). `runs/csv/` is dev/test: it reads `runs.csv` / `run_variables.csv` / `variables.csv` and exercises resolver and subscription logic without SQLite fixtures.
5. Caching lives inside the implementations; callers never wrap repository calls in their own module-level caches.
