# openPMD projection plan (DAMNIT side)

**Status:** see `HZDR_combo/combo/planning/OPENPMD_MULTI_SOURCE_IMPLEMENTATION_PLAN.md`, which owns
the phase state for this workstream across all the repositories it touches.
This plan deliberately keeps no second copy: it said "Phase 2 done, Phases 3-5
open" for weeks after the constellation plan had recorded Phases 1-4 as
delivered, green and merged. DAMNIT's own slice -- the synthetic multi-source
canonical fixture, the projection preflight and the reviewed payload policy --
is implemented and green; `check_alignment.py run --groups nexus` is the gate.

This is DAMNIT's repo-local slice of the constellation plan
`HZDR_combo/combo/planning/OPENPMD_MULTI_SOURCE_IMPLEMENTATION_PLAN.md`. The reviewed
projection contract itself lives in nexus-design-studio
(`docs/openpmd-evolution.md`, `OpenPMDProjectionPlan` + its JSON Schema).

Not to be confused with [openpmd-linking.md](../openpmd-linking.md): that is
the `metadata.simulation` reference contract, which links an experimental shot
*to* a PIConGPU openPMD series. This plan is about projecting a *reconciled
experimental campaign* into an openPMD analysis companion. They share a
standard and nothing else.

## Boundary

DAMNIT is the only runtime campaign aggregator and the only HDF5 writer for the
canonical file. It does **not** write openPMD. Its obligations here are:

1. produce a canonical campaign NeXus file whose paths a reviewed projection
   plan can name, and
2. say, before anyone writes a projector, which of those paths a plan can
   actually resolve.

The projector itself is Phase 3 and lives in `labfrog-sqlite-tools-repo`
(`src/labfrog_sqlite_tools/openpmd_projector.py`, delivered 2026-09-02).
Nothing in this repository imports `openpmd-api`.

The two resolve the same plan independently — no dependency runs between the
repos, deliberately — so `checker:nexus` `openpmd-projection` in the combo
compares their per-rule verdicts and fails on disagreement.

## Compatibility baseline

The projection contract targets **openPMD standard 1.1.0**, matching the plan
model's `openpmd_standard` field. `hzdr_openpmd.SUPPORTED_OPENPMD_STANDARDS`
encodes that, and a plan naming anything else (2.0.0 included) is refused
rather than half-interpreted. The `openpmd-api` build and validator version are
a *projector* concern and are deliberately not pinned here — the API version
and the standard version are independent, and this repository never links the
library.

## Canonical path inventory (resolved 2026-08-31)

This closes the root plan's open item "exact canonical NeXus source paths". The
paths below were read back off a file built by `write_nexus_bridge`, not
guessed. Only the first group is shot-indexed; that distinction is the single
most important thing a projection plan has to get right.

### Shot axis — aligned with `/entry/shots/shot_index`

| Path | Carries |
| --- | --- |
| `/entry/shots/shot_index` | iteration index (0-based, stable order) |
| `/entry/shots/shot_key` | **stable shot identity** — there is no `shot_id` column |
| `/entry/shots/shot_number` | the shot's number: the shot authority's for a shot built from events, LabFrog's own (possibly typed) for a LabFrog-backed shot |
| `/entry/shots/authority_shot_number` | the shot authority's number (planet-watchdog) for every shot that has one, `-1` otherwise (bridge v6, added 2026-11-09) |
| `/entry/shots/fired_at` | earliest source-event timestamp = trigger time |
| `/entry/shots/match_status`, `match_quality`, `match_time_delta_s` | reconciliation evidence |
| `/entry/shots/target_metadata_json` | per-shot LabFrog target context (JSON text) |
| `/entry/shots/record_id`, `shot_date`, `date_time`, `labfrog_date_time` | LabFrog record identity |
| `/entry/shots/labfrog_local_count` | experimenters' Count from LabFrog (bridge v5, added 2026-10-01); a user aid, never an identifier, `-1` when absent |
| `/entry/instrument/laser/shot_series/<key>` | numeric `metadata.laser.*` series, NaN where a shot lacks the key |
| `/entry/instrument/<diagnostic>/data` | numeric `metadata.diagnostic.*` series (`NXdetector`) |
| `/entry/derived/<name>` | shot-indexed LabFrog products preserved from the export |

