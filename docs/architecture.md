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

LabFrog Mongo `_id` remains the exact record/version identity.

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

`values` is for small structured scalar values only (`dict[str, JsonValue]`,
default `None`) - things like a single ADC reading or a handful of derived
numbers. Large datasets do not belong here; represent them with a
URI/path/object-store/SciCat/Mongo reference in `payload_ref` instead.

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
interpreted in the campaign timezone. DAMNIT matches in this order:

1. Same local date and shot number.
2. Same shot number and unique nearest timestamp within tolerance.
3. Unique nearest timestamp within tolerance.
4. Otherwise retain the event as ambiguous or unmatched.

The result records `match_status`, `match_quality`, and `match_time_delta_s`.
No ambiguous event is silently attached.

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
