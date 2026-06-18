# Handoff

Updated: 2026-06-18

## Current State

All integration branches tested and committed. DAMNIT-web-hzdr suite:
`150 passed, 1 skipped`.

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
  `ShotNumber` with debounce — 18/18 tests pass, not yet merged to main.
- **planet-watchdog** (`master`): normalized Kafka/HZDR event builder committed;
  `kafka_output.py` correctly copies `topic/partition/offset` into `payload_ref`.
- **asapo-for-hzdr-damnit** (`main`): local harness proves correct
  claim/flush/ack/dedup pattern; example files use canonical `hzdr-event-v1`
  schema-version string. All committed.

## Start Next

In priority order — see [integration-roadmap.md](integration-roadmap.md) for
the full status table.

1. **Merge `shotcounter` branch**: gate is one manual Kafka smoke test with
   `KafkaEnabled=1` against a local broker, plus a decision on whether any
   `IsShotCounterXX` channel should default to `True` in real deployments.
2. **Capture one real pilot sequence** and run the go-live gate in
   [integration-roadmap.md](integration-roadmap.md).
3. **Implement durable campaign spool** — see `§Durable Spool Design` in
   [integration-roadmap.md](integration-roadmap.md).

The canonical model is in [architecture.md](architecture.md). Avoid adding new
matching logic in producer repositories.