A projection plan's `iteration.shot_id_path` must be `/entry/shots/shot_key`.

### Event axis — `/entry/source_events`, **not** shot-indexed

`event_index`, `event_id`, `experiment_id`, `shot_key`, `source`, `kind`,
`timestamp`, `shot_number`, `source_ref` (transport), `payload_ref_json`,
`metadata_json`, `match_status`, `match_quality`, `match_time_delta_s`,
`candidate_shot_keys_json`.

One shot has many events, and an unmatched event has **no** shot. A projector
reaching this table must join through `/entry/source_events/shot_key`; zipping
by position silently misattributes data.

### Product axis — `/entry/data_products`, **not** shot-indexed

`product_index`, `product_id`, `shot_key`, `source`, `kind`, `path`,
`dataset_path`, `preview_kind`, `dtype`, `shape_json`, `units`,
`metadata_json`. Same join rule as above.

### Per-event payloads

`/entry/<source_group>/<kind>/<event_id>/values`, where `<source_group>` comes
from `source_group_name()` (`watchdog`, `laserdata`, `labfrog`, …). The
`event_id` component is what keeps two producer PCs from colliding.

### Campaign-level snapshots

`/entry/sample/**`, `/entry/instrument/laser/**` (excluding `shot_series`),
`/entry/start_time`, `/entry/end_time`. One value for the whole campaign; a
projector that wants these on an iteration has to broadcast them, and the
preflight says so rather than pretending they are per-shot.

## Phase 2 — what shipped

### The synthetic three-shot fixture

`api/scripts/hzdr-openpmd-fixture.py` builds it through the *real*
`reconcile_canonical_shots` and the *real* `write_nexus_bridge` under
`single_writer_lock`, so the fixture cannot drift from production layout
without a test failing. Everything in it is synthetic — no broker, no ASAPO
endpoint, no real campaign.

| Shot | Sources present | What it proves |
| --- | --- | --- |
| 101 | trigger + LabFrog + Watchdog **PC A** + ASAPO LaserData | all four producers on one iteration |
| 102 | trigger + LabFrog + Watchdog **PC B** | ASAPO absence does not shift alignment |
| 103 | trigger + LabFrog only | missing-source policy: keep the iteration, omit the record |
| — | early Watchdog PC A event, wrong day, unknown shot number | orphan stays `unmatched`, visible, unassigned |

Shot 102's Watchdog event deliberately reuses PC A's `kind` **and** its local
file path (`Z:/daq/beam_profile.h5`). They still land in distinct payload
groups and distinct `data_products` rows, because `event_id` — not the
filename — is the discriminator.

Producer identity, transport position, payload references, parser name and
version, and match quality all survive into `/entry/source_events`; the tests
assert each of those individually.

### The projection preflight

`api/src/damnit_api/metadata/hzdr_openpmd.py` resolves a reviewed plan against
a completed canonical file and reports what a projector could do. It opens the
file read-only, writes no openPMD, and returns a JSON-serializable report whose
reason codes are contract.

```
uv run python scripts/hzdr-openpmd-fixture.py --out-dir build/openpmd-fixture
uv run python scripts/hzdr-openpmd-preflight.py \
    --nexus build/openpmd-fixture/canonical-openpmd-synth.nxs \
    --plan  build/openpmd-fixture/openpmd-projection-plan.json \
    --report build/openpmd-fixture/preflight-report.json
```

Per-rule outcomes:

| Status | Meaning |
| --- | --- |
| `accepted` | the rule's own `source_path` resolves on an axis the role can use |
| `deferred` | structurally fine, but `resolve_payload` resolution is Phase 4's job |
| `rejected` | the rule's own data cannot be resolved — or a `required: true` rule carries any warning |

