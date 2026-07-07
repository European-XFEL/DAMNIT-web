---
date: 2026-06-29
---

# ADR-000 - Package architecture: vertical feature slices with enforced boundaries

## Context and Problem Statement

The API backend in its current state ([2026-06-16](https://github.com/European-XFEL/DAMNIT-web/tree/f63f49564b195a2546f8ba6ee6ff0388603eba93)) is difficult to reason about as behaviour is spread across modules, singletons, and import-time side effects, with features split between generic modules (`shared/`, `utils.py`, a monolithic `graphql/`) rather than owned in one place. Modules import each other in unexpected ways, and a change to one feature often requires touching several unrelated modules.

To try and improve this, we decided to formally define the architecture of the project, targeting a specific package layout, and defining some rules and best practices.

## Considered Options

- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) / [Onion Architecture](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) - dependency-inverted layering around a domain core
- [Domain-Driven Design (tactical patterns)](https://martinfowler.com/bliki/DomainDrivenDesign.html) - application services, aggregates, domain events
- [Hexagonal Architecture (Ports and Adapters)](https://alistair.cockburn.us/hexagonal-architecture/) - isolate the application core from external systems behind ports, with swappable adapters
- [Layered architecture](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) - horizontal technical layers (`api/services/domain/infrastructure`)
- [Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/) - organise by feature; each slice owns everything from transport binding down to data access

## Decision Outcome

Chosen option: a combination of **Vertical Slice Architecture** and **Ports and Adapters**.

Slices give change-locality, a feature change touches one directory, and a reviewer can hold a slice in their head. Ports are applied only at the I/O boundaries (the external DAMNIT databases, MyMdC, auth, etc...), where swappability is useful (e.g. local dev vs. production, potential use at other facilities).

The dependency-direction rules that layering-style architectures enforce through folder structure can instead be enforced by a linter (e.g. import linter).

Full layering, Clean/Onion, and DDD, were rejected as they add a lot of boilerplate/abstraction/overhead to the codebase which is (at least currently) not needed, as the API server is a relatively thin, read-mostly viewer over externally-owned data, so patterns like aggregates, domain events, and use-case classes solve problems this service doesn't have.

### Consequences

- Good: a feature change touches one directory; PRs map to slices.
- Good: new domains get a package with a standard internal shape (`models`, `services`, `routers`/`gql`, `dependencies`), so structure decisions don't recur per feature.
- Good: once import linting lands, contract changes (a new allowed edge) become deliberate, reviewed edits to the linter config rather than drive-by imports.
- Bad: the layout alone guarantees nothing, developers have to ensure that they follow the architecture (although an import linter can be added to enforce the rules).

## Details

### Target layout

```text
damnit_api/
├── main.py          # entrypoint: env/args → Settings → create_app
├── app.py           # composition root: create_app(settings), lifespan,
│                    #   DI wiring, exception handlers, middleware
├── state.py         # AppState + factories (no domain classes)
├── settings.py      # Settings models only
├── logging.py       # structlog configuration + request-logging middleware
│
├── core/            # framework-free, imports nothing app-specific:
│   ├── errors.py    #   Shared error types
│   ├── types.py     #   `ProposalNumber`, pure value types (no I/O)
│   ├── const.py     #   DamnitType etc.
│   └── conversions.py  # b64image, blob2numpy, type mapping
│
├── proposals/       # proposal identity, metadata, discovery
│   ├── models.py    #   `ProposalMeta` + domain models
│   ├── services.py  #   fetch/cache/upsert proposal metadata (auth-free)
│   ├── locator.py   #   `ProposalPathLocator` implementations
│   ├── routers.py
│   └── gql.py
│
├── runs/            # the core domain: runs, variables, previews
│   ├── models.py    #   plain dataclasses
│   ├── repository.py
│   ├── serialization.py, preview.py
│   └── gql.py       #   Strawberry types + Query/Subscription contributions
│
├── auth/            # OIDC flow, sessions, tokens, users, authz policy
├── contextfile/     # context-file (REST) endpoints
├── mymdc/           # MyMdC port
├── appdb/           # application-DB engine/session/models
│
└── graphql/         # transport composition:
    ├── schema.py    #   assemble Query/Subscription from feature gql modules
    └── directives.py
```

### Naming rules

- No `_underscore` package names: the prefix tracks no real boundary - a package is internal because nothing outside imports it, which import linting can enforce. (This is why `_db/` and `_mymdc/` become `appdb/` and `mymdc/`.)
- No generic junk-drawer modules (`shared/`, `utils.py`): code either belongs to a feature slice, to `core/` (framework-free, shared), or to infrastructure.

### Dependency Direction

- `core` imports nothing from the application.
- Feature packages (`runs`, `proposals`, `auth`, `contextfile`) may import `core` and infrastructure (`mymdc`, `appdb`), never each other's internals. Allowed cross-feature edges are explicit and narrow: `auth → proposals` (membership needs proposal metadata) - never the reverse.
- Infrastructure (`mymdc`, `appdb`) imports only `core` and `settings`.
- `graphql/schema.py` and `app.py` may import everything (composition).
- Domain and service modules never import Litestar or Strawberry; framework types appear only in `routers.py`, `gql.py`, `dependencies.py`, and permission classes.
- Private (`_`-prefixed) functions are module-internal. Anything imported across module boundaries is public API and named accordingly.
- Function-body imports are allowed only in the composition root and for documented, cycle-free lazy loading.

### Follow-up / TODOs

- Import linting
- `appdb` naming
