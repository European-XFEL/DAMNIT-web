---
date: 2026-07-08
---

# ADR-008 - Local mode via composition, not conditionals

## Context and Problem Statement

The API supports a local development mode (`--path <damnit-dir>` / `DW_API_DAMNIT_PATH`): no OAuth, no MyMdC, a synthetic development user, and a single fixed proposal directory instead of GPFS discovery.

A mode can be implemented in two ways. One branches on `settings.is_local` at every affected call site. The other selects implementations once, at composition time. Scattered branching means every new code path must remember both modes, local behaviour is defined piecemeal, and the two modes can drift apart silently. Selecting implementations once means local behaviour is defined in one reviewable place, and both modes share the same interfaces by construction.

## Considered Options

- Branch on `settings.is_local` at each affected call site.
- Select implementations once, in the composition root.

## Decision Outcome

Chosen option: "select implementations once, in the composition root", because it keeps local behaviour in one place and makes the two modes share interfaces by construction.

- `settings.is_local` is read only in the composition root (`main.py` / `state.py`) and in the `Settings` property that defines it ([ADR-003](003-injected-settings.md)).
- It selects implementations: a path locator ([ADR-004](004-proposal-path-locator.md)), a MyMdC client, an auth controller, and a store backend.
- Feature code depends on the selected collaborator through injection, never on the mode.

### Consequences

- Good: adding a code path cannot silently break local mode, because there is no second branch to forget.
- Good: local and production can differ only in implementation, never in interface shape; each collaborator is independently testable and tests get the local composition for free.
- Bad: a few more small interfaces exist (user provider, authorisation policy, proposals provider) rather than inline conditionals.

## Details

The composition maps each mode-dependent concern to a production and a local implementation. Some concerns are still branched inline rather than composed.

| Concern | Production | Local |
|---|---|---|
| Proposal path resolution | GPFS path locator ([ADR-004](004-proposal-path-locator.md)) | fixed path locator for the given directory |
| MyMdC | HTTP client | mock client synthesising the single local proposal |
| Auth routes | OAuth controller | no-auth controller |
| Current user | session-derived user info | synthetic development user |
| Authorisation | proposal-membership policy | allow-all policy |
| Proposal metadata | MyMdC fetch plus app-DB cache | synthetic metadata for the local directory |
| Stores | file-backed | in-memory |
