---
date: 2026-07-07
---

# ADR-002 - No Global Mutable State: `AppState`, Factories, One Composition Root

## Context and Problem Statement

This service has a few long-lived runtime dependencies:

- application database engine and session factory
- (authenticated) clients (MyMdC, OAuth)
- per-proposal DAMNIT database accessors
- OAuth token store
- subscription cursors

These are currently implemented as module-level singletons bootstrapped at startup (`_db.__ENGINE`, `_mymdc.CLIENT`, `auth.__CLIENT`, `TOKEN_STORE`, a registry metaclass).

This is problematic as any function can reach any dependency, initialisation order becomes critical and is quite opaque, tests must mutate or clear process-wide state between cases, multiple app instances with different configurations cannot coexist in one process, in-process state looks shareable but silently breaks under multiple workers, etc...

The aim of this ADR is to consider different options for managing these dependencies.

## Considered Options

- Keep module-level singletons, initialised by startup hooks
- A single typed state container built in the application lifespan, with dependencies injected everywhere else

## Decision Outcome

Chosen option: a single frozen `AppState` dataclass built once in the lifespan. This makes initialisation typed and order-explicit (the constructor is the startup contract), lets tests inject doubles by constructing state rather than patching modules, and makes deliberately process-local state visible instead of hidden in module scope.

### Consequences

- Good: initialisation order and the full dependency set are explicit in one place
  - Good: missing dependency results in construction error at startup, not a `None` at request time.
- Good: tests build `AppState` with fakes (a mock MyMdC client, a stub OAuth client)
  - Good: removes/reduces need to monkeypatch modules and clear cache between tests.
- Bad: (ish?) dependencies must be specified through signatures instead of imported where needed
  - This is kind of the whole point, but it does mean there is more code to do the same thing (importing a global is easier/shorter)

## Details

### The rules

1. All runtime dependencies stored in a single frozen `AppState` dataclass (`state.py`) which is constructed once in the application lifespan and attached to `app.state`. This currently contains:
   - App DB engine/sessionmaker, MyMdC client, OAuth client (`None` when auth is disabled), DAMNIT DB registry, subscription cursors.
2. Each field is built by a pure factory function (`create_*`) taking `Settings` as explicit arguments. No factory reads module state or has side effects beyond constructing its object.
3. There is exactly one composition/setup root: the app entrypoint and its lifespan (target shape: `create_app(settings)`, see the ADR-000 layout).
   - This is the only place that reads settings to select implementations.
   - Handlers, resolvers, and services receive dependencies via DI or plain parameters, they must **never** import them.
   <!-- TODO: add to import linting -->
4. Caches must be treated as state.
   - Any cache must be owned by an object that is itself created by a factory and reachable from `AppState`.
   - Module-level and class-level cache decorators on application code are banned.
