# `hzdr-event-v1` Schema

Updated: 2026-06-26

The current cross-repo event schema — field choices, constraints, and the rationale
behind each. The authoritative definition is the `HZDREventV1` Pydantic model in
`api/src/damnit_api/metadata/hzdr_event.py`; this document is the human-readable
companion to it.

Related docs: [MediaWiki integration](mediawiki-integration.md) (where `experiment_id`
comes from) and [standards alignment](standards-alignment.md) (how the schema relates
to DAPHNE4NFDI / HELPMI / NeXus / SciCat).

---

## 1. What the schema is and is not

`hzdr-event-v1` is the **transport envelope**, not a full experimental metadata record.
Its job is narrow: carry one event (a trigger fire, a file-arrived notice, a laser
pulse record) from a producer to the DAMNIT reconciler in a way that is:

- **Replay-safe** — `event_id` is stable across producer retries; re-sending the
  same event with the same `event_id` is idempotent.
- **Traceable** — `payload_ref` carries transport position or URI so the event can
  always be traced back to the source broker/file/database record.
- **Closed at the top level** — `extra="forbid"` prevents field creep in producers;
  new producer-specific data goes in `metadata` or behind a `payload_ref`.
- **Joinable** — `experiment_id` + `shot_id` are the canonical join key; DAMNIT
  and LabFrog can always agree on which campaign and shot an event belongs to.

It is **not** a full experiment description, a NeXus entry, or an archival record.
Those live in the canonical NeXus file (`/entry/shots`, `/entry/source_events`,
`/entry/data_products`) and the `hzdr_sources.json` catalog, both built from this
envelope by the reconciler.

## 2. Field-by-field rationale

| Field | Type | Rationale |
| --- | --- | --- |
| `schema_version` | `"hzdr-event-v1"` | Drift detection: a schema bump fails CI in every producer until copies re-sync. Pattern-validated so a typo is rejected at parse time. |
| `event_id` | str (required) | Stable, deterministic, producer-assigned. Enables idempotent replay: if the same event arrives twice with the same `event_id`, the consumer deduplicates and acks without writing twice. Must not be a random UUID that changes on retry. |
| `experiment_id` | str | Canonical campaign identifier, derived from the operator's MediaWiki campaign page choice in LabFrog. Cross-repo join key. Format: `Title_Words_MM.YYYY` (underscores = MediaWiki page title convention). |
| `shot_id` | str | Producer-local shot identifier, combined with `experiment_id` for the join key. Not the authoritative shot number. |
| `shot_number` | `int \| None` | TANGO's authoritative counter; null when not yet propagated. Explicitly nullable because blocking a producer on an unavailable authoritative number is worse than recording null and letting the reconciler sort it out. See §Shot Number Authority in `integration-roadmap.md`. |
| `source` | str | Human-readable producer name (`"DAQ-File-Watchdog"`, `"DRACO-Trigger"`, `"LaserData"`). Used in the UI and for grouping. |
| `kind` | str | Producer-defined event sub-type (`"draco.trigger"`, `"watchdog.file"`, `"camera_raw"`). |
| `timestamp` | str (UTC ISO-8601) | Required to be timezone-aware UTC at the transport layer; naive LabFrog times are interpreted in the campaign timezone during reconciliation. |
| `transport` | str | `kafka`, `asapo`, `zmq+kafka`, or `flow-monitor`. Informs the consumer which `payload_ref` fields are most meaningful. |
| `payload_ref` | `HZDRPayloadRef` | **The canonical traceability object.** Core traceability (Kafka topic/partition/offset, file URI, Mongo `_id`) belongs here, not in `metadata`. `extra="allow"` so producers can attach producer-specific refs at the same level without nesting. |
| `values` | `JsonValue \| None` | Small inline scalars/objects/arrays only (≤4096 leaf items, ≤64 KiB JSON). Oversized payloads are a producer bug; they should store data behind `payload_ref.uri`. |
| `metadata` | `dict[str, JsonValue]` | Free-form extra fields. Consumers that need a flat storage row serialize the whole object as one JSON column; the model does not flatten it. |

## 3. Hard constraints and why

