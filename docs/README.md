# HZDR Integration Docs

Documentation for the HZDR fork of DAMNIT-web. Files are grouped by kind:
canonical **reference** docs (data model, standards, NeXus profiles) sit at the
top level; **plans/** holds per-feature execution plans, **status/** the
live status and process docs, and **guides/** the how-to material.

## Current status

Data model, offline integration path, local acceptance test, operator review UI,
and the read-only operational views (curated LabFrog campaign picker, producer
status, flow-monitor Live mode) are implemented and committed. **Production
deployment is live** at
[https://fwkt-damnit.fz-rossendorf.de/](https://fwkt-damnit.fz-rossendorf.de/).
The builder auto-trigger and SciCat registration landed 2026-07-04 (see the
plans below). The real ASAPO SDK spool consumer is implemented
(`RealAsapoSpoolConsumer`) but the deployment isn't yet pointed at live broker
credentials; the `shotcounter` branch is verified but not yet merged to `main`.
Real-broker ingestion end-to-end and the pilot replay remain — see the
[roadmap](status/integration-roadmap.md).

## Start here

| Document | Purpose |
| --- | --- |
| [System overview](system-overview.md) | All seven repositories, the end-to-end data flow, shared contracts, and the end products |
| [Architecture](architecture.md) | Canonical identity, event model, NeXus layout, and system boundaries |

## Reference — data model & standards

| Document | Purpose |
| --- | --- |
| [Event schema](event-schema.md) | The `hzdr-event-v1` transport envelope: fields, constraints, and rationale |
| [Standards alignment](standards-alignment.md) | DAPHNE4NFDI / HELPMI / NeXus / SciCat field cross-walk, gap analysis, and routes |
| [Target ontology](target-ontology.md) | The `metadata.target.*` sub-schema: wiki-curated vs "OTHER" targets, units, provenance, NeXus mapping |
| [NXhzdr_target profile](nxhzdr-target-profile.md) | The `NXhzdr_target` NeXus application-definition profile for target metadata |
| [MediaWiki integration](mediawiki-integration.md) | Read-only campaign-to-wiki link, configuration, and API endpoint |

## Plans — per-feature execution

| Document | Purpose |
| --- | --- |
| [Auto builder-trigger](plans/auto-builder-trigger-plan.md) | Debounced rebuild of the canonical NeXus + catalog after new spool events (✅ done) |
| [SciCat registration](plans/scicat-registration-plan.md) | Register the campaign NeXus file as a citable SciCat dataset (✅ done) |
| [Standards alignment plan](plans/alignment-implementation-plan.md) | Phased execution plan for enacting the standards alignment |
| [Deployment plan](plans/deployment-plan.md) | Wiring the Kafka and ASAPO spool consumers into the running server |
| [Remaining work](plans/remaining-work-plan.md) | Next-steps playbook for open items with ordered recommendations |
| [UI optimization](plans/ui-optimization-plan.md) | Operator-UI space/usability critique and the WP1–WP4 plan (merged, PR #2) |

## Status & process

| Document | Purpose |
| --- | --- |
| [Roadmap](status/integration-roadmap.md) | Per-repository status table and ordered work items through go-live |
| [Protocol status](status/protocol-status.md) | Per-source / per-repo done-vs-outstanding matrix for all four data-transfer paths |
| [Testing](status/testing.md) | Verified coverage and remaining acceptance tests |
| [Handoff](status/handoff.md) | Short current-state snapshot for the next session |

## Guides

| Document | Purpose |
| --- | --- |
| [Local development](guides/local-development.md) | Minimal build, test, and launch commands |

Package-specific reference remains in `api/docs` and `frontend/README.md`.
