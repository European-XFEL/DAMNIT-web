# HZDR Integration Docs

Current status: data model, offline integration path, local acceptance test,
operator review UI, and the read-only operational views (curated LabFrog
campaign picker, producer status, and the flow monitor's Live mode) are
implemented and committed. The `shotcounter` branch is verified but not yet
merged to `main`; every other repo's integration work is merged to its default
branch. **Production deployment is live** at
[https://fwkt-damnit.fz-rossendorf.de/](https://fwkt-damnit.fz-rossendorf.de/);
the real ASAPO SDK spool consumer is implemented (`RealAsapoSpoolConsumer`)
but the deployment isn't yet pointed at live broker credentials. Real broker
ingestion end-to-end and the pilot replay remain.

| Document | Purpose |
| --- | --- |
| [System overview](system-overview.md) | Start here: all seven repositories, the end-to-end data flow, shared contracts, and the end products |
| [Architecture](architecture.md) | Canonical identity, event model, NeXus layout, and system boundaries |
| [Event schema](event-schema.md) | The `hzdr-event-v1` transport envelope: fields, constraints, and rationale |
| [MediaWiki integration](mediawiki-integration.md) | Read-only campaign-to-wiki link, configuration, and API endpoint |
| [Standards alignment](standards-alignment.md) | DAPHNE4NFDI / HELPMI / NeXus / SciCat field cross-walk, gap analysis, and routes |
| [Target ontology](target-ontology.md) | The `metadata.target.*` sub-schema: wiki-curated vs "OTHER" targets, units, provenance, NeXus mapping |
| [Alignment implementation plan](alignment-implementation-plan.md) | Phased execution plan for enacting the standards alignment |
| [Protocol status](protocol-status.md) | Per-source / per-repo done-vs-outstanding matrix for all four data-transfer paths |
| [Roadmap](integration-roadmap.md) | Per-repository status table and ordered work items through go-live |
| [Remaining work](remaining-work-plan.md) | Next-steps playbook for open items with ordered recommendations |
| [Deployment plan](deployment-plan.md) | Wiring the Kafka and ASAPO spool consumers into the running server |
| [Testing](testing.md) | Verified coverage and remaining acceptance tests |
| [Local development](local-development.md) | Minimal build, test, and launch commands |
| [Handoff](handoff.md) | Short current-state snapshot for the next session |

Package-specific reference remains in `api/docs` and `frontend/README.md`.
