---
date: 2026-07-08
---

# ADR-011 - Authorisation at the edge

## Context and Problem Statement

Proposal-membership authorisation was scattered and pointed the wrong way. The single predicate lived in `metadata/services.py` (`_check_user_allowed`), and the metadata services called it inline before each operation. The GraphQL permission classes reached into that same private function - an `auth`-to-`metadata` import which, together with `metadata` importing `auth` for the `User` type, formed a dependency cycle that [ADR-000](000-vertical-slice-architecture.md) forbids (`metadata -> auth`).

Domain services performing authorisation also couples them to the request. A service can then only be called where a `User` is in scope, and the same check runs redundantly at the resolver and in the service.

Separately, an unauthenticated GraphQL request produced a 500 rather than a 401.

## Considered Options

- One policy in `auth/`, enforced only at the transport edges.
- Keep the check inline in the domain services.
- A single global authorisation middleware.

## Decision Outcome

Chosen option: "one policy in `auth/`, enforced at the edges", because it gives the membership decision a single home in the slice that owns identity and leaves the domain services authorisation-free.

`auth/policy.py` owns `require_proposal_member(user, proposal_number)`. Enforcement happens only at the edges: Strawberry permission classes for GraphQL fields, and a Litestar guard (`proposal_member_guard`) wired onto the proposal-scoped REST routers in the composition root. Local mode composes the guard out ([ADR-008](008-local-mode-composition.md)). The permission classes live in `shared/permissions.py` as transport adapters over the policy, so any slice's GraphQL contribution can attach them without importing `auth`. Domain services take plain parameters.

Authentication failures now raise `UnauthenticatedError`, which the error handler renders as a 401.

### Consequences

- Good: domain services are reusable and context-agnostic; the `auth <-> metadata` cycle is broken.
- Good: authorisation has one auditable choke point per transport.
- Bad: two edge mechanisms - the GraphQL permission classes and the REST guard - must stay in step.
- Bad: the permission adapters put Strawberry types in `shared/`, which is otherwise framework-light.

## Details

Authentication (OIDC on server-side sessions) is unchanged; it is covered by the framework and session decisions in [ADR-006](006-litestar.md). This decision concerns authorisation and the authentication *edge*, the 401.

The adapters live in `shared/permissions.py` rather than the `graphql/` transport package so that a slice depends only on `shared`, which is always an allowed direction, and never on the composition/transport package. The policy predicate stays in `auth/` because membership is identity: `auth -> proposals`/`metadata` is the one allowed cross-slice edge ([ADR-000](000-vertical-slice-architecture.md)), and `auth/policy.py` itself needs no `metadata` import.

The 401 is a clean JSON body, not a redirect. A GraphQL request is an XHR call, so the single-page app performs the login redirect on a 401 rather than following a server redirect to the login page.
