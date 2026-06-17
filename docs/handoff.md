# Handoff

Updated: 2026-06-17

## Current State

All integration branches tested and committed. Full suite: `139 passed, 1 skipped`.

- **DAMNIT-web-hzdr** (`main`): canonical `HZDREventV1` model; atomic catalog
  writes; single-writer builder lock; ambiguous/unmatched events in API; real
  Confirm Matches UI; local acceptance script; shared example payloads and
  anonymized SQLite fixture.
- **labfrog** (`feature/open-sqlite-explorer`): `experiment_id` derived from
  MediaWiki campaign choice; UTC timezone fields committed.
- **labfrog-sqlite-tools-repo** (`main`): `experiment_id` plumbed through
  SQLite schema, migrations, transform, export, and NeXus writer.
- **shotcounter** (`feature/hzdr-canonical-trigger-event`): canonical
  `hzdr-event-v1` Kafka envelope, `TriggerRole`, operator-configurable
  `ShotNumber` with debounce — 18/18 tests pass, not yet merged to main.
- **planet-watchdog** (`master`): normalized Kafka/HZDR event builder committed.
- **asapo-for-hzdr-damnit** (`main`): local harness proves correct
  claim/flush/ack/dedup pattern — 3 example files have an uncommitted
  `schema_version` string fix.

## Start Next

In priority order — see [integration-roadmap.md](integration-roadmap.md) for
the full status table.

1. **Merge `shotcounter` branch**: gate is one manual Kafka smoke test with
   `KafkaEnabled=1` against a local broker, plus a decision on whether any
   `IsShotCounterXX` channel should default to `True` in real deployments.
2. **Commit asapo example fix**: three files in `asapo-for-hzdr-damnit/examples/`
   have an uncommitted `"hzdr.source-event/1"` → `"hzdr-event-v1"` change.
3. **Wire shotcounter's Kafka envelope into DAMNIT's normalizer**: today
   `normalize_processed_trigger_message` reads only the legacy ZMQ relay.
4. **Decide catalog-edit persistence**: operator confirm/dismiss is currently
   lost on next builder run — decide merge-on-rebuild vs. stopgap.
5. **Capture one real pilot sequence** and run the go-live gate in
   [integration-roadmap.md](integration-roadmap.md).

The canonical model is in [architecture.md](architecture.md). Avoid adding new
matching logic in producer repositories.
