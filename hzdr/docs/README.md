# HZDR Integration Docs

Documentation for the HZDR fork of DAMNIT-web. Files are grouped by kind:
canonical **reference** docs (data model, standards, NeXus profiles) sit at the
top level; **plans/** holds per-feature execution plans, **status/** the
live status and process docs, and **guides/** the how-to material.

## Current status

Data model, offline integration path, local acceptance test, operator review UI,
and the read-only operational views are implemented and committed. Deployment
state is not kept here: the HZDR combo repository's `integration-status.json` is
the single record. As of 2026-10-03 it lists the API and frontend running at
[https://fwkt-damnit.fz-rossendorf.de/](https://fwkt-damnit.fz-rossendorf.de/)
with the Kafka spool consumer and builder auto-trigger enabled (I2), and SciCat
registration running (I12). Still open there: the deployment-broker
restart/replay pass (I5), SciCat replay suppression (I7), and the shotcounter
branch merge (I3). See the [roadmap](status/integration-roadmap.md) and short
[handoff](status/handoff.md) for the work behind them.

## Start here

| Document | Purpose |
| --- | --- |
| [System overview](system-overview.md) | The seven pilot-runtime repositories, the end-to-end data flow, shared contracts, and the end products |
| [Architecture](architecture.md) | Canonical identity, event model, NeXus layout, and system boundaries |
| [Screenshots](screenshots.md) | Current UI: home, shot table, context builder, review matches (stale capture), in-app docs, flow monitor |
| [User guide](guides/user-guide.md) | Find a campaign, inspect shots, and resolve review cases |

## Reference — data model & standards

| Document | Purpose |
| --- | --- |
| [Event schema](event-schema.md) | The `hzdr-event-v1` transport envelope: fields, constraints, and rationale |
| [Standards alignment](standards-alignment.md) | DAPHNE4NFDI / HELPMI / NeXus / SciCat field cross-walk, gap analysis, and routes |
| [Target ontology](target-ontology.md) | The `metadata.target.*` sub-schema: wiki-curated vs "OTHER" targets, units, provenance, NeXus mapping |
| [NXhzdr_target profile](nxhzdr-target-profile.md) | The `NXhzdr_target` NeXus application-definition profile: target map, versioning rule, compatibility contract |
| [NeXus semantic maps](nexus-semantic-maps.md) | The `laser.*` / `vacuum.*` / `diagnostic.*` maps onto `NXsource`/`NXbeam`/`NXenvironment`/`NXdetector`, covered by the NXDL since profile v0.6 |
| [openPMD linking](openpmd-linking.md) | The `metadata.simulation` link object for referencing PIC/openPMD simulation output per shot |
| [MediaWiki integration](mediawiki-integration.md) | Read-only campaign-to-wiki link, configuration, and API endpoint |

## Plans — active

The first four plans were reviewed on 2026-07-23 and remain active because
each has open human, deployment, producer, or upstreaming gates; the openPMD
projection plan was added 2026-08-31; Phases 1-4 are merged (2026-09-04) and
only Phase 5 (deployment evidence) remains.

| Document | Purpose |
| --- | --- |
| [Upstream PR plan](plans/upstream-pr-plan.md) | Split-PR strategy for contributing generic HZDR components back to XFEL DAMNIT-web |
| [Deployment plan](plans/deployment-plan.md) | Wiring the Kafka and ASAPO spool consumers into the running server |
| [Standards alignment plan](plans/alignment-implementation-plan.md) | Phased execution plan for enacting the standards alignment |
| [Remaining work](plans/remaining-work-plan.md) | Next-steps playbook for open items with ordered recommendations |
| [Campaign output](plans/campaign-output-plan.md) | Target end product: NeXus master plus linked per-shot containers built by the builder; shot-aligner is the interim answer and the test reference |
| [Container writer](plans/container-writer.md) | Campaign output phase 3: how the worker turns a shot's events into `shots/<date>_<number>.nxs` outside the campaign lock |
| [openPMD projection](plans/openpmd-projection-plan.md) | DAMNIT's slice of the multi-source openPMD companion: canonical path inventory, synthetic fixture, projection preflight |

## Plans — delivered (`plans/done/`)

Shipped features, kept for the design rationale and history.

| Document | Purpose |
| --- | --- |
| [Auto builder-trigger](plans/done/auto-builder-trigger-plan.md) | Debounced rebuild of the canonical NeXus + catalog after new spool events (✅ done) |
| [SciCat registration](plans/done/scicat-registration-plan.md) | Register the campaign NeXus file as a citable SciCat dataset (✅ done) |
| [UI optimization](plans/done/ui-optimization-plan.md) | Operator-UI space/usability critique and the WP1–WP4 plan (✅ merged, PR #2) |

## Status & process

| Document | Purpose |
| --- | --- |
| [Roadmap](status/integration-roadmap.md) | Per-repository status table and ordered work items through go-live |
| [Protocol status](status/protocol-status.md) | Per-source / per-repo done-vs-outstanding matrix for all four data-transfer paths |
| [Testing](status/testing.md) | Verified coverage and remaining acceptance tests |
| [Handoff](status/handoff.md) | Short current-state snapshot for the next session |
| [Next on the server](guides/next-on-server.md) | The open server work on fwkt-webapps: one script (`hzdr/scripts/next-on-server.sh`) plus what needs a person |

## Guides

| Document | Purpose |
| --- | --- |
| [Local development](guides/local-development.md) | Minimal build, test, and launch commands |
| [User guide](guides/user-guide.md) | Short operator path through the live campaign pages |

Package-specific reference remains in `api/docs` and `frontend/README.md`.
