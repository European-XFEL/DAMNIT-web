# Handoff

Updated: 2026-07-06

## Current State

**Production deployment is live:** the API + frontend are deployed and reachable
at [https://fwkt-damnit.fz-rossendorf.de/](https://fwkt-damnit.fz-rossendorf.de/),
served via `api/scripts/damnit-api-deploy.sh`/`.ps1` against
`.env.production.example`-derived config, behind the `frontend/nginx` templates,
with LDAP auth against `ldap.fz-rossendorf.de`. Wiring the deployment to a real
ASAPO/Kafka broker (instead of the local harness/emulator) is in progress; see
**Built 2026-07-01** below and [remaining-work-plan.md](../plans/remaining-work-plan.md)
items 2-4.

All integration branches tested and committed. DAMNIT-web-hzdr suite (2026-07-04,
post-merge): `236 passed, 18 skipped` (the 18 skips are environmental — 4 Kafka
broker roundtrip tests needing `KAFKA_TEST_BROKER`, 14 ASAPO sibling-repo tests).

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

## Built 2026-07-06

- **Upstreaming prep (Phase 0/1 groundwork)** — a split-PR plan for contributing
  the generic HZDR components (LDAP auth, runtime-config/terminology, saved views,
  metadata-provider switch) back to XFEL DAMNIT-web, in
  [upstream-pr-plan.md](../plans/upstream-pr-plan.md). It records the divergence
  (195 files vs the `3f38e60` fork point), the current upstream HEAD (`d5a1081`,
  #214), and a trial-merge conflict map (**6 files** conflict — `table.tsx`,
  `graphql/models.py`, `.pre-commit-config.yaml`, root `README.md`,
  `package.json`/`pnpm-lock.yaml`; the big HZDR API files merge cleanly).
  **Phase 1 / C1 + C2 done:** C2 — the fork-only spool + builder-trigger lifespan
  wiring was extracted from `main.py` into `consumer/bootstrap.py` (`spool_lifespan`,
  an async context manager) with a characterization test
  (`tests/test_hzdr_consumer_bootstrap.py`), shrinking `main.py`'s diff against
  upstream to a single `async with`. C1 — the 20 `/metadata/hzdr/*` routes (+ models
  and ~30 helpers) moved verbatim into `metadata/hzdr_routers.py` (`hzdr_router`),
  leaving `routers.py` at just the upstream `/proposal` route; route union verified
  byte-identical to baseline, full suite 290 passed. Docs reorganized — delivered
  plans moved to `docs/plans/done/`.

  *Note:* `scripts/hzdr-local-acceptance.py` currently fails a matcher assertion
  (expects an ambiguous duplicate-shot review event, gets unmatched). Confirmed
  **pre-existing** (fails identically on HEAD before the C1/C2 work) — untriaged,
  likely from the auto-trigger-era `hzdr_nexus.py` matcher change. Worth a look.

## Built 2026-07-04

- **SciCat registration** — the FAIR "one citable dataset per campaign" record.
  New `metadata/scicat.py` (`register_campaign_nexus`, best-effort — never fails
  a build; `read_previous_registration`); a builder post-step (`_register_scicat`
  in `hzdr-hdf5-builder.py`, inside the single-writer lock) `POST`s the built
  NeXus file *path* + assembled scientificMetadata to the `scicat_plugin` HTTP
  service and stamps `scicat_pid`/`version_hash`/`dataset_url`/sha256 into the
  source catalog (flowing back to `payload_ref.scicat_pid`). An unchanged rebuild
  (same NeXus sha256) skips the re-POST — important now that the auto-trigger can
  rebuild frequently. `GET /metadata/hzdr/sources/{key}/scicat` (`HZDRScicatInfo`)
  mirrors the wiki endpoint; a `ScicatCard` sits beside the `WikiCard` on the Link
  Records page. `HZDRScicatSettings` (`DW_API_HZDR_SCICAT__*`; SciCat URL/token
  stay in the plugin's own env). 20 tests in `tests/test_hzdr_scicat.py`;
  end-to-end verified with a real builder run against a mock plugin. Plan in
  `docs/plans/done/scicat-registration-plan.md`.

- **Builder auto-trigger** — closes the last durable-spool gap. New module
  `consumer/builder_trigger.py` (`BuilderTrigger`): each spool consumer's
  `on_new_events_hook` signals a shared, debounced background task that reruns
  `hzdr-hdf5-builder.py` as a subprocess (preserving the single-writer PID lock
  and keeping the HDF5 build off the API event loop). A burst of events coalesces
  into one rebuild; events during a build queue exactly one follow-up. Activated
  by `DW_API_HZDR_BUILDER__ENABLED=true` (`HZDRBuilderSettings`,
  `DW_API_HZDR_BUILDER__*`; `OUTPUT_NEXUS` required). `--events-jsonl` /
  `--trigger-jsonl` inputs are derived from the running ASAPO/Kafka consumers'
  spool paths. Wired into the FastAPI lifespan alongside the consumers.
  11 tests in `tests/test_hzdr_builder_trigger.py` (command assembly, debounce
  coalescing, re-arm, failure resilience, hook dispatch, settings validation);
  end-to-end verified against a real event → NeXus + catalog. Plans for this and
  SciCat registration in `docs/plans/done/auto-builder-trigger-plan.md` and
  `docs/plans/done/scicat-registration-plan.md`.

## Built 2026-07-03/04

- **UI critique + space/usability optimization** — merged to `main` via PR #2
  (`claude/ui-critique-optimization-qs2bof` → `de0cfbc`). Frontend-only,
  behavior-preserving; see [ui-optimization-plan.md](../plans/done/ui-optimization-plan.md)
  for the full WP breakdown and per-WP commit hashes.
  - WP1 (`bbb2ec1`): client-side navigation (react-router `Link`/`useNavigate`
    instead of full-page `<a href>` reloads) + active-route indication and a
    Docs button in `AppHeader`.
  - WP2 (`f453705`): `ShotPage` space optimization — single `SHOT_TABLE_COLUMNS`
    spec (extracted pure helpers into `hzdr/utils/table-view.ts`), viewport-
    relative table height, `lg` 9/3 grid split, compressed source header, and
    per-source view state persisted in `localStorage`
    (`hzdr:shot-table-view:<source_key>`).
  - WP3 (`79352b9`): loading/error feedback on `ShotPage`/`SourceHome`/
    `LinkRecordsPage` fetch paths (skeleton/loader, error `Alert` with retry,
    empty-state text) instead of silently-blank tables.
  - WP4 (`2066409`): `LinkRecordsPage` layout economy — compact stepper, actions
    moved above the draft, full JSON collapsed into a scrollable `DetailsSection`.
- **FWK MediaWiki links + target catalog extras** (`c62c1fc`) — wiki page links
  wired through `hzdr_nexus`/`hzdr_sources`/`routers`; target catalog extras and
  new `DW_API_HZDR_WIKI__*`-adjacent settings; docs in
  [mediawiki-integration.md](../mediawiki-integration.md) and
  [target-ontology.md](../target-ontology.md). Wiki-test fixtures no longer embed
  real secret strings (`13d7641`).
- **Pilot package readiness gate** (`5ec1a85`, `a0edd37`) —
  `scripts/test-pilot-package.ps1` and a `test_contextfile.py` check; the gate
  is documented in [testing.md](testing.md).

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
- **Real-ingestion verification pass** — re-checked the ASAPO/Kafka/LabFrog
  transition against the code rather than prior doc claims.
  `.env.production.example` now documents the real `BROKER_KIND=asapo` +
  `ASAPO_*` settings and `DW_API_HZDR_ASAPO_ACTIVITY__*` (both were missing
  before, so an operator following the template alone could not configure
  the real broker path); `main.py`'s ASAPO consumer startup log no longer
  logs an always-empty `broker_url` when `broker_kind=asapo`. Two gaps found
  but **not yet fixed** — see `integration-roadmap.md`'s 2026-07-01
  verification note: (1) no consumer overrides `on_new_events()`, so the
  builder is never auto-triggered by new spool events, and no cron/timer
  fills that gap either; (2) there is no ASAPO equivalent of
  `test_hzdr_broker_roundtrip.py` — `RealAsapoSpoolConsumer` has only been
  tested against a fake in-process SDK stub.

## Built 2026-06-30

Three derived, read-only operational views for the operator UI (no writes, no
Mongo, no broker consumer group; each degrades safely) — see
[architecture.md §Read-Only Operational Views](../architecture.md#read-only-operational-views).

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
- Suite: **196 passed, 15 skipped** (15 skips are broker integration tests requiring `KAFKA_TEST_BROKER`; there is no ASAPO equivalent yet — see `integration-roadmap.md`'s 2026-07-01 verification pass)

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
   `DW_API_HZDR_SPOOL__BROKER_KIND=asapo` are implemented and now documented
   in `.env.production.example`; what's left is setting the real
   `ASAPO_ENDPOINT`/`BEAMTIME`/`DATA_SOURCE`/`TOKEN` on
   [https://fwkt-damnit.fz-rossendorf.de/](https://fwkt-damnit.fz-rossendorf.de/),
   **writing** an ASAPO real-broker roundtrip test (no equivalent of
   `test_hzdr_broker_roundtrip.py` exists yet for ASAPO), and then running it
   against the live broker.
2a. **Automate the builder trigger** — ✅ **done 2026-07-04**. `on_new_events()`
   now dispatches to a debounced `BuilderTrigger` (`consumer/builder_trigger.py`)
   that reruns `hzdr-hdf5-builder.py` as a subprocess; enable with
   `DW_API_HZDR_BUILDER__ENABLED=true` (+ `OUTPUT_NEXUS`). See
   [auto-builder-trigger-plan.md](../plans/done/auto-builder-trigger-plan.md). Set the
   production builder env on the deployment when pointing at the real brokers.
3. **Capture one real pilot sequence** and run the go-live gate in
   [integration-roadmap.md](integration-roadmap.md).
4. **Standards alignment Phase 0** — lock the `metadata.*` namespace convention;
   see [alignment-implementation-plan.md](../plans/alignment-implementation-plan.md).
5. **SciCat registration** — ✅ **done 2026-07-04**. The builder's post-step now
   `POST`s the campaign NeXus file path to the `scicat_plugin` and stores the
   returned `scicat_pid`; enable with `DW_API_HZDR_SCICAT__ENABLED=true` +
   `PLUGIN_URL`. Surface the plugin's env (SciCat URL/token) on the deployment
   host, not in DAMNIT. See
   [scicat-registration-plan.md](../plans/done/scicat-registration-plan.md); field mapping in
   [standards-alignment.md §3.9](../standards-alignment.md#39-scicat-field-mapping).
6. **Continue the upstream-PR prep** — Phase 1 disentanglement: **C1 + C2 done**;
   next is C3 (split `shared/settings.py` into generic vs HZDR-only), then C4
   (isolate the HZDR route block in `frontend/apps/app/src/app.tsx`), then Phase 0
   (merge fork `main` onto `upstream/main`, resolving the 6-file conflict set — C4
   touches the conflict-prone `table.tsx`, so sequence it there). See
   [upstream-pr-plan.md](../plans/upstream-pr-plan.md).

The canonical model is in [architecture.md](../architecture.md). Avoid adding new
matching logic in producer repositories.
