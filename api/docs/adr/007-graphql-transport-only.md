---
date: 2026-07-08
---

# ADR-007 - GraphQL as a transport layer; per-feature schema contributions

## Context and Problem Statement

GraphQL is the API's primary query surface. Left unmanaged, a GraphQL layer attracts logic that belongs elsewhere: domain serialisation ends up inside type definitions, resolvers accumulate data-access code, and one schema module becomes a central coupling point that imports from the whole codebase.

Two structural questions need stable answers. Who owns the types and resolvers? With vertical slices each feature owns its domain, so its GraphQL surface belongs to that slice, not to a central package ([ADR-000](000-vertical-slice-architecture.md)). What does the composition layer do? Something must assemble the feature contributions into one schema, configure scalars and naming, and bind the schema to the web framework.

A hard external constraint applies. The frontend depends on the public schema: snake_case field names, scalar names, and subscription payload shapes. Internal restructuring must not change that schema.

## Considered Options

- A central `graphql` package that owns all types and resolvers.
- Feature-owned GraphQL surfaces, with the composition layer assembling them.

## Decision Outcome

Chosen option: "feature-owned GraphQL surfaces", because it keeps each slice's GraphQL surface inside the slice and reduces the shared layer to composition.

- Each feature exposes a `gql.py` with its Strawberry types and its `Query`/`Subscription` contributions.
- The composition layer merges those contributions, registers scalars, sets `StrawberryConfig(auto_camel_case=False)`, builds the framework controller, and defines the request `Context`.
- The `Context` is a typed object built from injected dependencies; resolvers reach collaborators only through `info.context`, never module imports.
- Serialisation is a domain concern, not a type concern: it lives in framework-free feature modules, and Strawberry types are thin.
- Resolvers are orchestration only: apply permission classes, fetch through the repository ([ADR-005](005-repository-pattern.md)), convert through serialisation, and raise `DamnitWebError` subclasses ([ADR-001](001-error-classes.md)).

### Consequences

- Good: the composition layer imports features; features never import it back, the narrow exception being type-only `Context` annotations under `TYPE_CHECKING`.
- Good: serialisation is unit-testable without Strawberry, and the GraphQL layer is testable against the CSV repository ([ADR-005](005-repository-pattern.md)).
- Bad: the public schema is frozen, so any change to it is deliberate and coordinated with the frontend.

## Details

Pushing a sub-selection down to the data layer is legitimate resolver logic rather than leaked domain code: shaping a `variables(names:)` selection via `info.selected_fields` is genuinely about the transport. The frozen-schema guard regenerates its snapshot only through an explicit environment flag, so an accidental schema change fails the parity test rather than silently updating the golden file.
