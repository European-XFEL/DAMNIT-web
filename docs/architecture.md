# Architecture And Models

## Vision

LabFrog owns campaign and shot context. Transport systems publish immutable
source events. DAMNIT performs matching once and publishes one canonical
campaign view.

```text
DRACO/TANGO -> Kafka --------+
LaserData -> ASAPO ----------+--> durable event spool --> DAMNIT reconciler
Watchdog -> Kafka -----------+                              |
LabFrog -> Mongo/SQLite/NeXus+                              v
                                              canonical NeXus + catalog
                                                        |
                                                   API + frontend
```

Producers must not edit the canonical NeXus file or make independent timestamp
matching decisions.

## Pilot Identity

```text
LabFrog campaign: Solenoid Beamline Tests 01.2025
experiment_id:    Solenoid_Beamline_Tests_01.2025
source_key:       hzdr-solenoid-beamline-tests-01-2025
timezone:         Europe/Berlin
```

Shot numbers may restart each day. The canonical shot key is:

```text
<experiment_id>:<local YYYYMMDD>:<shot_number padded to 6>
```

LabFrog Mongo `_id` remains the exact record/version identity. API clients
should prefer `shot_key` for shot detail links; plain `shot_number` routes remain
for compatibility but are ambiguous when counters restart or LabFrog keeps
multiple versions of a shot row.

## Event Envelope

Every transport event should converge on this model, implemented once as the
canonical `HZDREventV1` Pydantic model and vendored identically (kept in sync
by hand) in each producer/consumer that does not share a Python package with
DAMNIT-web-hzdr today:

- `planet-watchdog/watchdog_core/hzdr_event.py`
- `DAMNIT-web-hzdr/api/src/damnit_api/metadata/hzdr_event.py`
- the shotcounter producer (`hzdrTangoDSShotcounter`), which builds a
  plain-dict event of the same shape

```json
{
  "schema_version": "hzdr-event-v1",
  "event_id": "stable retry-safe ID",
  "experiment_id": "Solenoid_Beamline_Tests_01.2025",
  "shot_id": "shot-000001",
  "shot_number": 1,
  "source": "LaserData | PLANET-Watchdog | DRACO-Trigger",
  "kind": "producer-defined type",
  "timestamp": "2025-01-16T08:00:00Z",
  "transport": "asapo | kafka | zmq",
  "payload_ref": {
    "topic": null,
    "partition": null,
    "offset": null,
    "uri": null,
    "path": null,
    "message_key": null,
    "mongo_id": null,
    "scicat_pid": null
  },
  "values": null,
  "metadata": {}
}
```

LabFrog curated SQLite exports may also carry linking columns such as
`kafka_event_id`, `kafka_topic`, `kafka_partition`, `kafka_offset`,
`damnit_shot_key`, and `damnit_match_quality`. DAMNIT uses those fields as
reconciliation hints/provenance, but still publishes its canonical result in
the NeXus bridge and `hzdr_sources.json` catalog.

### `shot_number`

`shot_number` is a required *key*, but its value is nullable
(`int | None`). TANGO's shot counter is the authority; channel counters,
10 Hz counters, Kafka offsets, and nicknames are not substitutes.
`Draco01` to `Draco16` are stable channel IDs. Nicknames remain free operator
display text.

A null `shot_number` means no authoritative shot number is available yet for
this event - that is expected, not an error, while LabFrog/DRACO do not yet
propagate one end to end (see Pilot Identity and the integration roadmap).
Producers are not blocked from emitting an event just because they lack an
authoritative shot number.

PLANET-Watchdog may still observe a non-authoritative, nested/local shot
number (e.g. whatever is embedded in an attached DRACO/ZMQ payload). It may
carry that value as the canonical `shot_number` rather than leaving it null,
but only together with explicit provenance in `metadata` (e.g.
`metadata.shot_number_provenance = {"authoritative": false, ...}`) so a
consumer can never mistake it for TANGO's authoritative counter.

### `payload_ref`