`required` is the whole severity mechanism. A missing *provenance* side path
(`event_id_path`, `producer_instance_path`) is a warning by default, because
the value is still projectable without it; marking the rule `required: true`
promotes that warning to a rejection and fails the run. An optional rejected
rule is reported without failing the run — that is the missing-source policy
applied to the plan instead of to the data.

Reason codes, grouped by where they attach:

* **plan** — `plan_schema_version_unsupported`, `plan_standard_unsupported`,
  `plan_source_kind_unsupported`, `plan_rules_missing`, `entry_path_missing`,
  `duplicate_source_path`, `duplicate_destination`, `rule_malformed`,
  `no_rule_resolved`
* **iteration** — `iteration_index_missing`,
  `iteration_index_not_one_dimensional`, `iteration_path_missing`,
  `iteration_length_mismatch`
* **rule, blocking** — `source_path_missing`, `source_path_not_dataset`,
  `source_axis_unaligned`, `source_not_numeric`, `source_rank_unsupported`,
  `component_missing`, `payload_selector_missing`, `role_unsupported`,
  `materialization_unsupported`, `reference_join_column_missing`
* **rule, advisory** — `source_axis_campaign_broadcast`, `source_axis_joined`,
  `provenance_axis_mismatch`, `event_id_path_missing`,
  `producer_instance_path_missing`, `payload_resolution_deferred`
* **payload policy** — `payload_policy_malformed`,
  `payload_policy_invalid_limit`, `payload_policy_unknown_fallback`,
  `payload_policy_invalid_checksum_flag`

### Payload policy (added 2026-09-02)

A `resolve_payload` rule declares *intent*; `payload_policy` declares what that
intent costs, and the projector applies it per payload at runtime. Separating
the two is what makes `resolve_payload` safe to write for a source whose
payloads are sometimes kilobytes and sometimes gigabytes — the rule stays
honest and does not have to predict which.

| Field | Default | Meaning |
| --- | --- | --- |
| `max_resolve_bytes` | `16777216` (16 MiB) | ceiling for one materialized payload |
| `on_oversize` | `reference_only` | payload readable but over the ceiling |
| `on_pending` | `reference_only` | reference good, bytes not local yet |
| `require_checksum` | `false` | opt-in; not every producer publishes one |

The numbers are measured, not guessed. DAQ File Watchdog products across the
reference campaigns run from a 3 KB beam-profiler CSV to a 2.8 MB spectrometer
frame (median ~234 KB, p90 ~1.2 MB), so 16 MiB clears every observed product
with room to spare while still stopping a runaway pull. ASAPO payloads reach
gigabytes; copying those into an *analysis projection* defeats its purpose, so
they trip the ceiling and degrade to a reference.

Two properties the preflight enforces:

- **An absent block means the defaults, never "unlimited".** A projector
  reading the report always finds a ceiling.
- **An unusable value is reported and replaced by the default, never
  honoured.** A typo cannot widen a limit.

`on_pending` exists because of how Watchdog actually works: it publishes Kafka
messages only, and the files are pulled *afterwards*. "Not here yet" is the
normal state of a fresh campaign, not a defect — so it degrades to a reference
and a later run can resolve it. That is distinct from a reference that does not
resolve at all, which is always an error with no policy knob.

### Reason codes the *projector* owns (Phase 3/4, not emitted here)

The preflight deliberately does not touch payload bytes, so these are named
here as contract for whoever writes the projector rather than implemented:

| Code | When |
| --- | --- |
| `payload_oversize` | payload exceeds `max_resolve_bytes`; act per `on_oversize` |
| `payload_pending` | reference valid, bytes not local yet; act per `on_pending` |
| `payload_missing` | reference does not resolve — always an error |
| `payload_checksum_absent` | `require_checksum` is set and no checksum is published |

## Open finding: no canonical path satisfies an inline `mesh`

A `mesh` rule with `inline` materialization needs a shot-aligned dataset of rank
2 or more — the shot axis first, then at least one component dimension. The
canonical file has none:

