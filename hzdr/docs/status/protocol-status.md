# Data-Transfer Protocol Status

Last updated: 2026-07-03

Per-source, per-repo implementation status for the HZDR DAMNIT pipeline data-transfer
protocols. See `integration-roadmap.md` for the full work-order history; see
`remaining-work-plan.md` for next-steps detail on open items.

**Status legend**
- ✅ implemented and committed (code or config in place)
- 🟡 code done; human gate or ops step remaining
- 🔴 not yet started or blocked on external access
- ⬜ deferred (lower priority, no pilot dependency)

---

## Source 1: shotcounter → DAMNIT via Kafka (`draco.trigger`)

**Transport:** Kafka (topic `draco.trigger`, registered in `kafka-broker-docker/topics.env`)
**Protocol:** `hzdr-event-v1` JSON envelope, manual-commit consumer group
**Branch status:** producer on `feature/hzdr-canonical-trigger-event` (not yet merged to main)

| Repo | What | Status |
|------|------|--------|
| **shotcounter** | `hzdr-event-v1` envelope: `schema_version`, stable `event_id`, canonical `experiment_id`, UTC timestamp | ✅ on branch, 24/24 tests pass |
| **shotcounter** | `trigger_role` folded into `metadata.trigger.role` at the producer — wire format is now strictly closed | ✅ on branch |
| **shotcounter** | Kafka key `<experiment_id>:<channel_id>` for per-stream ordering | ✅ on branch |
| **shotcounter** | `IsShotCounterXX` per-channel gating (default `False`, opt-in); startup warning when all False + KafkaEnabled | ✅ on branch; decision: keep default False |
| **shotcounter** | `scripts/kafka_smoke_test.py` — produce/consume roundtrip against real broker | ✅ written, verified green locally against `kafka-broker-docker` |
| **shotcounter** | Smoke test on **deployment broker** with `KafkaEnabled=1` + one full-device run | 🟡 only remaining gate before merge |
| **shotcounter** | Merge `feature/hzdr-canonical-trigger-event` → main | 🟡 blocked on deployment-broker smoke test |
| **DAMNIT** | `KafkaSpoolConsumer` (`consumer/kafka.py`): manual-commit, claim→write+fsync→ack→dedup | ✅ committed to main |
| **DAMNIT** | `_normalize_hzdr_event_v1_trigger`: normaliser route for the canonical envelope; migration shim drops legacy `trigger_role` | ✅ committed |
| **DAMNIT** | `DW_API_HZDR_KAFKA_SPOOL__TOPICS=["draco.trigger","planet.watchdog.events"]` in `.env.production.example` | ✅ committed |
| **DAMNIT** | 6 offline/in-process tests (`test_hzdr_kafka_spool.py`) + 4 docker-gated tests (`test_hzdr_broker_roundtrip.py`) | ✅ committed |
| **DAMNIT** | `test-all.ps1 -DockerTests` opt-in for real-broker integration suite | ✅ committed |
| **DAMNIT** | Real restart/replay pass on deployment broker | 🟡 test infrastructure ready; manual pass not yet run |
| **kafka-broker-docker** | `topics.env` topic registry (canonical reference for `draco.trigger`) | ✅ committed |
| **kafka-broker-docker** | `hzdr/scripts/sync-hzdr-event.ps1` conformance check for producer defaults | ✅ committed |

**Outstanding:** one human step — run `kafka_smoke_test.py` against the deployment
broker, then merge the shotcounter branch.

---

## Source 2: planet-watchdog → DAMNIT via Kafka (`planet.watchdog.events`)

**Transport:** Kafka (topic `planet.watchdog.events`, registered in `kafka-broker-docker/topics.env`)
**Protocol:** `hzdr-event-v1` JSON envelope, same consumer-side path as Source 1
**Branch status:** all code committed to `master`

