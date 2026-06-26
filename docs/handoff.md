# Handoff

Updated: 2026-06-26

## Current State

All integration branches tested and committed. DAMNIT-web-hzdr suite:
`186 passed, 4 skipped`.

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

## Built 2026-06-18

- `api/src/damnit_api/consumer/spool.py` — `HZDRSpoolConsumer` base + `SpoolConfig`; claim→write-fsync→ack→dedup loop
- `api/src/damnit_api/consumer/asapo.py` — `AsapoSpoolConsumer`; talks to harness HTTP API and real ASAPO broker alike; activated by `DW_API_HZDR_SPOOL__ENABLED=true`
- `shared/settings.py` — `HZDRSpoolSettings` (`DW_API_HZDR_SPOOL__*`) and `HZDRHealthSettings` (`DW_API_HZDR_HEALTH__*`)
- `main.py` — lifespan wires spool consumer as background asyncio task when enabled
- `shared/routers.py` — `GET /config/health` returns `FlowMonitorHealth` with async ASAPO/Kafka/Mongo probes (2 s timeout each)
- `api/.env.production.example` — full production env template
- `scripts/damnit-api.service` — systemd unit template
- `api/tests/test_hzdr_spool.py` — 11 new tests (unit + integration against live harness broker)
- Suite: **161 passed, 1 skipped**

## Start Next

1. **Merge `shotcounter` branch** — gate is one manual Kafka smoke test with
   `KafkaEnabled=1` against a local broker, plus confirming `IsShotCounterXX`
   defaults for production.
2. **Swap ASAPO SDK into `AsapoSpoolConsumer`** — replace the harness HTTP
   client with `asapo_consumer.create_consumer(...)` when a real broker is
   available; the loop logic is unchanged.
3. **Capture one real pilot sequence** and run the go-live gate in
   [integration-roadmap.md](integration-roadmap.md).

The canonical model is in [architecture.md](architecture.md). Avoid adding new
matching logic in producer repositories.