- `/entry/derived/*`, `/entry/instrument/laser/shot_series/*` and
  `/entry/instrument/<diagnostic>/data` are shot-aligned but rank 1
  (`source_rank_unsupported`);
- per-event payload arrays at
  `/entry/<source_group>/<kind>/<event_id>/values` carry real array shape but
  are indexed by neither the shot nor a bridge table
  (`source_axis_unaligned`).

So until something writes a shot-stacked array product, **every `mesh` rule has
to go through `resolve_payload`**, joining from a bridge table. A test pins this
so the constraint cannot quietly change under Phase 3.

## Closed: payload policy

**Decided 2026-09-02.** `OpenPMDPayloadPolicy` is part of the NDS plan model
(and its JSON Schema); the preflight resolves it, validates it, echoes it in the
report, and attaches the ceiling to every `resolve_payload` rule. See the
payload-policy section above for the numbers and why they are what they are.

## Closed: producer-instance identity, bridge profile v3

**Decided and implemented 2026-08-31.** `metadata.producer.instance_id` — the
additive, envelope-preserving spelling that needs no producer change, since
`metadata` is free-form — is now promoted out of `metadata_json` into
`/entry/source_events/producer_instance_id`, and `HZDR_BRIDGE_PROFILE_VERSION`
is `hzdr-canonical-shot-v3`.

What that changed:

| Where | Change |
| --- | --- |
| `hzdr_event.METADATA_KEY_REGISTRY` | `producer.instance_id`, `producer.host` registered (non-numeric) |
| `hzdr_nexus._write_source_events` | new `producer_instance_id` column via `_event_producer_instance()` |
| `hzdr_nexus.HZDR_BRIDGE_PROFILE_VERSION` | `hzdr-canonical-shot-v2` → `v3` |
| `CLAUDE.md` | registry table row, `producer.*` prose, bridge-profile section |

Two properties worth keeping straight:

- The column is **descriptive, never a join key**. `event_id` remains the
  discriminator — multi-PC collision was already impossible without it, since
  two PCs publishing the same `kind` and the same local filename still get
  distinct payload groups and distinct `data_products` rows.
- A producer that sets no `producer` block writes `""`. Shotcounter triggers
  and the synthesized LabFrog row do exactly that, and it is not an error.

The preflight's `producer_instance_path_missing` reason code stays — it now
fires only for a path that genuinely is not there, which a test pins.

## Not done here

- No openPMD file is written, opened, or validated. No `openpmd-api` dependency.
- No unit conversion. `unitSI` / `unitDimension` derivation via Pint is Phase 4
  and belongs with the projector.
- No payload materialization. `resolve_payload` rules are reported `deferred`
  and carry the ceiling that will apply; actually probing size, checksum,
  availability, and resolver provenance is Phase 4, in the projector.
- No real broker, ASAPO endpoint, or captured campaign. Phase 5.
- The plan file the fixture emits is a *design-time example over real paths*,
  not an approved production projection.

## Validation

```
cd api
uv run pytest tests/test_hzdr_openpmd_preflight.py     # 25 tests
uv run pytest -k hzdr                                  # HZDR integration subset
uv run ruff check .
```

One of those 25 is the cross-repository test: it loads the plan
nexus-design-studio actually ships
(`docs/schemas/examples/openpmd-projection-plan.example.yaml`) and preflights it
against this fixture, so a path change on either side fails here. It skips when
the sibling repo is absent, as the ASAPO harness test already does. Run
nexus-design-studio's own suite too when the plan model or schema changes.

## Next (historical; Phases 1-4 are merged, see the status line above)

1. Decide the producer-instance canonical path (above) — cross-repo.
2. `asapo-for-hzdr-damnit/OPENPMD_PROJECTION_PLAN.md` plus a local scenario
   sharing these shot IDs, covering one inline value and one bulk payload
   reference.
3. Phase 3 in `labfrog-sqlite-tools-repo`: the source-agnostic projector,
   consuming only a completed canonical file plus a reviewed plan.