| Repo | What | Status |
|------|------|--------|
| **planet-watchdog** | `KafkaEventProducer` in `messaging/kafka_output.py`; `build_hzdr_event()` produces canonical envelope from Watchdog documents | ✅ committed |
| **planet-watchdog** | `payload_ref` carries file URI/path + Kafka `topic/partition/offset` from any attached `kafka_data` message | ✅ committed |
| **planet-watchdog** | Deterministic `event_id` (sha256 of `experiment_id + watch_name + timestamp + filepath + shot_number`) | ✅ committed |
| **planet-watchdog** | Kafka key `<experiment_id>:<watch_name>` for per-stream ordering | ✅ committed |
| **planet-watchdog** | Startup CONFIG_WARNINGS when `output_experiment_id` is empty or `bootstrap_servers` is default | ✅ committed |
| **planet-watchdog** | `output_topic` default is `planet.watchdog.events` (matches registry) | ✅ committed |
| **planet-watchdog** | Production `settings/watchdog.json` pointed at real broker + canonical campaign | 🟡 ops config step; no code change needed |
| **planet-watchdog** | `IsShotCounterXX`-gated authoritative shot number in event | 🔴 blocked on: shotcounter branch merge + shot-number authority wired end-to-end |
| **DAMNIT** | `KafkaSpoolConsumer` consumes `planet.watchdog.events` topic (same consumer as Source 1) | ✅ committed |
| **DAMNIT** | `WATCHDOG_KAFKA_TOPIC` constant in `metadata/routers.py` | ✅ committed |
| **DAMNIT** | Real restart/replay pass with watchdog events on deployment broker | 🟡 test infrastructure ready; pass not yet run |
| **kafka-broker-docker** | `topics.env` registry entry for `planet.watchdog.events` | ✅ committed |

**Outstanding:** (a) ops config — point the deployment watchdog at the real broker;
(b) real-broker restart/replay pass; (c) authoritative shot number (after shotcounter merge).

---

## Source 3: labfrog-sqlite-tools → DAMNIT via shared filesystem (SQLite/NeXus)

**Transport:** Shared filesystem; export drop-in location configurable
**Protocol:** Curated SQLite + NeXus file pair, with `bundle-complete.json` marker
**Branch status:** all committed to `main`

| Repo | What | Status |
|------|------|--------|
| **labfrog-sqlite-tools** | `experiment_id`, beamtime provenance, schema v10 target catalog columns, migration, transform/export/NeXus plumbing | ✅ committed |
| **labfrog-sqlite-tools** | Atomic export: temp-file + fsync + rename for SQLite and NeXus | ✅ was already in `write_sqlite`; confirmed |
| **labfrog-sqlite-tools** | `bundle-complete.json` completion marker (atomic rename, per-file sha256) signals the pair is ready | ✅ committed |
| **labfrog-sqlite-tools** | Opt-in immutable `retain_exports` snapshots via `export-campaign` CLI | ✅ committed |
| **labfrog-sqlite-tools** | Linking columns in curated SQLite: `kafka_event_id`, `kafka_topic/partition/offset`, `damnit_*` hints | ✅ committed (curated schema v7/v8) |
| **labfrog-sqlite-tools** | Schedule campaign-scoped exports (cron/systemd) | ⬜ external infra; not yet decided |
| **DAMNIT** | `read_labfrog_sqlite_shots()` reads curated SQLite; preserves all linking columns | ✅ committed |
| **DAMNIT** | Size guard (< 1 KiB → `ValueError`) catches a partially written export before opening | ✅ committed |
| **DAMNIT** | Identity-first matcher uses `kafka_event_id` → transport position → same-day TANGO shot number → timestamp | ✅ committed |
| **DAMNIT** | `_mark_superseded_labfrog_rows()` — non-active duplicates flagged, not matched | ✅ committed |
| **labfrog** | Map MediaWiki campaign choice to canonical `experiment_id`; store UTC timezone fields | ✅ merged to `develop` |
| **labfrog** | Store/import authoritative TANGO shot number | 🔴 blocked on: shotcounter merge + shot-number authority wired end-to-end |

**Outstanding:** (a) schedule exports (external infra decision);
(b) authoritative TANGO shot number in labfrog (post-shotcounter merge).

---

## Source 4: ASAPO → DAMNIT via HTTP harness / real SDK

**Transport:** HTTP (`GET /api/claim`, `POST /api/ack`); harness broker local, real SDK pending
**Protocol:** `hzdr-event-v1` JSON envelope; same claim→write+fsync→ack→dedup loop
**Branch status:** harness + consumer committed; SDK swap pending