**Closed top level (`extra="forbid"`):**
Any producer field that does not appear in this table is rejected during normalization.
The single documented exception is `trigger_role`, which the shotcounter emits at the
top level for historical reasons; the normalizer folds it into `metadata.trigger.role`
before validation. New producer-specific fields always go into `metadata`.

**`shot_number` is nullable by design:**
The alternative — blocking a trigger event until an authoritative shot number is
available — would stall the pipeline when the TANGO device is unavailable or the
cross-system clock hasn't propagated. Null is the correct value, not an error.
The reconciler matches primarily on identity (`kafka_event_id`, transport position) and
only falls back to `shot_number` when that is the best available hint.

**`values` size bounds:**
`check_values_size()` is enforced at staging time (not model-construction time) so
error messages name the offending file and point at `payload_ref`. An oversized
`values` payload fails loudly at the builder rather than silently bloating the NeXus file.

**`payload_ref` is always required (empty object is fine):**
The file contract has always required the key; a missing key signals a malformed event,
while an empty `{}` is valid when a producer genuinely has no traceability information
yet (e.g. a locally generated flow-monitor emulator event).

## 4. `experiment_id` and its MediaWiki origin

The `experiment_id` field is sourced from the operator's **MediaWiki campaign page
choice** inside LabFrog. When an operator creates or selects a campaign in LabFrog,
they pick (or create) a MediaWiki page for that campaign; LabFrog stores the page
title and derives `experiment_id` from it by normalizing to underscores and the
`Name_MM.YYYY` convention. The SQLite/NeXus export pipeline then plumbs this value
through every export row, so by the time an event reaches DAMNIT, `experiment_id`
is already the canonical, human-readable, wiki-linked campaign identifier.

This design means:
- There is always a wiki page for every campaign that DAMNIT ingests (the operator
  had to pick or create one in LabFrog).
- The wiki page is the human-facing record of what the campaign was about, what was
  measured, who participated, and any notes the operator recorded during the run.
- The DAMNIT `GET /metadata/hzdr/sources/{source_key}/wiki` endpoint turns that
  identifier back into a direct link to the wiki page plus live API metadata. See
  [MediaWiki integration](mediawiki-integration.md) for the full endpoint reference.

## 5. Schema evolution routes

**Option A — Additive fields in `metadata` (no schema bump):**
The most common path. New producer-side information goes in `metadata.my_new_field`,
or behind `payload_ref.my_new_ref`. No schema version change, no cross-repo
coordination overhead.

**Option B — New required field or constraint change (schema bump to `hzdr-event-v2`):**
If a new field must be present in every event (e.g. a `sample_id` join key) or an
existing constraint must tighten, the version string changes. Every producer and
the vendored fixture copies must update together; CI in each repo catches drift.
The old `v1` normalizer remains active until all producers have migrated.

**Option C — SciCat `scicat_pid` plumbing:**
`HZDRPayloadRef` already has a `scicat_pid` field. Once a campaign's NeXus file is
registered in SciCat, the builder can back-populate this field in the catalog so
DAMNIT can provide direct SciCat dataset links. No schema change needed. See
[standards alignment §5, Route 3](standards-alignment.md#route-3-scicat-registration-medium-effort-infrastructure-dependency).

**Option D — NeXus ontology alignment:**
Longer-term path: annotate `metadata` fields with controlled vocabulary terms from
the NeXus ontology or HELPMI glossary (e.g. `NXlaser`, `NXtarget`). This does not
require changing the transport envelope; it is a build-time annotation step in the
NeXus writer. See [standards alignment](standards-alignment.md) for the full mapping
and routes.

---

## Status

| Item | Status |
| --- | --- |
| `hzdr-event-v1` schema with vendored drift guard | ✅ committed |
| `experiment_id` sourced from MediaWiki campaign in LabFrog | ✅ committed |

Cross-repo contract sync: `api/scripts/regen_hzdr_event_fixtures.py` exports the
committed JSON-Schema + sample to `api/tests/fixtures/hzdr-event-v1.*`, vendored
byte-identically into the producer repos. See the root `CLAUDE.md` "Event schema
contract" section for the keep-in-sync workflow.
