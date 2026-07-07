# Integration Roadmap

Updated: 2026-07-03

**2026-07-01:** production deployment is live at
[https://fwkt-damnit.fz-rossendorf.de/](https://fwkt-damnit.fz-rossendorf.de/);
see `hzdr/docs/status/handoff.md` §Built 2026-07-01. The ASAPO SDK swap (Work Order step 3
below / `asapo-for-hzdr-damnit` §"Carry claim/flush/ack/replay-dedup pattern
into real ASAPO SDK consumer") is now code-complete via
`RealAsapoSpoolConsumer`; wiring the deployment's real broker credentials and
the gated integration test are what remain.

**2026-07-02:** large-array externalisation is now implemented in DAMNIT's
`RealAsapoSpoolConsumer`: oversized inline `values` are removed before spooling,
and `payload_ref.uri` is populated with a replayable ASAPO message URI. The
builder-side 64 KiB / item-count guard remains in place as a backstop for other
producer paths; the separate sidecar/producers should emit the URI directly for
real LaserData rollout.

**2026-07-03:** the offline/local pilot package gate is now committed and green:
`hzdr/scripts/test-pilot-package.ps1 -NoCoverage` validates sibling repo presence,
git-state visibility, shared contract/topic sync, pilot env/config, and the
selected DAMNIT, LabFrog, LabFrog SQLite tools, DAQ File Watchdog, and
shotcounter suites. ASAPO remains excluded for the Kafka pilot; the live broker
`-DockerTests` pass is still a deployment gate.

**2026-07-01 (verification pass):** re-checked the "real data ingestion"
transition against the actual code (not just prior doc claims). Three
concrete gaps found, two fixed on the spot:

1. **Builder is never auto-triggered by a spool consumer** — `on_new_events()`
   in `consumer/spool.py` is a documented no-op stub; no subclass
   (`AsapoSpoolConsumer`, `RealAsapoSpoolConsumer`, `KafkaSpoolConsumer`)
   overrides it, and no cron/systemd-timer unit for `hzdr-hdf5-builder.py`
   exists anywhere in the repo. New real events land in the spool but the
   canonical NeXus/catalog will not reflect them until someone runs the
   builder. ✅ **closed 2026-07-04** — `consumer/builder_trigger.py`
   (`BuilderTrigger`) now overrides the `on_new_events()` dispatch and reruns
   the builder as a debounced subprocess; `DW_API_HZDR_BUILDER__ENABLED=true`.
   See `hzdr/docs/plans/done/auto-builder-trigger-plan.md`.
2. **No real-broker roundtrip test exists for ASAPO** — only Kafka has one
   (`test_hzdr_broker_roundtrip.py`, `-m integration_docker`, gated on
   `KAFKA_TEST_BROKER`). `RealAsapoSpoolConsumer` is exercised only against an
   in-process fake SDK stub in `test_hzdr_spool.py`. `hzdr/docs/status/handoff.md`'s
   2026-06-26 note about `ASAPO_TEST_BROKER`-gated skips does not correspond
   to anything in the current code — no such env var or test exists. 🔴 still
   open.
3. **`.env.production.example` didn't document the real ASAPO SDK path** —
   it only showed `DW_API_HZDR_SPOOL__BROKER_URL` (harness/HTTP transport),
   never `BROKER_KIND=asapo` + `ASAPO_ENDPOINT/BEAMTIME/DATA_SOURCE/TOKEN/...`,
   nor the `DW_API_HZDR_ASAPO_ACTIVITY__*` settings the flow-monitor Live view
   needs. ✅ **fixed this pass** — the template now documents both transports
   and the activity-probe settings. A cosmetic startup-log bug (`main.py`
   always logged `broker_url`, which is empty in `asapo` mode) was fixed
   alongside it.

## Status Key

- ✅ done and committed
- 🔄 done locally, not yet merged/committed (no current rows should use this after the 2026-07-04 docs refresh)
- 🟡 should fix before pilot — unstarted or partially started
- 🔴 blocks the go-live gate — not started
- ⬜ genuinely lower priority or deferred

## Where We Are

The data model, offline integration path, local acceptance test, operator
review UI, durable spool consumer, and flow-monitor health endpoint are all
implemented and committed. Every repo's integration branch has been tested.
Production deployment is live at
[https://fwkt-damnit.fz-rossendorf.de/](https://fwkt-damnit.fz-rossendorf.de/).
The remaining work is (a) merging the shotcounter branch, (b) pointing the
deployment's real ASAPO/Kafka spool consumers at live broker credentials and
running restart/replay roundtrips, and (c) running the pilot capture.

Committed and tested:

- Canonical `HZDREventV1` Pydantic model; `hzdr_nexus.py`/`hzdr_sources.py`
  derive from it instead of maintaining independent field lists.
- Adapters for normalized ASAPO events, raw Watchdog documents, and legacy
  DRACO `processed_message` payloads.
- Date-scoped identity and centralized reconciliation: exact Kafka identity,
  TANGO/shotcounter same-day matching, timestamp disambiguation, and
  timestamp-only fallback.
- LabFrog Mongo, curated SQLite, and rich NeXus readers; curated SQLite linking
  columns (`kafka_event_id`, transport offsets, `damnit_*`) are preserved.
- Canonical NeXus bridge, source catalog, API models, and frontend views.
- Standards-aligned NeXus laser/sample bridge groups: `/entry/instrument/laser` writes
  `NXsource` + nested `NXbeam` from available `metadata.laser.*`, and `/entry/sample`
  writes `NXsample` from available `metadata.target.*`.
- `HZDREventV1.experiment_id` derived from MediaWiki campaign choice in
  LabFrog and plumbed through the SQLite/NeXus export pipeline.
- Atomic `hzdr_sources.json` publication (temp file + rename) at every write
  site, plus explicit dedup-by-`event_id` and corrupt-JSONL handling.
- Single-writer PID-stamped lock around `hzdr-hdf5-builder.py` publish step,
  with stale-lock recovery.
- Ambiguous/unmatched events surfaced through API; real Confirm Matches UI
  (`/link-shot-records`) backed by `GET/POST .../review`.
- Local acceptance script (`api/scripts/hzdr-local-acceptance.py`): emulator
  events through Confirm Matches over a real FastAPI `TestClient`, no sibling
  repo or broker required.
- Shared example payloads in `api/examples/` using the canonical
  `hzdr-event-v1` schema-version string; lightweight anonymized LabFrog SQLite
  fixture at `api/examples/Example_Campaign_06.2026.light.sqlite`.
- Local ASAPO emulator/test harness proves claim-before-ack,
  flush/fsync-before-ack, campaign-scoped group offsets, and replay dedup by
  `event_id` with message-ID fallback.
- Offline four-source integration test (`api/tests/test_hzdr_integration.py`).
- Durable ASAPO spool consumer (`consumer/spool.py` + `consumer/asapo.py`):
  claim→write-fsync→ack→dedup loop running as a FastAPI lifespan background
  task; 11 integration tests against the live harness broker.
- `GET /config/health` endpoint: async ASAPO/Kafka/Mongo liveness probes with
  per-service `reachable` + `latency_ms`; configured via `DW_API_HZDR_HEALTH__*`.
- Production deployment templates: `api/.env.production.example`,
  `hzdr/scripts/damnit-api.service` systemd unit.
- Cross-repo test runner `hzdr/scripts/test-all.ps1` (all six suites, one command).
- Pilot package gate (`hzdr/scripts/test-pilot-package.ps1`) for the Kafka pilot, with ASAPO excluded by default and live broker tests still opt-in via `-DockerTests`.

## Work Order

The sequence below is ordered by dependency, not effort.

1. **Merge the `shotcounter` branch** — verified passing (24/24 tests), not
   yet on main. Gate: one manual Kafka smoke test with `KafkaEnabled=1`
   against a local broker, plus a decision on `IsShotCounterXX` defaults for
   real deployments (currently all `False` — operators must opt each channel
   in explicitly).
2. **`asapo-for-hzdr-damnit` harness updates** — ✅ committed (incremental). Example
   files use canonical `"hzdr-event-v1"` schema-version string; `drop-in/consumer.env.example`
   documents both HTTP-harness and real ASAPO SDK modes. As of 2026-07-01 ("closer to prod"
   commit) `tools/local_message_suite.py` has real SDK consumer/producer using
   `asapo_consumer.create_consumer()` + `asapo_producer.create_producer()` (`--transport asapo`).
   Treat this as an ASAPO-compatible sidecar/harness path for now: DAMNIT is pinned to
   Python 3.13. Watchdog is Kafka-only; ASAPO is for LaserData or another future
   ASAPO source. Use a Python runtime with compatible SDK wheels, or request a
   wheel for the target DAMNIT Python version before direct DAMNIT SDK imports.
3. **Wire `shotcounter`'s Kafka envelope into DAMNIT's normalizer** — ✅
   committed. `normalize_processed_trigger_message` detects a flat
   `hzdr-event-v1` document (`schema_version` field present) and routes it
   through `_normalize_hzdr_event_v1_trigger`, folding top-level `trigger_role`
   into `metadata.trigger.role` and deriving `shot_id` from `shot_number`.
   Four new unit tests; one new integration test.
4. **Catalog-edit persistence across rebuilds** — ✅ committed. Operator
   `confirm`/`dismiss` actions are written to `hzdr_sources.review.jsonl`;
   `write_sources_catalog` merges them on every rebuild. Review levels:
   `VERIFIED > REVIEWED > BASE`. See §Durable Spool for the production variant.
5. **Capture one real pilot sequence** — one synchronized real capture for
   `Solenoid Beamline Tests 01.2025`: LabFrog export, ASAPO event, Watchdog
   Kafka event, shotcounter trigger message.
6. **Implement durable campaign spool with ack-after-flush consumers** — ✅
   committed. `api/src/damnit_api/consumer/spool.py` (`HZDRSpoolConsumer` base,
   claim→write→ack→dedup loop) and `consumer/asapo.py` (`AsapoSpoolConsumer`,
   talks to harness HTTP API and real ASAPO broker endpoint alike). Activated by
   `DW_API_HZDR_SPOOL__ENABLED=true`; starts as a FastAPI lifespan background
   task. 11 new tests in `api/tests/test_hzdr_spool.py`. Suite: `161 passed, 1 skipped`.
7. **Run real broker roundtrips with restart/replay** — 🟡 test scaffold
   committed. `api/tests/test_hzdr_broker_roundtrip.py` has 4
   `pytest.mark.integration_docker` tests (commit-before-ack via
   `list_consumer_group_offsets`, restart-resume from committed offset,
   replay-dedup via fresh group sharing spool dir, golden-path 10-event
   roundtrip). Activate with `pwsh hzdr/scripts/test-all.ps1 -DockerTests` or
   `KAFKA_TEST_BROKER=<host:9092> pytest -m integration_docker`. Tests are
   skipped, not failed, when no broker is reachable. The go-live gate still
   needs an actual run: produce a captured sequence, kill+restart the consumer
   mid-stream, and verify no lost acks and no duplicate spool lines.
8. **Connect flow-monitor backend health** — ✅ committed. `GET /config/health`
   in `shared/routers.py` returns `FlowMonitorHealth` with async probes for
   ASAPO (httpx), Kafka (TCP), and Mongo (motor ping), each with a 2 s timeout.
   Configured via `DW_API_HZDR_HEALTH__*` env vars.
9. **Run the go-live replay** — see Go-Live Gate below.

## Repository Responsibilities

### `GitLab/labfrog`

Branch: `feature/open-sqlite-explorer` — merged to `develop` (default branch)

| Item | Status |
| --- | --- |
| Map MediaWiki campaign choice to canonical `experiment_id` alongside `Campaign` | ✅ merged to `develop` |
| Store/preserve timezone fields (`date_time_utc`, `date_time_timezone`) | ✅ merged to `develop` |
| Mongo `_id`/`_id_OLD`/`version`/`status` implement stable identity and history | ✅ pre-existing, documented |
| Store/import authoritative TANGO shot number | 🔴 blocked-on: `shotcounter` merge + cross-system shot-number authority decision (see `shotcounter` section and §Shot Number Authority) |

### `GitLab/labfrog-sqlite-tools-repo`

Branch: `main` (changes committed)

| Item | Status |
| --- | --- |
| `experiment_id` column, migration, transform/export/NeXus plumbing | ✅ committed (`schema fix`) |
| Lightweight anonymized SQLite fixture in `DAMNIT-web-hzdr/api/examples/` | ✅ committed |
| Schedule campaign-scoped exports (cron/systemd/task-scheduler) | ⬜ external infra, not yet decided |
| Publish completed SQLite/NeXus pairs by atomic rename or completion marker | ✅ committed — `bundle-complete.json` marker (atomic, with per-file sha256); atomic temp+rename already in `write_sqlite`/NeXus export |
| Retain each source export used for a canonical build | ✅ committed — opt-in `retain_exports` snapshots via `export-campaign` CLI |
| Keep DAMNIT output separate from the immutable LabFrog export | ✅ directory layout enforces this |

### `GitLab/planet-watchdog` (DAQ-File-Watchdog)

Branch: `master` (changes committed)

| Item | Status |
| --- | --- |
| Canonical campaign/output topic settings in producer config | ✅ committed |
| Normalized events preserve Kafka topic, partition, offset, file URI/path, `payload_ref` | ✅ committed — `kafka_output.py` copies `topic/partition/offset` into `payload_ref`; integration test asserts all three fields |
| `IsShotCounterXX`-gated authoritative shot number in normalized event | 🔴 blocked-on: `shotcounter` merge and cross-system shot-number authority decision |
| Configure production deployment with canonical campaign and output topic | 🟡 config exists; deployment not yet pointed at it |
| Real broker roundtrip and restart/replay test | 🟡 DAMNIT's `-DockerTests` suite covers this; planet-watchdog-specific pass not yet run |

### `GitLab/asapo-for-hzdr-damnit`

Branch: `main` (all committed)

| Item | Status |
| --- | --- |
| Local harness proves claim-before-ack, flush/fsync-before-ack, campaign-scoped group offsets, replay dedup by `event_id` | ✅ committed and verified |
| Example files use canonical `hzdr-event-v1` schema-version string | ✅ committed |
| `drop-in/consumer.env.example` documents HTTP-harness and real ASAPO SDK modes | ✅ committed |
| Real ASAPO SDK consumer/producer in `tools/local_message_suite.py` (`--transport asapo`) | committed as ASAPO-compatible sidecar/harness path |
| `drop-in/consumer.ps1` drives real SDK consumer via `DAMNIT_CONSUMER_TRANSPORT=asapo` | committed; requires Python with ASAPO SDK installed |
| Production supervised consumer with named consumer group and campaign routing | ✅ implemented in DAMNIT — `AsapoSpoolConsumer` in `api/src/damnit_api/consumer/asapo.py` |
| DAMNIT real-ASAPO production path | deferred; use `asapo-for-hzdr-damnit` as the sidecar after LaserData/package/broker access is confirmed; not a Kafka pilot blocker |
| References large arrays externally instead of embedding in JSON | ✅ committed for DAMNIT direct ASAPO adapter — `RealAsapoSpoolConsumer` externalises oversized inline `values` into `payload_ref.uri`; sidecar/producers should mirror before real LaserData rollout |

### `GitLab/shotcounter`

Branch: `feature/hzdr-canonical-trigger-event` (not yet merged to main)

| Item | Status |
| --- | --- |
| `schema_version`, stable `event_id`, canonical `experiment_id`, UTC timestamp | ✅ on branch, 24/24 tests pass |
| Machine-readable `trigger_role` via `TriggerRoleXX` attribute | ✅ on branch |
| Kafka key `<experiment_id>:<channel_id>` for ordering | ✅ on branch |
| Long-lived producer with retry on same `event_id` | ✅ on branch |
| Operator-configurable `ShotNumber` with debounce; `IsShotCounterXX` per channel | ✅ on branch |
| `IsShotCounterXX` defaults | ✅ decided — default `False`, opt-in per channel; startup warning fires when `KafkaEnabled=True` but no channel is set |
| Kafka smoke test script (`scripts/kafka_smoke_test.py`) | ✅ written, verified green against `kafka-broker-docker` locally |
| Smoke test on **deployment broker** with `KafkaEnabled=1` | 🟡 one remaining gate item before merge |
| Merge to main | 🟡 pending deployment-broker smoke test |
| `shotcounter`'s `hzdr-event-v1` Kafka envelope consumed by DAMNIT normalizer | ✅ committed — `_normalize_hzdr_event_v1_trigger` added; 4 unit + 1 integration test |

### `GitHub/DAMNIT-web-hzdr`

Branch: `main`

| Item | Status |
| --- | --- |
| Canonical `HZDREventV1` model, atomic catalog writes, single-writer builder lock | ✅ committed |
| Standards-aligned NeXus bridge groups (`/entry/instrument/laser` as `NXsource` + nested `NXbeam`, `/entry/sample` as `NXsample`) | ✅ committed and covered by `api/tests/test_hzdr_nexus_sample.py` / `test_hzdr_nexus.py` |
| Target wiki links exposed in DAMNIT API/UI (`target_wiki_ref` / `target_wiki_page`, shot table/detail links) | ✅ committed; API pass-through covered in `api/tests/test_hzdr_sources.py`, frontend table/detail links wired |
| Ambiguous/unmatched events in API; real Confirm Matches UI | ✅ committed |
| Local acceptance script; offline four-source integration test | ✅ committed |
| Shared example payloads and anonymized SQLite fixture | ✅ committed |
| Pilot package gate (`hzdr/scripts/test-pilot-package.ps1`) | ✅ committed and green locally on 2026-07-03 with `-NoCoverage`; ASAPO excluded by default; live broker `-DockerTests` still separate |
| Cross-repo test runner (`hzdr/scripts/test-all.ps1`) — runs all six suites in one command; `-DockerTests` flag adds `pytest.mark.integration_docker` broker roundtrip suite | ✅ committed |
| Real-broker restart/replay integration test (`api/tests/test_hzdr_broker_roundtrip.py`) — 4 docker-gated tests; skipped not failed when broker absent | ✅ committed |
| Catalog-edit persistence across rebuilds (confirm/dismiss survives builder rerun) | ✅ committed — `hzdr_sources.review.jsonl` sidecar, `VERIFIED>REVIEWED>BASE` precedence |
| Versioned JSON Schema publication from `HZDREventV1` | ⬜ lower priority while only one schema version exists |
| Durable per-campaign spool with transport positions and dedup state | ✅ committed — `consumer/spool.py` + `consumer/asapo.py` (ASAPO) + `consumer/kafka.py` (Kafka trigger events); `DW_API_HZDR_SPOOL__ENABLED` / `DW_API_HZDR_KAFKA_SPOOL__ENABLED` activate background tasks in lifespan |
| Real flow-monitor backend health (Kafka/ASAPO/Mongo) | ✅ committed — `GET /config/health`; async probes with 2 s timeout, `reachable+latency_ms` per service |
| Production auth, storage, backup, logging, restart configuration | ✅ committed — `api/.env.production.example`, `hzdr/scripts/damnit-api.service` systemd unit; JSON logging already active when `DW_API_DEBUG=false` |
| Live production deployment reachable | ✅ **[https://fwkt-damnit.fz-rossendorf.de/](https://fwkt-damnit.fz-rossendorf.de/)** — `api/scripts/damnit-api-deploy.sh`/`.ps1`, `frontend/nginx` proxy templates, LDAP against `ldap.fz-rossendorf.de` |
| ASAPO SDK spool consumer wired to real broker | 🟡 `RealAsapoSpoolConsumer` implemented and selectable (`DW_API_HZDR_SPOOL__BROKER_KIND=asapo`); `.env.production.example` documents the setting. Still open: point the deployment at real broker credentials, and there is no real-broker roundtrip test for ASAPO yet (only Kafka has one) |
| Builder auto-triggered after new spool events | ✅ committed — `consumer/builder_trigger.py` (`BuilderTrigger`): each spool consumer's `on_new_events_hook` signals a shared, debounced trigger that reruns `hzdr-hdf5-builder.py` as a subprocess (preserving its single-writer PID lock). Activated by `DW_API_HZDR_BUILDER__ENABLED=true`; starts as a lifespan background task. Events/trigger JSONL inputs derived from the running consumers' spool paths. Plan + tests in `hzdr/docs/plans/done/auto-builder-trigger-plan.md` / `tests/test_hzdr_builder_trigger.py`. A standalone systemd timer remains an optional alternative |
| `runs.sqlite` projection for legacy table workflows | ⬜ optional; deferred |
| Register the canonical campaign NeXus file in SciCat and back-populate `payload_ref.scicat_pid` | ✅ committed 2026-07-04 — `metadata/scicat.py` + builder post-step (`_register_scicat`) POST the NeXus path to the plugin and stamp `scicat_pid`/`version_hash`/`dataset_url` into the catalog; `GET .../scicat` endpoint + Link Records UI card. Best-effort (never fails a build); unchanged rebuilds skip the re-POST. `DW_API_HZDR_SCICAT__*`. See `hzdr/docs/plans/done/scicat-registration-plan.md` |

### `GitLab/scicat_plugin`

Branch: `master` · `codebase.helmholtz.cloud/fwk/fwkt/fwkt-data-management/data-capturing/scicat_plugin`

The SciCat sink for the family: a lightweight Flask service (and embeddable
`bp_scicat` blueprint) that reuses the upstream `SciCatProject/scicat-ingestor`
worker codepaths, so the datasets/origdatablocks it creates look exactly like the
official file-writer's. **It registers filesystem path references and metadata
only — never file contents** (the target SciCat instances forbid binary upload),
which is exactly what DAMNIT needs to register a campaign NeXus file by path.

| Item | Status |
| --- | --- |
| Flask service + embeddable `bp_scicat` blueprint over `scicat-ingestor` worker codepaths (dataset + origdatablock) | ✅ exists |
| Path/metadata-only registration (no binary upload); records absolute/POSIX file references | ✅ exists |
| HTTP ingestion: `POST /scicat/from-json` (one file + `meta`), `POST /scicat/push` (file manifest + `meta`, returns deterministic `version_hash`), `POST /scicat/from-watchdog` (planet-watchdog docs) | ✅ exists |
| Env config: `SCICAT_URL`/`SCICAT_TOKEN`, `DEFAULT_OWNER_GROUP`, `DEFAULT_ACCESS_GROUPS`, `CONTACT_EMAIL_DEFAULT`, `PRINCIPAL_INVESTIGATOR_DEFAULT` | ✅ exists |
| Connectivity probes (`/scicat/config/test`, `/scicat/config/whoami`), live dashboard + SSE activity stream | ✅ exists |
| Schema Builder: per-`watch_name` recurring metadata (`schema_store.json`); `"51.9MeV"` → `{value, unit}` auto-detection | ✅ exists |
| Deterministic version hashing (`versioning.make_manifest`/`manifest_hash`) over the file-reference manifest | ✅ exists |
| DAMNIT builder post-step registers each campaign NeXus file path and stores the returned `scicat_pid` | ✅ committed 2026-07-04 — `_register_scicat` in `hzdr-hdf5-builder.py` + `metadata/scicat.py`; runs inside the single-writer lock, best-effort |
| Surface a SciCat dataset link in the API alongside the wiki link | ✅ committed — `GET /metadata/hzdr/sources/{key}/scicat` (`HZDRScicatInfo`) + `ScicatCard` on the Link Records page |
| Re-registration detection on rebuild via stored `version_hash` | ✅ committed — DAMNIT-side sha256 skip (`scicat_source_sha256`) avoids a re-POST on byte-identical rebuilds; `version_hash` from `/scicat/push` is stored for plugin-side dedup |

## Shot Number Authority

`shot_number` is `int | None` in the canonical model — nullable by design while
no cross-system-authoritative source exists. The three options, in order of
effort:

1. **TANGO-preferred with timestamp fallback** — use shotcounter/TANGO
   `ShotNumber` as the preferred live shot number when it is present, but keep
   DAMNIT's timestamp matcher for missing, duplicated, or delayed shot numbers.
   Exact curated `kafka_event_id`/transport-position matches outrank both.
   Chosen for the pilot.

2. **labfrog-sqlite-tools stamps the number at export time** — reads the
   LabFrog Mongo shot count (already the operator-facing truth) and writes it
   into the SQLite/NeXus export. The authoritative number is only known after
   export; real-time event-side `shot_number` is still advisory.

3. **Dedicated cross-system TANGO shot-counter device** — every producer reads
   from it before stamping `shot_number`; labfrog writes to or reads from it.
   Only option that gives a live, cross-system-consistent number at acquisition
   time. Most work: new device, new integration point in every producer. This
   overlaps the TANGO device self-archiving work (see *Future: TANGO device
   self-archiving as a metadata source*) — a control-system archiver is the
   natural home for reading such a counter alongside other device attributes.

The decision to use Option 1 for the pilot is recorded. Options 2 and 3 remain
open for post-pilot evaluation.

## Schema Fix Review (2026-06-23)

Review of the matching/identity schema work (curated SQLite v7/v8 columns,
identity-first matching, `values` typing, `shot_key` route). Verified: full
HZDR suite green (59 tests), `ruff` clean on all touched modules.

What landed and is solid:

- **Identity-first matcher.** `_match_event` now resolves in the documented
  order: `kafka_event_id` → transport position (`topic/partition/offset`) →
  same-day TANGO `shot_number` → duplicate-shot timestamp disambiguation
  (`exact_day_shot_number_time_window`) → `shot_number` + nearest time →
  nearest time → ambiguous/unmatched. `MATCH_RANK` ordering is internally
  consistent (disambiguated < unique exact-day), and `MATCH_RANK.get(q, 0)`
  tolerates the non-ranked `ambiguous`/`unmatched` qualities without a KeyError.
- **Curated SQLite reader.** `read_labfrog_sqlite_shots()` now preserves the
  Kafka/identity/linking columns and the `damnit_*` hints, prefers `date_time_utc`
  for timestamp matching while keeping local `date_time` for date-scoping, and
  drops empty-string columns from metadata (handles the empty `experiment_id`
  seen in the curated Solenoid export).
- **Superseded-row handling.** `_mark_superseded_labfrog_rows()` marks non-`active`
  duplicates of an `active` (campaign, date, shot_number) group with
  `has_newer_version`, reusing the same flag the NeXus reader already emits and
  the matcher already filters on — archived rows stay as provenance, out of
  automatic matching.
- **`shot_key` lookup.** `GET .../shots/by-key/{shot_key}` is declared before the
  `{shot_number}` route, so it is not shadowed; `_shot_detail()` is now shared by
  both lookup paths.
- **`values` typing.** Relaxed to `JsonValue | None`, so small numeric arrays
  validate alongside scalars/objects.

Follow-ups:

1. **Frontend `shot_key` — partially adopted.** ✅ The shot-detail panel in
   `ShotPage.tsx` now fetches via `GET .../shots/by-key/{shot_key}` when the
   selected shot carries a `shot_key`, falling back to the legacy
   `{shot_number}` route only when none is present — so restart-duplicated
   `shot_number`s no longer make the detail fetch fragile. Still pending: the
   table's row-selection identity and the ambiguous-review action key on
   `shot_number`; moving those to `shot_key` needs by-key PATCH/review routes and
   a larger table-state refactor, tracked separately as UI work.
2. **`has_newer_version` for SQLite is keyed on `status == active`, not version
   number** — ✅ guarded. The decision still follows `status == active` (the
   accepted pilot simplification), but `_mark_superseded_labfrog_rows` now logs a
   warning via `_warn_if_active_row_not_latest` when a curated export marks a
   non-latest `version` row active, so the malformed case is observable instead
   of silently wrong. A characterization test pins both the well-formed and
   malformed cases. Revisit keying on `version` if curated data proves noisier.
3. **Kafka spool consumer for shotcounter/Watchdog** — ✅ landed as
   `KafkaSpoolConsumer` (`consumer/kafka.py`); identity matching was already
   ready to consume those linking fields. Next real work is now the real-broker
   restart/replay pass (Work Order step 7) toward the go-live gate.

### Reassessment (2026-06-23, follow-up pass)

Three of the original follow-ups are now closed; the suite stays green (HZDR
suite 100 tests with `-k hzdr`, `ruff` clean on all touched modules):

- **`values` size guard added.** `check_values_size()` in `hzdr_event.py`
  rejects an inline `values` payload over `MAX_VALUES_ITEMS` (4096) leaf items -
  counted recursively, so nested image arrays count every element - or over
  `MAX_VALUES_BYTES` (64 KiB) of serialized JSON. `load_normalized_events()`
  enforces it at staging time, naming the offending file and pointing producers
  at `payload_ref`. Kept as a standalone function so future strict model
  validation can reuse the same bound. (was follow-up 2)
- **`experiment_id` duplication collapsed.** `read_labfrog_sqlite_shots()` now
  excludes `experiment_id` from the per-row `metadata` dict; it lives only at the
  top level, the single location `select_experiment_id()` reads. The builder's
  defensive `metadata` fallback is harmless but no longer exercised for curated
  SQLite. (was follow-up 3)
- **Transport-position uniqueness assumption documented.**
  `_shots_matching_transport_position()` and `hzdr/docs/architecture.md` now state
  that the `(topic, partition, offset)` match is intentionally not date-scoped
  and trusts curated export writers never to rewrite/renumber committed offsets;
  if a topic is recreated/compacted so offsets are reused, drop to
  `kafka_event_id` identity matching. (was follow-up 5)

Status of the items above: the Kafka spool consumer has landed
(`KafkaSpoolConsumer`, `consumer/kafka.py`); the shot-detail fetch now uses the
`shot_key` by-key route (full table/review `shot_key` adoption is still tracked
as separate UI work); and the `has_newer_version` status keying now warns on a
non-latest active row while keeping the pilot behavior.

## Durable Spool Design

Work Order step 6: production supervised consumer with ack-after-flush semantics.

### What the local harness already proves

`asapo-for-hzdr-damnit/tests/test_local_message_suite.py` (9 tests) proves the
correct ordering for the local ASAPO-style path and its HTTP/CLI surface:

1. **Claim** message from named consumer group (ASAPO `GetNext`).
2. **Write and flush/fsync** the event JSON to local disk.
3. **Ack** (`Acknowledge`) only after the write is verified.
4. **Dedup** by `event_id` on replay (reject already-present IDs).
5. **Campaign routing**: each consumer group is scoped to a campaign slug;
   offset/position are per-group, so replaying one campaign does not disturb
   another.
6. **HTTP/CLI contract**: publish, claim, ack, consume, reset, invalid-event
   rejection, LaserData JSONL staging, and replay deduplication are covered
   without a real broker.

The same ordering and durability properties must hold for the real production consumer.

### What production needs

| Gap | Work required |
| --- | --- |
| Real ASAPO SDK consumer | Deferred until LaserData/package/broker access is available. Use `asapo-for-hzdr-damnit` as the sidecar that writes DAMNIT-compatible JSONL; direct DAMNIT SDK imports can wait for compatible wheels |
| Supervised restart | Wrap the consume loop in a `systemd` unit (or DAMNIT background task) that restarts on exit; last acked offset is the consumer group position — restart picks up where it left off |
| Large-array externalisation | DAMNIT direct ASAPO adapter externalises oversized inline `values` into `payload_ref.uri` before JSONL spooling; sidecar/producers should emit the URI directly for real LaserData rollout. The builder size guard remains a backstop for any non-ASAPO path |
| Kafka consumer (DAQ File Watchdog / shotcounter) | ✅ `KafkaSpoolConsumer` (`consumer/kafka.py`): same `HZDRSpoolConsumer` claim/write/ack loop over a `kafka-python-ng` consumer group with `enable_auto_commit=False`; `_claim` polls a batch without committing, `_ack` commits `OffsetAndMetadata(last+1)` only after every message is fsync'd. Sync client calls are off-loaded with `asyncio.to_thread`. Activated by `DW_API_HZDR_KAFKA_SPOOL__ENABLED=true` |
| Per-campaign spool directory | `<campaign-slug>/spool/asapo/` and `<campaign-slug>/spool/kafka/<topic>/` under the DAMNIT data root; the builder's `--events-jsonl` / `--trigger-jsonl` flags already point to exactly these paths |
| Write-and-flush before ack | `write_json_atomic` (temp file + `fsync` + rename) is already implemented in `hzdr_nexus.py`; the consumer calls it, then acks |
| Dedup on replay | Consumer checks whether `event_id` already exists in the spool directory before writing; if yes, skip and ack (idempotent replay) |
| Builder trigger | ✅ implemented. `consumer/builder_trigger.py` (`BuilderTrigger`) overrides the `on_new_events()` dispatch via `on_new_events_hook`: a shared debounced task coalesces new-event signals and reruns `hzdr-hdf5-builder.py` as a subprocess. Activated by `DW_API_HZDR_BUILDER__ENABLED=true`. The single-writer PID lock serialises concurrent runs; a standalone systemd timer remains an optional alternative for external scheduling |

### Implementation (completed 2026-06-18)

1. ✅ `HZDRSpoolConsumer` base class in `api/src/damnit_api/consumer/spool.py` —
   `SpoolConfig` dataclass, `consume_one()` write+dedup, `run(stop)` poll loop,
   clean `CancelledError` handling.
2. ✅ `AsapoSpoolConsumer` in `api/src/damnit_api/consumer/asapo.py` — talks to
   the harness HTTP broker and the real ASAPO broker endpoint via the same API.
   ✅ `KafkaSpoolConsumer` in `api/src/damnit_api/consumer/kafka.py` — the same
   base class over a `kafka-python-ng` consumer group with manual offset commit;
   sync `poll`/`commit` off-loaded via `asyncio.to_thread`. 6 offline tests in
   `api/tests/test_hzdr_kafka_spool.py` (in-memory fake broker, no Docker).
3. ✅ Supervised launch: `DW_API_HZDR_SPOOL__ENABLED=true` (ASAPO) and
   `DW_API_HZDR_KAFKA_SPOOL__ENABLED=true` (Kafka) each start a background
   asyncio task, sharing one stop event and teardown. The startup/shutdown
   wiring lives in `consumer/bootstrap.py` (`spool_lifespan`), which the FastAPI
   lifespan in `main.py` enters as a single `async with`; `hzdr/scripts/damnit-api.service`
   systemd unit wraps the whole API process with `Restart=on-failure`.
4. ✅ 11 integration tests in `api/tests/test_hzdr_spool.py` (ASAPO, live
   in-process harness broker) + 6 in `api/tests/test_hzdr_kafka_spool.py`
   (Kafka, in-memory fake). Remaining for Kafka go-live: deployment-broker
   restart/replay pass (Work Order step 7). Real ASAPO SDK roundtrip is deferred
   until the sidecar can be run against LaserData or a standalone ASAPO broker.

### Key invariant

> A message is acked **if and only if** its event file exists, is complete
> (written + fsync'd), and the builder has been triggered. An unclean shutdown
> between ack and builder trigger means the event is on disk but the catalog
> has not been updated; the next builder run corrects this automatically because
> it reads all spool files.

## Go-Live Gate

Replay one captured `Solenoid Beamline Tests 01.2025` sequence. Restart and
replay each consumer, then verify:

- no lost acknowledged events
- no duplicate events or products
- correct date-scoped shot keys
- explicit matched, ambiguous, and unmatched counts
- atomic file replacement while the API is reading
- source, shot, provenance, and preview views in the frontend
- staged-event schema validation rejects malformed producer payloads with
  actionable errors
- reproducible output from retained exports and spools

## SciCat Registration

**Status:** ✅ DAMNIT-side wiring implemented 2026-07-04 (see
`hzdr/docs/plans/done/scicat-registration-plan.md`); enable with `DW_API_HZDR_SCICAT__ENABLED=true`
+ `PLUGIN_URL` · **Effort:** Low–Medium · **Added:** 2026-06-26

This is a **post-pilot FAIR enhancement, off the go-live critical path** — the
pipeline builds and serves the canonical NeXus file + catalog without it. The
sink already existed and the schema hook (`payload_ref.scicat_pid`) was reserved;
the builder post-step, `/scicat` endpoint, and UI link are now wired up. Detailed field mapping is in
[standards-alignment.md §3.9](../standards-alignment.md#39-scicat-field-mapping) and
[Phase 4 of the alignment plan](../plans/alignment-implementation-plan.md#phase-4--scicat-registration-via-the-existing-hzdr-plugin-).

### What the plugin actually is (verified against the source)

Earlier planning assumed an in-process `register(nexus_path, metadata)` Python
call. The real `scicat_plugin` is an **HTTP service / Flask blueprint**, so the
integration boundary is a POST, not an import — which also sidesteps the
Flask-vs-FastAPI in-process mismatch (DAMNIT's API is FastAPI/Strawberry; the
plugin is Flask). The plugin can run standalone (`scicat-addin-serve`, default
`127.0.0.1:5001`) or be mounted into another Flask app via `bp_scicat`.

Endpoints relevant to DAMNIT:

| Endpoint | Input | Returns | Fit for DAMNIT |
| --- | --- | --- | --- |
| `POST /scicat/from-json` | `{filepath, title?, description?, dataset_type?, owner_group?, access_groups?, owner?, source_folder?, meta?, timestamp?}` | `{ok, pid, source_folder, file_name}` | Simplest: register one canonical NeXus file path + assembled `scientificMetadata` |
| `POST /scicat/push` | `{title?, files: [path|{path,checksum}], meta?, …}` | `{ok, pid, version_hash, …}` | Better for rebuilds: the deterministic `version_hash` detects when a rebuilt campaign manifest changed and needs re-registration |
| `POST /scicat/from-watchdog` | one/many Watchdog Mongo/GUI docs | per-doc `{ok, pid}` | Not the builder path — this is the **producer-side**, per-file SciCat path that planet-watchdog can use directly |

Ownership/contact fields default from the plugin's env
(`DEFAULT_OWNER_GROUP`, `DEFAULT_ACCESS_GROUPS`, `CONTACT_EMAIL_DEFAULT`,
`PRINCIPAL_INVESTIGATOR_DEFAULT`); a request can override any of them.

### Two granularities of SciCat registration

The plugin supports SciCat ingestion at two points in the family, and they are
complementary, not competing:

1. **Per-file, producer-side** (`/scicat/from-watchdog`): planet-watchdog
   instrument files registered as they arrive. Fine-grained provenance; no DAMNIT
   involvement.
2. **Per-campaign, consumer-side** (`/scicat/from-json` or `/scicat/push`):
   DAMNIT's builder registers the *canonical campaign NeXus file* once it is
   built — the FAIR "one citable dataset per campaign" record. This is the path
   that back-populates `scicat_pid` into `hzdr_sources.json`.

### Recommended DAMNIT-side wiring (when this is picked up)

1. Add a builder post-step (in `hzdr-hdf5-builder.py` or a small registration
   module) that assembles the §3.9 `RawDataset` fields
   (`proposalId`=`experiment_id`, `instrumentId`, `scientificMetadata`=the shot
   metadata dict, `sourceFolder`=`damnit_path`) and `POST`s the NeXus file path
   to the configured plugin URL.
2. Persist the returned `pid` as `payload_ref.scicat_pid` / a source-catalog
   field; store `version_hash` (if using `/scicat/push`) to skip re-registration
   when a rebuild is byte-identical.
3. Surface a SciCat dataset link in the API alongside the wiki link (mirror the
   MediaWiki endpoint pattern).
4. Tests: a unit test with the plugin HTTP call mocked runs always; a gated
   integration test (like the broker tests) runs only when a SciCat URL + token
   are configured.

Config lives in DAMNIT settings (`DW_API_*`) pointing at the plugin URL; the
SciCat URL/token stay in the plugin's own env, never in DAMNIT API code (per the
secrets boundary in `CLAUDE.md`).

## Future: TANGO device self-archiving as a metadata source

**Status:** 🔴 future / needs live infrastructure · **Effort:** Medium (bridge +
DAMNIT adapter) + external (control-system devices) · **Added:** 2026-06-26

The goal is to let **TANGO devices write their own data and metadata** into the
canonical campaign record, instead of DAMNIT relying only on producer-embedded
values or the emulator's synthetic fields. Today the only TANGO touchpoint is
`shotcounter` (one device server emitting `draco.trigger` to Kafka).

**Reference evaluated:** CALA's `pyds_archivingserver` (`ArchivingServer` device),
`gitlab.lrz.de/cala-public/tangodeviceservers/pyds_archivingserver`. CALA (Centre
for Advanced Laser Applications, LMU/MPQ) is a petawatt laser-plasma facility — a
close analogue to DRACO — so the pattern is directly applicable. The notes below are
from the actual `ArchivingServer.py` source (shared 2026-06-26), not assumptions.

> **Sequencing — this is deferred, not on the critical path.** The plan is to adopt
> this pattern, but it is still a good way out and will take significant effort. The
> pipeline **must work end-to-end before then** and does not depend on it. In the
> interim, per-shot metadata comes from the sources already wired: the LabFrog
> SQLite/NeXus export, the existing producers (`shotcounter`, DAQ-File-Watchdog,
> LaserData), and operator entry — including the manual / wiki-selected
> [target ontology](../target-ontology.md), which needs no TANGO integration at all.
> Treat everything below as the eventual *automation* layer that replaces manual /
> producer-embedded capture, not a prerequisite for go-live. Consequently
> `shotcounter` + Shot Number Authority **Option 1** remain the near-term shot-number
> path; `ArchivingShotNo` (Option 3) is revisited only when this work begins.

### What `ArchivingServer` actually is

It is **not** an HDB++-style central attribute-value archiver. It is a **shot-context
coordinator + per-shot completeness tracker** for a set of distributed,
self-archiving devices:

- It holds a list of **subscriber devices** (`ArchivingDevice`s; property
  `ArchivingSubscriberList`, commands `ArchivingSubscribe`/`ArchivingUnsubscribe`,
  attribute `ArchivingSubscribers`).
- On any change it **broadcasts shot context** to every subscriber via
  `write_attributes_asynch` (`arch_srv_update_fields`): `ArchivingShotNo` (DevULong),
  `ArchivingRun` (DevULong), `ArchivingExperimentPath` (a `YYYYMMDD` day folder),
  `ArchivingFlags`, and `ArchivingShotTime` (`YYYYMMDD_HHmmssfff`, millisecond
  precision — "timestamp when server triggers shot").
- Each subscriber then **archives its own files** under
  `<ArchivingLocalRootPath>/<ArchivingExperimentPath>/<AutoCreationFolders>/`, tagged
  with that shot number. The server inherits `ArchivingDevice` so it can archive its
  own files too.
- It subscribes to each device's `ArchivingLastShotNoSaved` **CHANGE_EVENT**
  (`register_archiving_complete`) and tracks which devices have *not* confirmed
  saving each shot, exposing `ArchivingLastShotFailedDevices` and
  `ArchivingPreviousShotsFailedDevices` (JSON, last 20 shots) — a **per-shot
  archiving-completeness QA signal**.
- A cron job (`AutoUpdateArchivingExperimentPath` at `...PathTime`, e.g. `08:15`,
  via APScheduler) rolls `ArchivingExperimentPath` to the current date daily.

No central DB, no attribute polling, no time-series store. The "archive" is the
shot-numbered, date-foldered file tree each device writes into.

### Why this aligns unusually well with DAMNIT

| `ArchivingServer` field | DAMNIT concept | Note |
| --- | --- | --- |
| `ArchivingShotNo` | `shot_number` | **Candidate authoritative TANGO counter** — every device already keys off it (see Shot Number Authority Option 3) |
| `ArchivingShotTime` (`YYYYMMDD_HHmmssfff`) | `fired_at` / event `timestamp` | Local wall-clock; convert with campaign timezone (DAMNIT already does) |
| `ArchivingExperimentPath` (`YYYYMMDD`) | local-date in `shot_key` `<exp_id>:<YYYYMMDD>:<NNNNNN>` | The day-folder convention *is* DAMNIT's date-scoping |
| `ArchivingRun` | `metadata.run.*` (run index) | |
| files under `<ExperimentPath>/…` | `HZDRDataProduct` (`payload_ref.path`) | Already organized by the (day, shot) keys DAMNIT matches on |
| `ArchivingLastShotFailedDevices` / `ArchivingPreviousShotsFailedDevices` | new `metadata.archiving.*` QA field | "shot N archived by 8/10 devices" — surfaceable in the Confirm Matches / review UI |

The shot identity DAMNIT needs (`shot_number` + local date + ms timestamp) is exactly
what this server already broadcasts, so no new matching concept is required.

### Integration options (lowest to highest effort)

1. **Bridge subscriber → `hzdr-event-v1` → existing spool** *(recommended)*. Write a
   small `ArchivingDevice` subscriber (or an external Tango client listening to the
   server's change-events) that, per shot, emits one `hzdr-event-v1` event:
   `shot_number` = `ArchivingShotNo`, `timestamp` from `ArchivingShotTime`,
   experiment day from `ArchivingExperimentPath`, `payload_ref.path` = the shot's
   archive folder, and `metadata.archiving` = the failed-device / completeness list.
   It flows straight through the Kafka/ASAPO consumers already built. Medium; reuses
   the whole reconciler/spool path with no envelope change.
2. **Point DAQ-File-Watchdog at the archive tree** (low; reuses planet-watchdog). The
   `<root>/<YYYYMMDD>/` layout is exactly a watch root; file-arrival events become
   data products. Needs shot-number association — either parse it from the
   path/filename, or join to the bridge from option 1 for authoritative shot context.
3. **Adopt `ArchivingShotNo` as the authoritative shot number** — directly realizes
   **Shot Number Authority Option 3** below. Requires deciding how this relates to
   HZDR's `shotcounter` `ShotNumber` (same role, two facilities) — they must not both
   claim authority for the same campaign.
4. **Per-shot completeness as QA metadata** — ingest
   `ArchivingPreviousShotsFailedDevices` into `metadata.archiving.*` so the review UI
   can flag incompletely-archived shots. Genuinely new signal; no analogue today.

### Decisions / things to confirm

- **`shotcounter` vs. `ArchivingShotNo` authority.** Does HZDR run this CALA server,
  an equivalent, or just adopt the pattern? Whichever supplies `shot_number` must be
  the single authority per campaign (ties into the unresolved Shot Number Authority
  decision — currently Option 1 for the pilot).
- **Timezone.** `ArchivingShotTime` and the path date are **local**; the bridge must
  emit UTC in the envelope `timestamp` (or DAMNIT interprets them in the campaign tz,
  as it already does for naive LabFrog times).
- **Getting data out.** The server emits no event and writes no DB itself, but it is
  rich in Tango change-events — a subscriber bridge (option 1) is the natural tap; do
  not try to read attributes synchronously per shot.
- **Where laser/vacuum/diagnostic *values* come from.** They are written by the
  individual subscriber `ArchivingDevice`s into their files, not by this coordinator.
  Mapping those into `metadata.laser.*` / `metadata.vacuum.*`
  ([standards-alignment §3.3–3.6](../standards-alignment.md#33-laser-parameters)) is a
  per-device-format concern handled when their products are ingested, not by the
  server attributes above.

### Next action

Prototype option 1 offline: a stub that takes a recorded
`(ArchivingShotNo, ArchivingShotTime, ArchivingExperimentPath, failed_devices,
file list)` tuple and produces a conformant `hzdr-event-v1` event, run through the
existing reconciler against a fixture — no live Tango/control system required to
build and test the DAMNIT side.

### Next action

Confirm the four assumptions above against the real `ArchivingServer.py` (paste it
or mirror it where this session can fetch it), then prototype Option 1's
`read_tango_archive_*` adapter against a small fixture archive — no live control
system required to build and test the DAMNIT side.

## Cross-repo standardization (2026-06-23)

A sibling-repo standardization pass to keep the shared schema and tooling in
sync across `DAMNIT-web-hzdr`, `planet-watchdog`, `shotcounter`,
`labfrog`, `labfrog-sqlite-tools-repo`, `asapo-for-hzdr-damnit`, and
`kafka-broker-docker`:

- **Schema drift guard (✅).** Reconciled the vendored `hzdr_event.py` copies
  (planet-watchdog's `values` was `dict[str, JsonValue] | None` and lacked the
  `check_values_size`/`EVENT_REQUIRED_FIELDS` guardrails; now byte-equivalent in
  contract to DAMNIT's canonical model). Added a committed JSON-Schema + sample
  fixture, vendored identically into each repo, and a `test_hzdr_event.py`
  assertion per repo so future drift fails CI. See **Event Envelope** in
  `architecture.md`. A real `F821` NameError in `labfrog/login.py` (`_optional_url_for`)
  surfaced during the lint pass and was fixed.
- **Ruff everywhere (✅).** Vendored one shared `ruff.toml` baseline into every
  sibling repo (replacing Trunk/black in labfrog/planet-watchdog and black/isort
  in shotcounter; mypy retained where present). Each repo was formatted and
  safe-fixed; the residual opinionated/legacy families are baselined in a
  clearly-marked, per-repo "adoption baseline" ignore block to re-enable family
  by family. labfrog keeps its REUSE/SPDX `license-lint` gate unchanged, and
  `F401` is `unfixable` there to protect its implicit re-export pattern.

Status of the three deferred follow-ups after this pass:

- **Frontend `shot_key` adoption** — ✅ partially adopted: the shot-detail fetch
  in `ShotPage.tsx` now uses the `by-key/{shot_key}` route. The table-selection
  identity and ambiguous-review action still key on `shot_number`; that larger
  UI refactor remains tracked separately.
- **`has_newer_version` keyed on `status == active`** — ✅ guarded: still keyed on
  status (accepted pilot simplification), but now warns when an export marks a
  non-latest `version` row active (`_warn_if_active_row_not_latest`), with a
  characterization test for both cases.
- **Kafka spool consumer** — ✅ now implemented (`KafkaSpoolConsumer`,
  `consumer/kafka.py`). The drift guard above de-risked it: the consumer ingests
  exactly the `hzdr-event-v1` envelope pinned by a conformance test in every
  producer repo. The remaining go-live work is a real-broker restart/replay pass.