`payload_ref` is the canonical source traceability object - it is what must
let a consumer replay or trace an event back to its source record.
`metadata` is not a substitute for this: core traceability belongs in
`payload_ref`, even though `metadata.kafka_data`/`metadata.zmq_data` may also
be kept for backward compatibility or debugging convenience.

At minimum, Kafka-sourced events should populate `topic`, `partition`, and
`offset`. `uri`/`path` cover file-backed sources. `message_key` is the
transport message key when available. `mongo_id`/`scicat_pid` are populated
only when a real Mongo `_id` or SciCat PID already exists - producers must
never invent one. Producer-specific extra references (e.g. `channel_id`,
`run_id`, `record_id`, `nexus_path`) may be attached directly on
`payload_ref` alongside the standard fields.

### `values` and large payloads

`values` is for small JSON scalar, object, or array values only (default
`None`) - things like a single ADC reading, a short waveform, or a handful of
derived numbers. Large datasets do not belong here; represent them with a
URI/path/object-store/SciCat/Mongo reference in `payload_ref` instead.

"Small" is enforced when staged events are loaded: `check_values_size`
(`hzdr_event.py`) rejects a `values` payload with more than
`MAX_VALUES_ITEMS` (4096) leaf items - counted recursively, so a nested image
array counts every element - or one that serializes to more than
`MAX_VALUES_BYTES` (64 KiB) of JSON. The error names the offending file and
tells the producer to move the data behind `payload_ref`, so an oversized
payload fails the build loudly at staging time rather than bloating the NeXus
file silently.

### `metadata`

`metadata` is a free-form JSON object for extra detail that is not part of
the contract above. Consumers that need a flat storage row (e.g. SQLite,
NeXus attributes) are expected to serialize the whole object to one
JSON-text column/dataset themselves - the same convention
`labfrog-sqlite-tools` already uses for its own `metadata_json`/
`parameters_json`/`options_json` columns. The model does not flatten it for
them.

## Matching

Transport timestamps must be timezone-aware UTC. Naive LabFrog times are
interpreted in the campaign timezone. DAMNIT prefers deterministic identity and
TANGO shotcounter matches, with timestamp matching available as a disambiguator
and fallback:

1. Exact LabFrog/Kafka event identity (`kafka_event_id`) when a curated export
   already captured the same `hzdr-event-v1` message.
2. Exact transport position (`topic`, `partition`, `offset`) when present in
   both the event `payload_ref` and LabFrog curated SQLite row. This match is
   intentionally not date-scoped: it trusts that a `(topic, partition, offset)`
   is globally unique and stable, so the curated export writers must persist the
   original committed offset and never rewrite or renumber it. If a topic is
   ever recreated/compacted so offsets are reused, drop to `kafka_event_id`
   identity matching (step 1) instead.
3. Same local date and TANGO/shotcounter `shot_number`.
4. Same local date and `shot_number`, resolved by unique nearest timestamp when
   duplicate current LabFrog rows remain.
5. Same `shot_number` and unique nearest timestamp within tolerance.
6. Unique nearest timestamp within tolerance.
7. Otherwise retain the event as ambiguous or unmatched.

Archived/superseded LabFrog rows from curated exports are kept as provenance but
are excluded from automatic matching when an active row for the same
campaign/date/shot number exists. The result records `match_status`,
`match_quality`, and `match_time_delta_s`. No ambiguous event is silently
attached.

## Canonical Outputs

The LabFrog NeXus structure is preserved and DAMNIT adds:

```text
/entry/shots          canonical shot rows and match provenance
/entry/source_events  normalized events, including unmatched events
/entry/data_products  files and internal dataset references
/entry/laserdata      embedded small event arrays
/entry/watchdog       Watchdog-derived values when present
```

`hzdr_sources.json` exposes the file through the HZDR API. `runs.sqlite` is an
optional future projection for legacy DAMNIT table workflows, not the source of
truth.

## Production Rules

- Stage and flush events before acknowledging Kafka or ASAPO.
- Deduplicate by `event_id` and transport position.
- Use one writer per campaign.
- Build and validate temporary outputs, then publish atomically.
- Publish the NeXus file and source catalog from the same reconciliation result.
- Keep source exports and spools for replay and audit.
