# Integration Roadmap

Updated: 2026-06-16

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
- Canonical `HZDREventV1` event model, shared by `hzdr_sources.py` and
  `hzdr_nexus.py` instead of independently maintained field lists.
- Atomic `hzdr_sources.json` publication (temp file + rename) at every write
  site, and explicit dedup-by-`event_id`/corrupt-JSONL handling in the
  reconcile step.
- Single-writer locking around `hzdr-hdf5-builder.py` for each output NeXus
  path, with stale-lock recovery when the holder process has exited.
- A real operator review UI (Confirm Matches) backed by
  `GET/POST .../review`, replacing the old client-side-fabricated
  `/link-shot-records` page.
- A local, sibling-repo-free HTTP acceptance script
  (`api/scripts/hzdr-local-acceptance.py`) exercising the same vertical
  slice end to end.

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

Done in the current integration branch:

- Map MediaWiki campaign choice to canonical `experiment_id` and store it
  alongside the unchanged human-readable `Campaign` field.

Still needed:

- Store/import the authoritative TANGO shot number where available.
- Document or emit timezone-aware `date_time`.
- Document that stable Mongo record IDs and current/superseded version
  semantics are already implemented, then remove them from open work tracking.

### `GitLab/labfrog-sqlite-tools-repo`

Code changes are applied and its suite passes, including the `experiment_id`
column/migration and NeXus export plumbing. Operationally:

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

The contract examples/tests are pushed. The local broker harness now proves
claim-before-ack, flush/fsync-before-ack, campaign-scoped group offsets, and
replay deduplication by `event_id`/message ID. Production still needs a
supervised consumer that:

- Uses a named consumer group and campaign routing.
- Carries the proven write-and-flush-before-ack pattern into the real consumer.
- Preserves stream, data source, and message ID in `payload_ref`.
- References large arrays externally instead of embedding them in JSON.
- Restarts from its saved position and tolerates replay in a real broker test.

### `GitLab/shotcounter` (DRACO/TANGO Trigger Publisher)

Now in the integration workspace: `GitLab/shotcounter` is the PyTango device
server that succeeded `draco-shotcounter`. Branch
`feature/hzdr-canonical-trigger-event` adds:

- `schema_version`, stable `event_id`, canonical `experiment_id`, UTC timestamp,
  and a provisional `shot_number` (10 Hz counter; not yet TANGO-authoritative).
- Machine-readable `trigger_role` via a new `TriggerRoleXX` attribute; not
  inferred from `Nickname`.
- Kafka key `<experiment_id>:<channel_id>` for ordering.
- A long-lived producer and retry with the same `event_id`.

`Name` remains the stable channel and current counters remain metadata.
Still needed: run the branch's tests in a real `pytango`/Kafka environment
(not available where the branch was authored), merge, and replace
`shot_number` with a TANGO-authoritative value once that exists upstream.
See [second-opinion.md](second-opinion.md) section 2.5 for detail.

### `GitHub/DAMNIT-web-hzdr`

Done: canonical event model, atomic `hzdr_sources.json` publication, staged
event dedup, single-writer builder locking, and a real Confirm Matches review
UI (see "Where We Are" above).

Still needed:

- Versioned Pydantic/JSON Schema validation for staged events.
- Durable per-campaign spool with transport positions and deduplication state.
- Decide whether catalog edits (confirm/dismiss, manual shot corrections)
  should survive a rebuild, and implement that decision
  ([second-opinion.md](second-opinion.md) Section 7).
- Real flow-monitor backend health (Kafka/ASAPO/Mongo); today's flow-monitor
  status panel is presentation only, derived from already-loaded catalog
  data.
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
