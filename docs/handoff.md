# Handoff

Updated: 2026-06-17

## Current State

All integration branches tested. DAMNIT-web-hzdr suite: `150 passed, 1 skipped`
(local-only changes not yet committed to main).

- **DAMNIT-web-hzdr** (`main` + local uncommitted): canonical `HZDREventV1`
  model; atomic catalog writes; single-writer builder lock; ambiguous/unmatched
  events in API; real Confirm Matches UI; local acceptance script; shared example
  payloads and anonymized SQLite fixture. **Local-only additions (not yet
  committed):**
  - `hzdr_sources.review.jsonl` sidecar — operator confirm/dismiss survives
    builder reruns; precedence `VERIFIED > REVIEWED > BASE`.
  - `_normalize_hzdr_event_v1_trigger` — `normalize_processed_trigger_message`
    now accepts the flat `hzdr-event-v1` Kafka envelope that shotcounter emits
    (no `processed_message` wrapper; `trigger_role` at top level).
  - Integration test fixture: watchdog `_kafka` now includes `partition`; test
    asserts `topic/partition/offset` all land in `payload_ref`.
  - `integration-roadmap.md`: steps 3–4 marked 🔄, `§Durable Spool Design`
    section added.
- **labfrog** (`feature/open-sqlite-explorer`): `experiment_id` derived from
  MediaWiki campaign choice; UTC timezone fields committed.
- **labfrog-sqlite-tools-repo** (`main`): `experiment_id` plumbed through
  SQLite schema, migrations, transform, export, and NeXus writer.
- **shotcounter** (`feature/hzdr-canonical-trigger-event`): canonical
  `hzdr-event-v1` Kafka envelope, `TriggerRole`, operator-configurable
  `ShotNumber` with debounce — 18/18 tests pass, not yet merged to main.
- **planet-watchdog** (`master`): normalized Kafka/HZDR event builder committed;
  `kafka_output.py` correctly copies `topic/partition/offset` into `payload_ref`.
- **asapo-for-hzdr-damnit** (`main`): local harness proves correct
  claim/flush/ack/dedup pattern — 3 example files have an uncommitted
  `schema_version` string fix.

## Start Next

In priority order — see [integration-roadmap.md](integration-roadmap.md) for
the full status table.

1. **Commit DAMNIT-web-hzdr local work** — review sidecar, normalizer,
   watchdog fixture, docs updates.
2. **Merge `shotcounter` branch**: gate is one manual Kafka smoke test with
   `KafkaEnabled=1` against a local broker, plus a decision on whether any
   `IsShotCounterXX` channel should default to `True` in real deployments.
3. **Commit asapo example fix**: three files in `asapo-for-hzdr-damnit/examples/`
   have an uncommitted `"hzdr.source-event/1"` → `"hzdr-event-v1"` change.
4. **Capture one real pilot sequence** and run the go-live gate in
   [integration-roadmap.md](integration-roadmap.md).
5. **Implement durable campaign spool** — see `§Durable Spool Design` in
   [integration-roadmap.md](integration-roadmap.md).

The canonical model is in [architecture.md](architecture.md). Avoid adding new
matching logic in producer repositories.
