# Architecture And Models

## Vision

LabFrog owns campaign and shot context. The shot authority (planet-watchdog
on fwkt-webapps, since 2026-10-02) owns the shot number: it numbers every
shotcounter trigger and publishes the `draco.trigger` event whose
`shot_number`/`shot_id` the other producers key off. Transport systems publish
immutable source events. DAMNIT performs matching once and publishes one
canonical campaign view.

```text
shotcounter (TANGO) --ZMQ :2950--> shot authority (planet-watchdog, fwkt-webapps)
                                        |
                                        +-- ZMQ :2951 (shot_number) --> LabFrog -> Mongo/SQLite export --+
                                        +-- ZMQ :2951 (shot_number) --> DAQ File Watchdog -> Kafka ------+
                                        +-- Kafka draco.trigger (experiment_id "unassigned") -----------+
                    LaserData -> ASAPO (optional) -----------------------------------------------------+
                                                                                                       |
                                                                          durable event spool <--------+
                                                                                  |
                                                                          DAMNIT reconciler
                                                                                  |
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

For a shot that comes from LabFrog, the number in the canonical shot key is
the LabFrog row's own `shot_number`, which an operator may type and which can
start again every day (radbio types 1-70 daily). The key
(`hzdr_nexus.make_shot_key`) therefore carries the local date:

```text
<experiment_id>:<local YYYYMMDD>:<shot_number padded to 6>
```

LabFrog Mongo `_id` remains the exact record/version identity. API clients
should prefer `shot_key` for shot detail links; plain `shot_number` routes remain
for compatibility but are ambiguous when counters restart or LabFrog keeps
multiple versions of a shot row.

## Campaign Resolution

`experiment_id: "unassigned"` is the registered sentinel
(`UNASSIGNED_EXPERIMENT_ID` in `hzdr_event.py`, decision D1 of the combo's
automatic shot assembly plan) for a producer that does not know which campaign
a shot belongs to. It is an ordinary `hzdr-event-v1` value - the envelope is
unchanged - and it follows the existing `shot_id = "unassigned-<event_id>"`
convention. A producer never guesses a campaign from its own configuration to
avoid sending it.

DAMNIT resolves the campaign before it filters a build's events to one
`experiment_id` (`resolve_event_experiments`, called first thing in
`reconcile_canonical_shots`). An event that already names a campaign keeps it
(`producer`). An `unassigned` event with an authoritative envelope
`shot_number` goes down the chain; first match wins:

1. **LabFrog record** with that `shot_number`, naming exactly one campaign ->
   `labfrog`. A record without its own `experiment_id` belongs to the export
   the build was pointed at.
2. **Campaign schedule** window containing the event time -> `schedule`. The
   schedule is LabFrog's `labfrog-campaign-schedule-v1` export (MediaWiki
   `FWKTBeamtime` dates, decision D4): inclusive calendar days in its
   `timezone`, each the local window `[start 00:00, end + 1 day 00:00)`. Rows
   with a null date never match; a time inside two windows is **not** a match.
   Builder flag `--campaign-schedule`, setting
   `DW_API_HZDR_BUILDER__CAMPAIGN_SCHEDULE`.
3. **A reviewer's ruling** in the review sidecar
   (`append_experiment_ruling`: `{"action": "assign_experiment", "shot_number",
   "experiment_id", "review_level", ...}` in `<catalog>.review.jsonl`, highest
   review level wins) -> `ruling`. A build reads its own sidecar plus any passed
   with `--experiment-rulings`. The writer is Review matches
   (`POST /metadata/hzdr/experiment-rulings`), beside the catalog the API
   serves; the multi-campaign builder shares that catalog, so every build reads
   the same rulings.
4. Otherwise the event stays `unassigned`. It is still built: a build with
   `--experiment-id unassigned` is the `_unassigned` bucket, and review lists
   it there. Nothing is dropped.

The spool consumers write `unassigned` events to a shared
`<spool>/_unassigned/<file>` (deduplicated like the campaign file), and the
builder auto-trigger passes that file to every campaign's build once it
exists, so rebuilding after a ruling or a schedule update re-routes them. The
builder's `--experiment-id` override never rewrites the sentinel on a trigger
envelope, and the sentinel never counts as a second campaign when the builder
infers the experiment id.

**Every campaign in one run** (`--output-root`, setting
`DW_API_HZDR_BUILDER__OUTPUT_ROOT`; `consumer/campaign_builds.py`). The builder
builds every campaign listed in `CAMPAIGNS` or with a spool folder, every
campaign the chain routes an `unassigned` event to, and the `_unassigned`
bucket, into one shared catalog. Step 1 then reads the exports of the listed
and spooled campaigns only, the same records in every build of the run, each
record naming its campaign, so every build routes an event to the same single
campaign and no shot is counted in two. Step 1 keys on the shot authority's
numbers only (ruling R3), so a typed LabFrog number never routes an event:
a row's `authority_shot_number` (export schema 13) and, from schema 14, every
number in the export's `authority_shots` table, so a LabFrog set that claimed
several shots names its campaign for each. Those claimed numbers only route;
they never match an event to the set's row, which is not one shot. Settings and layout:
[deployment plan, Step 2b](plans/deployment-plan.md#every-campaign-at-once-output_root-recommended).

Each canonical shot records the outcome in `/entry/shots/experiment_id_source`
(bridge profile v4): `labfrog` for every LabFrog-backed shot, otherwise the
strongest source among its events.

**Trigger-only shots (plan W6.1).** With LabFrog records present, the
canonical shots are the union of those records and every `DRACO-Trigger` event
with an authoritative `shot_number` that no LabFrog record carries and that the
matcher left unattached. Such a shot is built from its trigger (plus unattached
events of the same local date, number and `shot_id`); its LabFrog columns are
empty, and no synthetic LabFrog source event is cited for it. The union is not
built when the builder preserves a LabFrog **NeXus** projection
(`--labfrog-nexus`), whose `/entry/shots` axis and shot-indexed
`/entry/derived` datasets are fixed to LabFrog's rows; there the trigger stays
a review event, as before.

**Time-based auto-assignment (plan W6.2, ruling A7).** Off by default since
2026-09-30 (`DW_API_HZDR_BUILDER__TIME_MATCH_AUTOASSIGN=false`,
`--no-time-match-autoassign`): matching steps 4-6 below never attach an event;
the shot they would have picked becomes a review candidate (`match_status`
`ambiguous`, `candidate_shot_keys`). A trigger whose number LabFrog lacks can
therefore no longer be pulled onto a neighbouring LabFrog shot by time, and
founds its trigger-only shot; before the ruling, triggers 1 and 3 were merged
into LabFrog shot 2 that way. With it off, numbers are trusted as identity: an
authoritative `shot_number` held by exactly one shot attaches on the number
alone, on any day (step 3a). `true` (`--time-match-autoassign`) restores the
earlier ladder exactly.

## Event Envelope

Every transport event should converge on this model, implemented once as the
canonical `HZDREventV1` Pydantic model and vendored identically in each
producer/consumer that does not share a Python package with DAMNIT-web-hzdr
today:

- `DAMNIT-web-hzdr/api/src/damnit_api/metadata/hzdr_event.py` — **canonical source**
- `planet-watchdog/watchdog_core/hzdr_event.py` — the DAQ-File-Watchdog producer (GitLab repo slug `planet-watchdog`)
- the parked shotcounter branch (`hzdrTangoDSShotcounter`,
  `feature/hzdr-canonical-trigger-event`; not merged, not deployed), which
  builds a plain-dict event of the same shape. Since 2026-10-02 `draco.trigger`
  is produced by the shot authority (`planet-watchdog`), not by shotcounter.

**Canonical source + drift check.** DAMNIT-web-hzdr's copy is authoritative. The
model's JSON Schema and a sample event are exported to a committed artifact
(`api/tests/fixtures/hzdr-event-v1.schema.json` and `.sample.json`, regenerated
with `api/scripts/regen_hzdr_event_fixtures.py`) and vendored byte-identically
into each sibling repo's `tests/fixtures/`. Each repo's `test_hzdr_event.py`
asserts its own model/producer agrees with that fixture, so a copy can no longer
silently drift: a contract change shows up as a fixture diff and as a failing
test in every repo until the copies are re-synced. The producer-side extension
`trigger_role` is a documented exception — shotcounter emits it at the top level
and DAMNIT folds it into `metadata.trigger.role` during normalization.

```json
{
  "schema_version": "hzdr-event-v1",
  "event_id": "stable retry-safe ID",
  "experiment_id": "Solenoid_Beamline_Tests_01.2025",
  "shot_id": "shot-000001",
  "shot_number": 1,
  "source": "LaserData | DAQ-File-Watchdog | DRACO-Trigger",
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
(`int | None`). The shot authority (planet-watchdog, see
`planet-watchdog/docs/SHOT_AUTHORITY.md`) is the only issuer of
`shot_number` since 2026-10-02. The shotcounter's counts are not
substitutes either, like Kafka offsets and nicknames: `Channel_counter`
restarts with the device server, `10Hz_counter` is upstream timing that wraps a
few times a year, and `ShotNumber` exists only on the parked branch.
`Draco01` to `Draco16` are stable channel IDs. Nicknames remain free operator
display text.

A null `shot_number` means the event carries no shot number - that is
expected, not an error, for example a file event the watchdog did not
attribute to a trigger. Producers are not blocked from emitting an event just
because they lack a shot number.

DAQ File Watchdog may still see a local count (e.g. whatever is embedded in
an attached DRACO/ZMQ payload). It keeps that only in `metadata`
(`metadata.local_shot_number`, with
`metadata.shot_number_provenance = {"authoritative": false, ...}`) and leaves
`shot_number` null, so a consumer can never mistake it for the shot
authority's number.

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
`shot_number` matches, with timestamp matching available as a disambiguator
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
3. Same local date and authoritative `shot_number` (from the shot authority,
   `planet-watchdog-shot-authority`).
   3a. By default (time auto-assignment off): the same `shot_number` on any
   day, when exactly one shot holds it (match quality `shot_number`).
4. Same local date and `shot_number`, resolved by unique nearest timestamp when
   duplicate current LabFrog rows remain.
5. Same `shot_number` and unique nearest timestamp within tolerance.
6. Unique nearest timestamp within tolerance.
7. Otherwise retain the event as ambiguous or unmatched.

Steps 4-6 attach only when time auto-assignment is on; by default they propose.

Archived/superseded LabFrog rows from curated exports are kept as provenance but
are excluded from automatic matching when an active row for the same
campaign/date/shot number exists. If more than one row is marked `active`, all
remain current because source status is authoritative, but DAMNIT logs a
source-owner-review warning even when their version numbers match. The result
records `match_status`, `match_quality`, and `match_time_delta_s`. No ambiguous
event is silently attached.

**Not-a-shot records.** A LabFrog record can carry `shot_status`: `shot`,
`misfire`, `test`, `dark` or `calibration` (LabFrog owns the vocabulary;
labfrog-sqlite-tools exports it as `shots.shot_status`, schema v12). This is the
live-flow version of the Laser Shot Aligner's inclusion rule, and DAMNIT only
carries it: every LabFrog-backed shot gets `metadata.shot_status` (`shot` when
the record, or an older export, has none; an unknown value is kept as written
and logged), matching and building ignore it, and a `misfire` is built, matched
and catalogued like any other shot. A trigger-only shot has no LabFrog record,
so it has no `shot_status`. In the NeXus file the value rides the LabFrog
`shotsheet.row` event's `/entry/source_events/metadata_json` (joined on
`shot_key`), and `/entry/shots/shot_status` when a preserved LabFrog projection
has it; `shot_status` adds no bridge column.

