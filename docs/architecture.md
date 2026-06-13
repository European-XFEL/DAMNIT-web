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

Every transport event should converge on this model:

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
  "payload_ref": {},
  "values": null,
  "metadata": {}
}
```

`shot_number` is optional only when unavailable. TANGO's shot counter is the
authority; channel counters, 10 Hz counters, Kafka offsets, and nicknames are
not substitutes. `Draco01` to `Draco16` are stable channel IDs. Nicknames remain
free operator display text.

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
