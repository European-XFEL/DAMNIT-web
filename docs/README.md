# HZDR Integration Docs

Current status: data model, offline integration path, local acceptance test,
and operator review UI are implemented and committed. Branches in `shotcounter`
and `labfrog` are verified but not yet merged. Production broker ingestion and
the real pilot replay remain.

| Document | Purpose |
| --- | --- |
| [System overview](system-overview.md) | Start here: all seven repositories, the end-to-end data flow, shared contracts, and the end products |
| [Architecture](architecture.md) | Canonical identity, event model, NeXus layout, and system boundaries |
| [Roadmap](integration-roadmap.md) | Per-repository status table and ordered work items through go-live |
| [Testing](testing.md) | Verified coverage and remaining acceptance tests |
| [Local development](local-development.md) | Minimal build, test, and launch commands |
| [Handoff](handoff.md) | Short current-state snapshot for the next session |

Package-specific reference remains in `api/docs` and `frontend/README.md`.