**The experimenters' Count.** labfrog-sqlite-tools schema v12 also exports
`shots.local_count`: the Count on the Shotsheet, derived from LabFrog's
local-counter resets. DAMNIT reads it when the column exists (an older export
still loads) and writes it beside each shot as
`/entry/shots/labfrog_local_count` (bridge profile v5), so someone holding the
Shotsheet can find a shot by the number they wrote down. It is a user aid, not
an identifier: matching and building never read it, the shot authority's
`shot_number` is unchanged, the name never starts with `shot_number` (the shot
aligner's rule G8), and the dataset's `description` attribute says all of
this. `-1` means LabFrog has no count for the shot: no active reset covers it,
the export predates v12, the LabFrog source is a NeXus projection, or the shot
is trigger-only.

## Canonical Outputs

The LabFrog NeXus structure is preserved and DAMNIT adds:

```text
/entry/definition                    NXhzdr_target application-definition declaration
/entry/experiment_identifier         campaign id (standard NXentry field)
/entry/shots                         canonical shot rows, match provenance, per-shot target JSON,
                                     experiment_id_source (bridge v4), labfrog_local_count (v5)
/entry/source_events                 normalized events, including unmatched events;
                                     producer_instance_id (v3), instrument_id (v4) columns
/entry/data_products                 files and internal dataset references
/entry/laserdata                     embedded small event arrays
/entry/watchdog                      Watchdog-derived values when present
/entry/instrument/laser              campaign laser snapshot (NXsource + nested NXbeam)
/entry/instrument/laser/shot_series  per-shot metadata.laser.* series (NXdata)
/entry/instrument/<key>              per-shot metadata.diagnostic.* scalars (NXdetector)
/entry/instrument/detector_<kind>    per-kind data-product references (NXdetector)
/entry/instrument/<instrument.id>    event-index view for a declared instrument (NXcollection)
/entry/sample                        target metadata (NXsample, NXhzdr_target profile)
/entry/sample/environment            vacuum metadata (NXenvironment)
```

With `--labfrog-nexus`, trigger-only shots join the canonical `/entry/shots`
table after the preserved LabFrog rows. `labfrog_shot_count` marks that prefix;
the preserved `/entry/derived` arrays still refer only to its rows. An
instrument group contains `event_index` values that join to
`/entry/source_events`, not copies of the producer data.

The semantic `metadata.*` promotions (laser, target, vacuum, diagnostics,
per-kind detectors) are documented field-by-field in
[standards-alignment.md §3](standards-alignment.md#3-detailed-field-level-alignment-mapping);
the `/entry/sample` contract is versioned in
[nxhzdr-target-profile.md](nxhzdr-target-profile.md).

`hzdr_sources.json` exposes the file through the HZDR API. `runs.sqlite` is an
optional future projection for legacy DAMNIT table workflows, not the source of
truth.

## Read-Only Operational Views

Three derived, read-only API surfaces back the operator UI. None of them write,
open Mongo, or join a broker consumer group; each degrades to an empty/`available=false`
result rather than failing, so they are safe to poll while the real consumers are
disabled.

- **Curated LabFrog campaigns** (`metadata/labfrog_sqlite.py`) — reads the
  per-campaign SQLite snapshots that `labfrog-sqlite-tools` writes under
  `curated_files/<Campaign>/<Campaign>.sqlite` (every connection uses a `mode=ro`
  URI). It surfaces the unique campaign list (`export_metadata` + `shot_summary`)
  and a per-campaign shot preview, without DAMNIT needing any database access.
  The Review matches page offers the campaign keys as suggestions when a
  reviewer assigns an unassigned shot to a campaign. Configured by
  `DW_API_METADATA__LABFROG_CURATED_DIR` (unset → no curated campaigns).
  Endpoints: `GET /metadata/hzdr/campaigns` and
  `GET /metadata/hzdr/campaigns/{campaign_key}/shots`.
- **Producer status** (`metadata/producer_status.py`) — derives DAQ File Watchdog
  hosts and Shotcounter liveness purely from the events already loaded on an
  `HZDRSource` (no new I/O). There is no dedicated host field on `hzdr-event-v1`,
  so the watchdog "host" is a best-effort label from the event's traceability
  fields (`payload_ref` endpoint/topic/path, then `metadata.watch_name`).
  Shotcounter status is `absent` / `active` (a recognised TANGO TKEY like
  `draco01` is present) / `idle` (shotcounter events but no TKEY). Endpoint:
  `GET /metadata/hzdr/sources/{source_key}/producer-status`.
- **Flow activity** (`shared/flow_activity.py`) — answers "is data actually
  flowing?" (where `GET /config/health` only answers "can the API reach the
  brokers?"). Read-only: per-topic Kafka message counts via `end - beginning`
  offsets (no group joined, no offset committed), per-campaign JSONL spool-file
  line counts + mtime, and optional ASAPO stream sizes via the optional
  `asapo_consumer` client. Each broker that is down or unconfigured yields
  `available=false` with a short reason. Backs the flow monitor's Live mode.
  Endpoint: `GET /config/flow-activity`; ASAPO activity is configured by
  `DW_API_HZDR_ASAPO_ACTIVITY__*` (the token is a `SecretStr`, never serialized).

**DAMNIT-owned sidecars** stored alongside `hzdr_sources.json`:
- `hzdr_sources.review.jsonl` — durable confirm/dismiss decisions and campaign
  rulings from the Review matches page (`/review-matches`); survives rebuilds; merged at `VERIFIED > REVIEWED > BASE`
  priority.
- `hzdr_sources.views.json` — durable saved UI table views (column visibility,
  sorting, filters); owned by DAMNIT, not LabFrog; managed via the views API
  (`GET/POST/DELETE /metadata/hzdr/views`).

## Production Rules

- Stage and flush events before acknowledging Kafka or ASAPO.
- Deduplicate by `event_id` and transport position.
- Use one writer per campaign.
- Build and validate temporary outputs, then publish atomically.
- Publish the NeXus file and source catalog from the same reconciliation result.
- Keep source exports and spools for replay and audit.

## Write Atomicity

Both canonical outputs are written via a temp-file-then-atomic-rename pattern so
that a crash or exception mid-write never leaves a half-written file for readers
or the next builder run to trip over.

**NeXus file** (`write_nexus_bridge`): writes to a sibling
`<name>.<uuid>.tmp.nxs`, then `os.replace()`s it over the target on success.
A failed build leaves the previous `canonical.nxs` intact. The stale `.tmp.nxs`
is cleaned up by the next successful run.

**`hzdr_sources.json` and sidecars** (`write_json_atomic`): same pattern —
sibling `<name>.<uuid>.tmp`, then `os.replace()`. Used for the catalog, saved
views, and any full-rewrite of a JSON/catalog file.

**What this protects against**: a process killed mid-write (disk full, OOM,
`SIGKILL`, power loss after OS flush) leaves the previous output untouched.
It does not protect against silent bit-rot of a file that was written correctly.

**Operator-decision sidecar** (`.review.jsonl`): unlike the NeXus file and
JSON catalog, this file is not rebuildable from upstream sources — it is the
durable record of every operator confirm/dismiss action. `append_review_decision`
copies the sidecar to a sibling `.review.jsonl.bak` after every successful
fsync, giving a rolling backup that is at most one decision behind the live
file. To recover a lost sidecar, rename the `.bak` file back in place before
the next builder run. For off-host resilience, include both files in any
directory-level backup or sync job.
