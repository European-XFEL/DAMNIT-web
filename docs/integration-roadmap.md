# Integration Roadmap

Updated: 2026-06-13

## Where We Are

Completed and tested:

- DAMNIT adapters for normalized ASAPO events, raw Watchdog documents, and
  legacy DRACO `processed_message` payloads.
- Date-scoped identity and centralized timestamp reconciliation.
- LabFrog Mongo, SQLite, and rich NeXus readers.
- Canonical NeXus bridge, source catalog, API models, frontend views, and local
  emulator.
- Atomic LabFrog SQLite/NeXus export changes.
- Watchdog normalized HZDR Kafka output and Mongo credential correction.
- ASAPO timestamp/identity example contract.
- Offline four-source integration test.

The remaining work is operational integration, not another data-model redesign.

## Work Order

1. Capture one real pilot sequence from all producers.
2. Finish producer metadata at the DRACO/TANGO boundary.
3. Implement durable ASAPO and Kafka ingestion into one campaign spool.
4. Add deduplication, locking, validation, and atomic publication around the
   existing DAMNIT builder.
5. Connect API/frontend flow status to those real services.
6. Run the replayable pilot acceptance test.

## Repository Responsibilities

### `GitLab/labfrog`

Still needed:

- Map MediaWiki campaign choice to canonical `experiment_id`.
- Store/import the authoritative TANGO shot number where available.
- Document or emit timezone-aware `date_time`.
- Preserve stable Mongo record IDs and current/superseded version semantics.

### `GitLab/labfrog-sqlite-tools-repo`

Code changes are applied and its suite passes. Operationally:

- Schedule campaign-scoped exports.
- Publish completed SQLite/NeXus pairs by atomic rename or completion marker.
- Retain each source export used for a canonical build.
- Keep DAMNIT output separate from the immutable LabFrog export.

### `GitLab/planet-watchdog`

Code changes are applied and its focused suite passes. Still needed:

- Configure the canonical campaign and output topic in deployment.
- Ensure the authoritative shot number reaches the normalized event.
- Preserve Kafka topic, partition, offset, file URI, and Mongo/SciCat identity.
- Run a real broker roundtrip and restart/replay test.

### `GitLab/asapo-for-hzdr-damnit`

The contract examples/tests are pushed. Production still needs a supervised
consumer that:

- Uses a named consumer group and campaign routing.
- Writes and flushes normalized JSONL before acknowledge.
- Preserves stream, data source, and message ID in `payload_ref`.
- References large arrays externally instead of embedding them in JSON.
- Restarts from its saved position and tolerates replay.

### DRACO/TANGO Trigger Publisher

This producer repository is still outside the integration workspace. Add:

- `schema_version`, stable `event_id`, canonical `experiment_id`, UTC timestamp,
  and authoritative `shot_number` when available.
- Machine-readable `trigger_role`; do not infer it from `Nickname`.
- Kafka key `<experiment_id>:<channel_id>` for ordering.
- A long-lived producer and retry with the same `event_id`.

Keep `Name` as the stable channel and retain current counters as metadata.

### `GitHub/DAMNIT-web-hzdr`

Still needed:

- Versioned Pydantic/JSON Schema validation for staged events.
- Durable per-campaign spool with transport positions and deduplication state.
- Single-writer orchestration around `hzdr-hdf5-builder.py`.
- Temporary build, HDF5 validation, and atomic NeXus/catalog publication.
- Real flow-monitor health and unmatched/ambiguous review.
- Optional `runs.sqlite` projection only if legacy table workflows require it.
- Production auth, storage, backup, logging, and restart configuration.

## Go-Live Gate

Replay one captured `Solenoid Beamline Tests 01.2025` sequence. Restart and
replay each consumer, then verify:

- no lost acknowledged events;
- no duplicate events or products;
- correct date-scoped shot keys;
- explicit matched, ambiguous, and unmatched counts;
- atomic file replacement while the API is reading;
- source, shot, provenance, and preview views in the frontend;
- reproducible output from retained exports and spools.
