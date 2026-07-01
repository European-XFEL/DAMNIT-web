# Handoff

Updated: 2026-07-01

## Current State

**Production deployment is live:** the API + frontend are deployed and reachable
at [https://fwkt-damnit.fz-rossendorf.de/](https://fwkt-damnit.fz-rossendorf.de/),
served via `api/scripts/damnit-api-deploy.sh`/`.ps1` against
`.env.production.example`-derived config, behind the `frontend/nginx` templates,
with LDAP auth against `ldap.fz-rossendorf.de`. Wiring the deployment to a real
ASAPO/Kafka broker (instead of the local harness/emulator) is in progress; see
**Built 2026-07-01** below and [remaining-work-plan.md](remaining-work-plan.md)
items 2-4.

All integration branches tested and committed. DAMNIT-web-hzdr suite:
`213 passed, 4 skipped`.

- **DAMNIT-web-hzdr** (`main`): canonical `HZDREventV1` model; atomic catalog
  writes; single-writer builder lock; ambiguous/unmatched events in API; real
  Confirm Matches UI; local acceptance script; shared example payloads and
  anonymized SQLite fixture; `hzdr_sources.review.jsonl` sidecar (confirm/dismiss
  survives rebuilds, `VERIFIED > REVIEWED > BASE`); `normalize_processed_trigger_message`
  accepts both the legacy `processed_message` wrapper and the flat `hzdr-event-v1`
  Kafka envelope that shotcounter emits; `scripts/test-all.ps1` cross-repo test
  runner (all six suites in one command, `-WithAcceptance` flag for local
  acceptance script).
- **labfrog** (`develop`): `experiment_id` derived from MediaWiki campaign
  choice; UTC timezone fields — `feature/open-sqlite-explorer` merged to
  `develop` (default branch).
- **labfrog-sqlite-tools-repo** (`main`): `experiment_id` plumbed through
  SQLite schema, migrations, transform, export, and NeXus writer.
- **shotcounter** (`feature/hzdr-canonical-trigger-event`): canonical
  `hzdr-event-v1` Kafka envelope, `TriggerRole`, operator-configurable
  `ShotNumber` with debounce — 24/24 tests pass, not yet merged to main.
- **planet-watchdog** (`master`, the DAQ-File-Watchdog producer): normalized Kafka/HZDR event builder committed;
  `kafka_output.py` correctly copies `topic/partition/offset` into `payload_ref`.
- **asapo-for-hzdr-damnit** (`main`): local harness proves correct
  claim/flush/ack/dedup pattern; example files use canonical `hzdr-event-v1`
  schema-version string. All committed.

## Built 2026-07-01

- **Production deployment live** at
  [https://fwkt-damnit.fz-rossendorf.de/](https://fwkt-damnit.fz-rossendorf.de/).
  `api/scripts/damnit-api-deploy.sh` (bash) added alongside the existing
  `.ps1`, with safer env-file/host/port/worker-count checks; `frontend/nginx`
  templates gained proxy config for the app and frontend hosts;
  `scripts/hzdr-launch.config.json` updated for the deployment.
- **LDAP fixed for the real HZDR/FZR directory** — `.env.production.example`
  now points at `ldaps://ldap.fz-rossendorf.de:636` with the actual
  `ou=users,ou=FZR-NIS,ou=it,o=FSR,dc=de` bind DN / search base (previously a
  placeholder `dc=hzdr,dc=de` tree). `LDAPSettings` gained `validate_cert`,
  `ca_cert_file`, and `start_tls` for the department's 2026 encrypted-LDAP
  migration (ldaps:// on 636, or ldap:// on 389 with StartTLS). Note: this
  repo's `LDAPSettings` has no group-membership gate (LabFrog's `cn=fwt`
  restriction is not enforced here) — anyone who binds successfully can log in.
- **Real ASAPO SDK consumer implemented** — `consumer/asapo.py` gained
  `RealAsapoSpoolConsumer`, which drives the DESY `asapo_consumer` SDK
  (`create_consumer(...)`) through the same claim→write-fsync→ack→dedup loop
  as the harness-HTTP `AsapoSpoolConsumer`. Selected via the new
  `DW_API_HZDR_SPOOL__BROKER_KIND` setting (`http` default, or `asapo`), with
  `DW_API_HZDR_SPOOL__ASAPO_ENDPOINT/BEAMTIME/DATA_SOURCE/TOKEN/STREAM/...`
  validated by a new `HZDRSpoolSettings` model validator when
  `broker_kind=asapo`. This closes most of roadmap item 3 (ASAPO SDK swap,
  previously 🔴) — what remains is a live-broker gated integration test and
  the real restart/replay pass (roadmap item 7 / remaining-work-plan item 4).
  New tests added to `test_hzdr_spool.py`.
- The Kafka spool consumer (`consumer/kafka.py`) was already talking to a real
  `kafka-python-ng` broker (unchanged this session) — real-broker wiring was
  ASAPO-specific.
- `motor` added as a dependency (async MongoDB driver) for the `mongo`
  metadata provider path.
- `metadata/services.py` — an empty/`"none"` DAMNIT path now resolves to
  `None` rather than a literal `"none"` string, for local dev.

## Built 2026-06-30

Three derived, read-only operational views for the operator UI (no writes, no
Mongo, no broker consumer group; each degrades safely) — see
[architecture.md §Read-Only Operational Views](architecture.md#read-only-operational-views).

- `metadata/labfrog_sqlite.py` — read-only (`mode=ro`) reader for the curated
  LabFrog campaign SQLite snapshots; `list_campaigns` / `list_campaign_shots`.
  New setting `DW_API_METADATA__LABFROG_CURATED_DIR`. Routers:
  `GET /metadata/hzdr/campaigns` and `.../{campaign_key}/shots`. Backs the Link
  Records campaign picker.
- `metadata/producer_status.py` — derives DAQ File Watchdog hosts + Shotcounter
  `absent`/`active`/`idle` status from events already on a source.
  Router: `GET /metadata/hzdr/sources/{key}/producer-status`.
- `shared/flow_activity.py` — Kafka offset counts + spool JSONL line counts +
  optional ASAPO stream sizes for the flow monitor's Live mode. New settings
  `DW_API_HZDR_ASAPO_ACTIVITY__*` (token is a `SecretStr`). Router:
  `GET /config/flow-activity`.
- Frontend: `LinkRecordsPage` (curated campaign picker) and `FlowMonitorPage`
  (Live mode) wired to the above; `types.ts` + `utils/link-records.ts` extended.
- Tests: `test_hzdr_labfrog_sqlite.py`, `test_hzdr_producer_status.py`,
  `test_hzdr_flow_activity.py`. Suite **213 passed, 4 skipped**.
- `ruff.toml` — `flake8-type-checking` `runtime-evaluated-base-classes`
  includes `pydantic.BaseModel` (Path/Iterable model fields stay runtime imports).

## Built 2026-06-26

- `shared/settings.py` — `HZDRWikiSettings` (`DW_API_HZDR_WIKI__BASE_URL`, `DW_API_HZDR_WIKI__FETCH_TIMEOUT`)
- `metadata/hzdr_sources.py` — `HZDRWikiInfo` response model; `get_shot_by_key` / `get_shot_detail_by_key` / `_shot_detail` on `HZDRSourceProvider`
- `metadata/routers.py` — `GET /metadata/hzdr/sources/{key}/wiki` and `?fetch=true` (live MediaWiki Action API call); `_fetch_wiki_page_info` helper
- `api/tests/test_hzdr_wiki.py` — 10 new tests (URL derivation, unconfigured wiki, explicit override, fallback to source_key, 404, async fetch mock, missing-page flag, network error, `fetch=true` param, settings defaults)
- `docs/` — split into focused docs: `event-schema.md`, `mediawiki-integration.md`, `standards-alignment.md`, `alignment-implementation-plan.md`; README index updated
- Suite: **196 passed, 15 skipped** (15 skips are broker integration tests requiring `KAFKA_TEST_BROKER` / `ASAPO_TEST_BROKER`)

## Built 2026-06-22/23

- **Frontend restructured** — HZDR-specific UI moved from monolithic `app.tsx` into `apps/app/src/hzdr/` subfolders: `pages/` (ShotPage, LinkRecordsPage, FlowMonitorPage, ContextBuilderPage, DocsPage, SourceHome), `components/` (ShotTable, FlowDiagram, AppHeader, previews), `utils/`, `types.ts`, `hooks.ts`
- **Saved views sidecar** — `hzdr_sources.views.json` persists durable UI table views (column visibility, sorting, filters) alongside `hzdr_sources.json`; managed via `GET/POST/DELETE /metadata/hzdr/views`; the review sidecar (`hzdr_sources.review.jsonl`) remains separate and builder-owned
- `shared/routers.py` — guard `settings.auth is None` before accessing `auth.mode` / `auth.ldap` (allows auth-disabled local mode without crashing `GET /config/runtime`)
- `scripts/test-all.sh` — bash equivalent of `test-all.ps1` for Linux CI

## Built 2026-06-18

- `api/src/damnit_api/consumer/spool.py` — `HZDRSpoolConsumer` base + `SpoolConfig`; claim→write-fsync→ack→dedup loop
- `api/src/damnit_api/consumer/asapo.py` — `AsapoSpoolConsumer`; talks to harness HTTP API and real ASAPO broker alike; activated by `DW_API_HZDR_SPOOL__ENABLED=true`
- `shared/settings.py` — `HZDRSpoolSettings` (`DW_API_HZDR_SPOOL__*`) and `HZDRHealthSettings` (`DW_API_HZDR_HEALTH__*`)
- `main.py` — lifespan wires spool consumer as background asyncio task when enabled
- `shared/routers.py` — `GET /config/health` returns `FlowMonitorHealth` with async ASAPO/Kafka/Mongo probes (2 s timeout each)
- `api/.env.production.example` — full production env template
- `scripts/damnit-api.service` — systemd unit template
- `api/tests/test_hzdr_spool.py` — 11 new tests (unit + integration against live harness broker)

## Start Next

1. **Merge `shotcounter` branch** — gate is one manual Kafka smoke test with
   `KafkaEnabled=1` against a local broker, plus confirming `IsShotCounterXX`
   defaults for production.
2. **Point the deployed API at the real ASAPO/Kafka brokers** —
   `RealAsapoSpoolConsumer` (`consumer/asapo.py`) and
   `DW_API_HZDR_SPOOL__BROKER_KIND=asapo` are implemented; what's left is
   setting the real `ASAPO_ENDPOINT`/`BEAMTIME`/`DATA_SOURCE`/`TOKEN` on
   [https://fwkt-damnit.fz-rossendorf.de/](https://fwkt-damnit.fz-rossendorf.de/)
   and running the gated integration test against the live broker.
3. **Capture one real pilot sequence** and run the go-live gate in
   [integration-roadmap.md](integration-roadmap.md).
4. **Standards alignment Phase 0** — lock the `metadata.*` namespace convention;
   see [alignment-implementation-plan.md](alignment-implementation-plan.md).
5. **SciCat registration** — wire up the existing `scicat_plugin` (an HTTP
   service: builder `POST`s the campaign NeXus file path to `/scicat/from-json`
   or `/scicat/push` and stores the returned `scicat_pid`). Interface and steps
   in [integration-roadmap.md §SciCat Registration](integration-roadmap.md#scicat-registration);
   field mapping in [standards-alignment.md §3.9](standards-alignment.md#39-scicat-field-mapping).

The canonical model is in [architecture.md](architecture.md). Avoid adding new
matching logic in producer repositories.