| Repo | What | Status |
|------|------|--------|
| **asapo-for-hzdr-damnit** | Local HTTP broker (`tools/local_message_suite.py`) proves claim-before-ack, flush/fsync-before-ack, campaign-scoped group offsets, replay dedup | ✅ committed |
| **asapo-for-hzdr-damnit** | Example files use canonical `hzdr-event-v1` schema-version string | ✅ committed |
| **asapo-for-hzdr-damnit** | `drop-in/consumer.env.example` documents both HTTP-harness and real ASAPO modes | ✅ committed |
| **asapo-for-hzdr-damnit** | Real ASAPO SDK consumer/producer in `tools/local_message_suite.py` (`--transport asapo`): `asapo_consumer.create_consumer()` + `asapo_producer.create_producer()` | committed as an ASAPO-compatible sidecar/harness path |
| **asapo-for-hzdr-damnit** | `drop-in/consumer.ps1` supports `DAMNIT_CONSUMER_TRANSPORT=asapo` to drive the SDK consumer | ✅ committed |
| **DAMNIT** | `AsapoSpoolConsumer` (`consumer/asapo.py`): httpx async client, same base loop as Kafka consumer | ✅ committed |
| **DAMNIT** | `DW_API_HZDR_SPOOL__BROKER_URL` required when enabled (no default — prevents silent connection to localhost) | ✅ committed |
| **DAMNIT** | 11 tests in `test_hzdr_spool.py` against live in-process harness broker | ✅ committed |
| **DAMNIT** | Consume LaserData/ASAPO through the `asapo-for-hzdr-damnit` sidecar writing DAMNIT spool JSONL | preferred follow-up path; not a Kafka pilot blocker |
| **DAMNIT** | Gated integration test for real ASAPO sidecar against broker | deferred until LaserData/package/broker access is available |
| **DAMNIT** | Large-array externalisation: `payload_ref.uri` instead of inline `values` for payloads > 64 KiB | ✅ committed — `RealAsapoSpoolConsumer` drops oversized inline `values`, preserves a generated ASAPO `payload_ref.uri`, and leaves the builder size guard as a backstop |

**Outstanding:** ASAPO is not in the Kafka pilot gate. Watchdog is Kafka-only. ASAPO is relevant for LaserData or a future ASAPO source; the preferred path is the `asapo-for-hzdr-damnit` sidecar writing the same durable JSONL spool. A direct DAMNIT SDK adapter can wait until compatible wheels exist for DAMNIT's target runtime. Large-array externalisation (`payload_ref.uri`) is committed in DAMNIT's direct ASAPO adapter; the separate `asapo-for-hzdr-damnit` sidecar/producers should mirror the same policy before real LaserData rollout.

---

## Cross-cutting

| Item | Status |
|------|--------|
| Canonical `HZDREventV1` Pydantic model (authoritative in DAMNIT) | ✅ committed |
| Vendored `hzdr_event.py` byte-identical in planet-watchdog; JSON-Schema fixtures in shotcounter | ✅ committed |
| `hzdr/scripts/sync-hzdr-event.ps1` checks (or `-Apply` fixes) all vendored copies and topic defaults | ✅ committed |
| `kafka-broker-docker/topics.env` — single canonical topic name registry | ✅ committed |
| `test-pilot-package.ps1 -NoCoverage` is the offline pilot package gate for DAMNIT, LabFrog, LabFrog SQLite tools, DAQ File Watchdog, and shotcounter; ASAPO is excluded by default | ✅ committed and green locally 2026-07-03 |
| `test-all.ps1` runs all 6 sibling suites + contract sync check in one command | ✅ committed |
| `test-all.ps1 -DockerTests` adds real-broker integration suite | ✅ committed |
| Offline four-source integration test (`test_hzdr_integration.py`) | ✅ committed |
| Versioned JSON Schema publication (public URL for `hzdr-event-vN.schema.json`) | ⬜ deferred until a second schema version is needed |
| `shot_key` in table row-selection and review actions (UI refactor) | ⬜ post-pilot; tracked separately |
| SciCat registration from builder post-step + `payload_ref.scicat_pid` | 🟡 `scicat_plugin` exists; DAMNIT builder wiring not yet done |
