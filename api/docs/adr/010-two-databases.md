---
date: 2026-07-08
---

# ADR-010 - Two databases: application DB vs per-proposal DAMNIT DBs

## Context and Problem Statement

The API touches two databases with different owners and lifecycles.

Per-proposal DAMNIT databases (`{proposal_dir}/{damnit_subdir}/runs.sqlite`) are external. One file exists per proposal, on GPFS, written by the DAMNIT listener. The API reflects their schema at runtime and treats them as read-only.

The application database (`dw_api.sqlite`) is owned by this service. Its schema and lifecycle are ours to control, and it is the only database this service writes to.

Nothing structurally prevents application code from wiring the two together through a shared, generic `db.py`/`get_session` pair, which would let a query meant for one database silently run against the other.

## Considered Options

- Structural separation: disjoint packages, entry points, and names per database.
- A generic shared DB layer (one `db.py`, one `get_session`) serving both.
- Convention and documentation only.

## Decision Outcome

Chosen option: "structural separation", because the two stacks get disjoint entry points and distinct types, so the wrong-database mistake cannot compile.

`appdb`-owned code (`state.py`, `main.py`'s `SQLAlchemyAsyncConfig`, `metadata/repository.py`) is the only writer of `dw_api.sqlite`. `runs/` repositories ([ADR-005](005-repository-pattern.md)) remain the only reader of DAMNIT proposal databases. The naming convention is fixed: "app DB" always means `dw_api.sqlite`; "DAMNIT DB" or "proposal DB" always means a `runs.sqlite`.

### Consequences

- Good: the wrong-database failure mode disappears structurally instead of by discipline.
- Good: the app DB's engine/session lifecycle has one home (`main.py`'s `SQLAlchemyPlugin`), so a future second config (a shared or Postgres backend) has a clear place to slot in without disturbing `runs/`.
- Bad: there are two parallel data-access stacks, with no shared session helper by design.

## Details

Possible future: a move to Postgres for the app DB would also make `LISTEN/NOTIFY` available as a push publisher for run-update subscriptions - see [ADR-009](009-channels-subscriptions.md)'s publisher selection.
