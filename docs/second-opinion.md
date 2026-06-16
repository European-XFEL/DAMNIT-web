# Second Opinion: Integration Roadmap Review

Reviewer pass over [integration-roadmap.md](integration-roadmap.md) and
[architecture.md](architecture.md) against the actual state of this repo and
the six sibling repos under `GitLab/`. Method: read each repo's source,
tests, and git history directly rather than trusting prose status claims.
File:line references are given wherever a claim was checked.

Updated: 2026-06-16

## 1. Headline Finding

The roadmap's framing — "the remaining work is operational integration, not
another data-model redesign" — is **too optimistic**. Several "completed and
tested" items are contract/test fixtures, not the production code path they
describe. The data model itself also has a real gap (Section 4) that should
be fixed before more producers are wired to it, because it's cheap to fix now
and expensive once every producer has copied the current shape.

Severity key used below: 🔴 blocks go-live gate as written, 🟡 should fix
before pilot, ⚪ genuinely fine / lower priority.

## 2. Repository-by-Repository Reality Check

### 2.1 `GitLab/labfrog`

| Roadmap item | Actual state |
| --- | --- |
| Map MediaWiki campaign choice to `experiment_id` | 🔴 No `experiment_id` field exists anywhere in labfrog. MediaWiki campaign retrieval is fully implemented (`labfrog/selectables/mediawiki.py:39-160`), but campaigns are keyed by free-text **name**, and that name is never normalized into the canonical `Solenoid_Beamline_Tests_01.2025`-style ID the rest of the system assumes. |
| Store/import authoritative TANGO shot number | 🔴 No TANGO integration exists in this repo at all. `shot_number` is a plain imported/entered integer (`scripts/db/import_tabular_to_mongo.py:86-88`), not sourced from TANGO. |
| Document/emit timezone-aware `date_time` | 🟡 Partially true but mischaracterized: `date_time` is converted to UTC then **stripped to naive** before storage (`labfrog/db.py:314-316`, `labfrog/helper_functions.py:106-107`). That's reasonable Mongo practice, but it is the opposite of "timezone-aware," and nothing documents the convention. Calling this "still needed: emit timezone-aware date_time" without saying storage is intentionally naive will mislead whoever picks up the ticket. |
| Preserve stable Mongo IDs / current-superseded semantics | ⚪ Already done, well past "still needed." `_id`/`_id_OLD` chaining, `version` increment, and `status: active/archived` are mature (`labfrog/helper_functions.py:970-990`, `labfrog/edit_entry.py:79-99`). Remove from the roadmap or mark complete. |

**Net:** 1 of 4 items is actually finished. The two `experiment_id`/TANGO
items are the most consequential gaps in the entire roadmap — without them,
DAMNIT's matching step has no authoritative campaign key or shot number from
the source of truth, and is reduced to fuzzy timestamp matching for every
shot.

### 2.2 `GitLab/labfrog-sqlite-tools-repo`

| Roadmap item | Actual state |
| --- | --- |
| Atomic SQLite/NeXus export | ⚪ Genuinely done and tested. Temp file + `os.replace` in `src/labfrog_sqlite_tools/exporter.py:159,254` and `nexus.py:108,225-232`; covered by `tests/test_atomic_exports.py`. This is the one piece of the whole roadmap that fully matches its description — worth using as the template for the same pattern in DAMNIT's own builder (Section 4). |
| Schedule campaign-scoped exports | 🟡 Not implemented. `export_campaigns.sh`/`.ps1` are manual batch scripts; there is no cron/scheduler/task-queue code. This depends on external infra (Task Scheduler/systemd/CI) that isn't decided anywhere yet. |
| Retain each source export used for a build | 🟡 Only analysis-output preservation exists (`exporter.py:262-321`); there's no versioned archive of the LabFrog snapshot that fed a given canonical build, which the go-live gate's "reproducible output from retained exports" criterion needs. |
| Keep DAMNIT output separate from LabFrog export | ⚪ Directory layout (`curated_files/<Campaign>/...`) supports this; no DAMNIT writes land there today. Fine as-is. |

**Net:** Code-quality claim ("its suite passes") is accurate, but 2 of 4
operational bullets are unstarted, same as everywhere else.

### 2.3 `GitLab/planet-watchdog`

| Roadmap item | Actual state |
| --- | --- |
| Configure canonical campaign/output topic | ⚪ Done — `settings/watchdog.json:118-122`, `config.py:765-768`. |
| Authoritative shot number reaches the event | 🔴 `shot_number` is pulled from whatever's nested in the Draco ZMQ payload (`kafka_output.py:133-140`), not from TANGO. Since labfrog and the DRACO publisher also don't have an authoritative TANGO shot number yet (2.1, 2.5), this item can't actually be finished independently — it's blocked on upstream work, not a watchdog defect. |
| Preserve Kafka topic/partition/offset, file URI, Mongo/SciCat identity | 🟡 Partition/offset are captured into `metadata.kafka_data` (`handlers.py:135`), but the **topic name** is absent from `payload_ref` and no Mongo `_id`/SciCat reference is attached to the outgoing event (`kafka_output.py:50-56`). This directly violates the architecture.md promise that `payload_ref` preserves enough to trace an event back to its source record. |
| Real broker roundtrip / restart/replay test | 🔴 `tests/test_kafka_docker.py` is a one-shot publish/consume smoke test, not a restart-and-replay test. No idempotency check exists. |

**Net:** The HZDR envelope-building code (`build_hzdr_event()`,
`kafka_output.py:27-96`) is real and reasonably complete — this is the
**most mature producer in the whole system** — but 3 of 4 "still needed"
items remain, and one of them is structurally blocked on labfrog/DRACO.

### 2.4 `GitLab/asapo-for-hzdr-damnit`

This is the weakest link relative to its roadmap description. "The contract
examples/tests are pushed" is accurate; everything past that is aspirational:

- 🔴 No supervised consumer — `tools/local_message_suite.py:292-317` is a
  stateless CLI polling loop with no retry, health check, or reconnection.
- 🔴 No consumer-group semantics — only a flat per-name offset map
  (`local_message_suite.py:98-100`), not the "named consumer group and
  campaign routing" the roadmap asks for.
- 🔴 **Offsets commit before JSONL is durably written**, the opposite of
  the architecture.md production rule "stage and flush events before
  acknowledging." Broker-side offset advances at `local_message_suite.py:100-101`,
  before the client's JSONL write+flush at line ~310. A crash between those
  two steps silently drops the event — exactly the failure mode the
  production rules exist to prevent.
- 🔴 No deduplication by `event_id`/`message_id` anywhere, so "tolerates
  replay" is false; a replayed message is appended twice.
- ⚪ The `payload_ref` *shape* (stream, data_source, message_id) is correctly
  designed and demonstrated in `examples/*.json`.

**Net:** Treat this repo as not started for production purposes, despite the
roadmap's relatively gentle "production still needs a supervised consumer"
phrasing. It needs a rewrite of the ack/flush ordering, not just an addition
of supervision around the existing script.

### 2.5 DRACO/TANGO Trigger Publisher

**Update 2026-06-16:** `draco-shotcounter` (assessed below, unchanged) was a
Python precursor. The user has since pulled the real successor into
`GitLab/shotcounter` — a PyTango `Device` server (`hzdrTangoDSShotcounter/`)
with the matching channel/campaign/threshold model, tests, and CI. This *is*
the correct target for the roadmap's DRACO/TANGO bullets, not a new repo. A
branch (`feature/hzdr-canonical-trigger-event`) was created there; all of the
work below is implemented, committed, and **verified passing** in a real
PyTango + Docker TANGO + `uv`-managed environment (`uv run pytest`: 18/18
passed, 1 pre-existing/environmental NTP-tolerance test deselected — see
below). Not yet merged to `main`.

| Roadmap item | Status in `shotcounter` after the branch |
| --- | --- |
| `schema_version`, stable `event_id`, canonical `experiment_id`, UTC timestamp, authoritative `shot_number` when available | ✅ Added in `zmqSubscriberThread.py`'s `publishHzdrEvent()`. `experiment_id` is slugified from `Campaign` (`utils.CanonicalExperimentId`). `event_id` is a stable hash of `experiment_id:channel_id:channel_trigger_count` (`utils.StableEventId`) — deliberately not the 10 Hz counter, which wraps/resets multiple times a year and would let unrelated triggers collide. `shot_number` now comes from a new device-wide `ShotNumber` attribute (see below), still flagged **provisional** — operator-configured and device-local, not yet TANGO/labfrog-authoritative (Section 5 item 3 below). |
| Machine-readable `trigger_role`; do not infer from `Nickname` | ✅ New `TriggerRoleXX` device attribute (R/W string, default `""`), independent of `NicknameXX`/`CounterNameXX`. Test asserts they don't cross-contaminate. |
| Kafka key `<experiment_id>:<channel_id>` for ordering | ✅ `KafkaPublisherThread.enqueue()` is called with exactly this key. |
| Long-lived producer and retry with the same `event_id` | ✅ `KafkaPublisherThread` constructs one `KafkaProducer` for the thread's lifetime (not per event, unlike the old `draco-shotcounter:834`), and `_sendWithRetry()` retries the same event up to 3 times before logging and moving on — the legacy ZMQ relay still carries the event even if Kafka publication ultimately fails. |
| Keep `Name` as stable channel, retain current counters as metadata | ✅ Unchanged — `Name`/`Campaign` keep their existing names by design (matches what DAMNIT-web-hzdr's normalizer already prefers); `run_id`/`channel_trigger_count`/`sample_counter_10hz` still flow through, renamed to snake_case (see below) and copied into the new envelope's `payload_ref`/`metadata`. |

New `KafkaEnabled`/`KafkaBroker`/`KafkaTopic` device properties default to
disabled, so existing deployments are unaffected until explicitly opted in.

**Shot number is now operator-configurable, not the raw 10 Hz counter.** The
first version of this branch used the 10 Hz counter directly as `shot_number`;
the user correctly rejected that — it resets several times a year and isn't a
safe shot identity. Fixed with two additions:
- New `IsShotCounterXX` (bool, R/W, default `False`): marks which channel(s)
  represent an actual physical shot. Not every one of the 16 channels does —
  some monitor diagnostics that can trigger independently of a shot.
- New device-wide `ShotNumber` (int, R/W, change-event) and `ShotDebounceSeconds`
  property (default 0.5s): `ShotNumber` increments once per trigger on an
  `IsShotCounterXX` channel, but only if at least `ShotDebounceSeconds` have
  passed since the previously accepted shot. The debounce exists because more
  than one relayed message, or more than one designated channel, can report
  what is physically the same shot. `ShotNumber` is writable (like `RunId`) so
  it can be reset for a new run.

This is still a device-local, operator-configured counter, not a true
cross-system authoritative shot number — see Section 5 item 3 for what a real
fix looks like and why it's harder.

**Field naming was cleaned up while keeping the same `processed_message` dict
shape** (user explicitly asked for minimal-risk standardization, not a
redesign): `Nickname`→`nickname`, `Trigger_threshold`→`threshold`,
`ADC_value`→`adc_value`, `Channel_counter`→`channel_trigger_count`,
`Run_id`→`run_id`, `Event_timestamp`→`timestamp`,
`10Hz_counter`→`sample_counter_10hz`, plus newly-added `trigger_role` and
`shot_number`. `Name` and `Campaign` were deliberately left unrenamed:
`Name` is the roadmap-protected stable channel id, and `Campaign` is already
the field name [`normalize_processed_trigger_message`](../api/src/damnit_api/metadata/hzdr_nexus.py#L661-L749)
prefers. The rest of the renames match what that same function already checks
first before falling back to the old capitalized names — confirmed by reading
it directly — so this is a pure cleanup with no consumer-side change required.

**A real, pre-existing bug was found and fixed** (small enough to do
immediately, per user request): `zmqSubscriberThread.py`'s legacy
`processed_message` payload was setting `"Nickname": counterName` where
`counterName` was the *attribute name string* (e.g. `"CounterName01"`), never
`self.dev.storage.read(counterName)` — so `Nickname` had likely never carried
the operator-set value in any deployment. Fixed by reading the stored value;
flows correctly into both outputs now.

**Three more real bugs were caught only by actually running the tests**
(not by code reading, which is the reason the next item is non-negotiable):
1. `checkPropKafkaEnabled`/`checkPropKafkaBroker`/`checkPropKafkaTopic` crashed
   every `DeviceContext`-based test with `IndexError`, not the `KeyError` they
   guarded against — PyTango's `get_device_property` returns an empty list,
   not a missing key, for a property absent from the tango database. Fixed by
   catching both.
2. `setuptools>=81` removed `pkg_resources`, which `shotcounter.py` imports at
   runtime; pinned `setuptools<81`. Pre-existing on `main`, only surfaced once
   a real dependency resolver (`uv`) was used instead of an ad hoc environment.
3. `pytest` was never declared anywhere `uv` reads (only in
   `scripts/requirements_dev.in`, a separate pip-compile workflow); added a
   `[dependency-groups] dev` group to `pyproject.toml` so `uv sync`/`uv run
   pytest` work together, without touching the existing pip-compile workflow.

**Caveats / not yet done:**
- No TANGO-authoritative shot number yet — see Section 5 item 3, now expanded
  with options for solving it from the labfrog/labfrog-sqlite-tools-repo side.
- The old `draco-shotcounter` repo (assessment below preserved for history)
  is superseded and should not receive further roadmap work.
- `shotcounter`'s new Kafka envelope (`hzdr-event-v1`) is not yet consumed by
  anything — DAMNIT-web-hzdr's normalizer only reads the legacy ZMQ
  `processed_message` relay today. The renamed/added fields above were chosen
  specifically so that existing consumer keeps working without changes; the
  Kafka envelope is forward-looking until DAMNIT-web-hzdr's durable spool
  (§2.6) actually consumes Kafka directly.


### 2.6 `GitHub/DAMNIT-web-hzdr` (this repo)

- 🔴 **No canonical event model.** The only event `BaseModel`,
  `HZDRSourceEvent` ([hzdr_sources.py:22-31](../api/src/damnit_api/metadata/hzdr_sources.py#L22-L31)),
  has none of `schema_version`, `experiment_id`, `shot_id`, or `shot_number`.
  Those fields exist only as informally-checked dict keys in
  `EVENT_REQUIRED_FIELDS` ([hzdr_nexus.py:23-31](../api/src/damnit_api/metadata/hzdr_nexus.py#L23-L31))
  — and even that set omits `schema_version` and `shot_number` entirely, so
  nothing in the codebase actually enforces the envelope architecture.md
  advertises. See Section 4 for why this matters now rather than later.
- 🔴 `hzdr-hdf5-builder.py` is a synchronous, manually-invoked CLI batch
  job. No lock file, mutex, or single-writer guard — two concurrent
  invocations for the same campaign would race on the same output path.
  "Single-writer orchestration" is 0% started, not "remaining operational
  work" as the phrasing implies.
- 🟡 NeXus/catalog publication writes in place
  (`write_nexus_bridge`/`write_sources_catalog`), not via the
  temp-file-plus-atomic-rename pattern that `labfrog-sqlite-tools-repo`
  already proved out (2.2). This is a known-good pattern one repo away;
  porting it is low-risk, low-effort, and should happen before any concurrent
  reader/writer test.
- 🔴 No durable spool. There's no Kafka/ASAPO consumer in this repo — the
  "durable per-campaign spool with transport positions and deduplication
  state" doesn't exist yet in any form, not even a stub.
- 🟡 `FlowMonitorSettings` is configuration only
  ([settings.py:104-107](../api/src/damnit_api/shared/settings.py#L104-L107));
  there's no actual backend health check of Kafka/ASAPO/Mongo, and no
  unmatched/ambiguous review surface beyond what the offline test exercises.
- ⚪ The offline four-source integration test
  (`api/tests/test_hzdr_integration.py`) is real and does what
  [testing.md](testing.md) says: it combines LabFrog, ASAPO, Watchdog, and
  DRACO inputs and checks matching, NeXus output, and previews. This is a
  legitimate, valuable proof that the *reconciliation logic* (matching rules,
  shot-key scheme, NeXus layout) works — it's just not evidence that the
  *production pipeline* (ingestion, locking, atomic publish) exists, and the
  testing docs should be clearer that it's a model/logic test, not a system 
  test.

## 3. Cross-Cutting Pattern

Every repo shows the same shape: the **shared contract and offline/test path
is in good shape**; the **production path (scheduling, locking, durable
consumption, ack-after-flush, restart/replay) is consistently the unfinished
20%**, and it's not just "ops config" — `asapo-for-hzdr-damnit`'s ack-before-flush
ordering is a correctness bug waiting to lose data, not a deployment detail.
The roadmap's "Work Order" (capture pilot → finish producer metadata → durable
ingestion → wrap builder → connect API → replay test) is the right sequence,
but step 2 ("finish producer metadata at the DRACO/TANGO boundary") is
underweighted: it's blocking labfrog and watchdog's "authoritative shot
number" items simultaneously (2.1, 2.3), so it should move earlier and be
treated as the long pole, not a parallel item. The DRACO/TANGO publisher side
of that boundary (2.5) is now in progress on a branch in `shotcounter` — see
the 2026-06-16 update there and Section 5.

## 4. Critique of the Suggested Final Schema

The schema in question is the "Event Envelope" in
[architecture.md:39-58](architecture.md#L39-L58):

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

### 4.1 It is not actually implemented anywhere as a single type

This is the most important finding of the whole review. As shown in Section
2.6, no Pydantic model, JSON Schema, or even a single constant in the
codebase contains all of these fields together. Three different shapes exist
in practice:

1. `HZDRSourceEvent` (API-facing, [hzdr_sources.py:22-31](../api/src/damnit_api/metadata/hzdr_sources.py#L22-L31)) — has `event_id`, `source`, `kind`, `timestamp`, `transport`, `payload_ref`, `metadata`, plus `match_quality`/`match_time_delta_s`, but **no** `schema_version`, `experiment_id`, `shot_id`, `shot_number`, or `values`.
2. `EVENT_REQUIRED_FIELDS` (ingestion-facing, [hzdr_nexus.py:23-31](../api/src/damnit_api/metadata/hzdr_nexus.py#L23-L31)) — has `experiment_id`, `shot_id`, `source`, `kind`, `timestamp`, `transport`, `payload_ref`, but **no** `schema_version`, `event_id`, `shot_number`, `values`, or `metadata`.
3. Watchdog's actual on-wire event (`kafka_output.py:27-96`) — matches the architecture doc closely but is built by hand in one function, not validated against any shared model.

So "schema_version": "hzdr-event-v1" is a string nobody checks. If a producer
sends `"hzdr-event-v2"` today, nothing in this repo would notice, branch on
it, or reject it — there is no version-dispatch code at all. Calling this
"versioned" in the roadmap's "still needed" list undersells the gap: there
isn't a v1 enforcement to version *from*.

**Recommendation:** Before wiring more producers to this contract, add one
canonical `pydantic` model (e.g. `HZDREventV1`) in a shared location that all
three adapters (`hzdr_sources.py`, `hzdr_nexus.py`'s normalizers, and any
future consumer) import and validate against, instead of three independently
maintained field lists. This is exactly the kind of fix that's cheap now and
expensive after `planet-watchdog`, `asapo-for-hzdr-damnit`, and a future
DRACO/TANGO publisher have all hand-rolled their own dict literals against a
moving informal target.

### 4.2 Field-level issues

- **`shot_number` is documented as optional but typed as required-shaped
  (`1`, not `1 | null`).** Architecture.md's prose says "`shot_number` is
  optional only when unavailable," but the example shows a bare int and no
  repo's required-field set actually requires it — so today an event missing
  `shot_number` is silently treated the same as one that has it, with no
  `shot_number_present: bool` or explicit sentinel to distinguish "TANGO
  didn't report a shot number" from "shot 0." Given the architecture's own
  match-ranking depends heavily on shot number (`MATCH_RANK`,
  [hzdr_nexus.py:33-38](../api/src/damnit_api/metadata/hzdr_nexus.py#L33-L38)),
  this ambiguity matters more than the doc treats it.

- **`values: null` is a vague escape hatch that conflicts with the "no large
  arrays inline" rule.** `WRAP_PIPELINE.md` in `asapo-for-hzdr-damnit`
  correctly says large arrays should live in `payload_ref`, not `values` —
  but the canonical schema doesn't say what `values` is *for*, what size
  triggers "too large for `values`, must go in `payload_ref`," or what type
  it holds when present. Right now this is one untyped, unbounded field that
  different producers will fill inconsistently. Recommend either: (a) drop
  `values` from the envelope and require all payload data to go through
  `payload_ref` plus an external array store, keeping the envelope pure
  metadata; or (b) keep `values` but constrain it explicitly (e.g. scalar or
  short list only, with an enforced size cap) and document the cutover point
  to `payload_ref`.

- **`source` is a closed-looking enum in the example
  (`"LaserData | PLANET-Watchdog | DRACO-Trigger"`) but is `str` everywhere
  in code.** Fine for now, but as soon as a fourth producer exists (the
  DRACO/TANGO publisher in 2.5 is a fifth: DRACO-Trigger today is
  `draco-shotcounter`, tomorrow could be a different repo), an open string
  risks silent typos (`"Draco-Trigger"` vs `"DRACO-Trigger"`) breaking
  matching/grouping with no validation error. Worth a `Literal[...]` or a
  small registry the moment a second non-pilot source is integrated.

- **No `experiment_id` format validation anywhere it's produced.** The
  pilot's `experiment_id` (`Solenoid_Beamline_Tests_01.2025`) is
  human-typed/MediaWiki-sourced upstream (2.1) and currently has no
  canonicalization step (slugify, fixed charset, fixed structure) before it
  becomes a join key across five repos. A typo'd campaign name in labfrog's
  MediaWiki dropdown becomes an unmatched/ambiguous event downstream with no
  clear error pointing back to the cause. Given `experiment_id` is the single
  most load-bearing field in the whole schema (it's the join key for
  everything), it deserves the strongest validation, and currently has the
  weakest.

- **`payload_ref` is typed as `{}` / open dict everywhere, by design** (it's
  meant to vary per transport), but that also means there's currently no
  documented minimum contract per transport. Architecture.md doesn't specify
  what `payload_ref` must contain for `transport: "kafka"` vs `"asapo"` vs
  `"zmq"`. The roadmap items for `planet-watchdog` (preserve topic) and
  `asapo-for-hzdr-damnit` (preserve stream/data_source/message_id) are
  implicitly defining this contract piecemeal, per repo, instead of once,
  centrally. Recommend a `payload_ref` sub-schema per transport value,
  documented alongside the envelope, so "did watchdog preserve enough to
  trace this event" has a checkable answer instead of a roadmap bullet.

- **`timestamp` correctly requires UTC in prose, but nothing parses/rejects
  naive or non-UTC timestamps.** Combined with labfrog's naive-UTC storage
  (2.1) and the matching algorithm's reliance on tolerance windows
  (architecture.md "Matching" section), a single producer emitting a naive or
  wrongly-offset timestamp would degrade match quality silently rather than
  raising a validation error at ingestion. This is the same root issue as
  4.1 — a real model with `timestamp: datetime` (timezone-required) would
  catch this for free instead of needing bespoke checks per adapter.

### 4.3 What the schema gets right

- The four-stage matching fallback (exact day+shot → shot+nearest-time →
  nearest-time → ambiguous) is sound and the one part of the design that's
  actually implemented and tested (`MATCH_RANK`,
  `api/tests/test_hzdr_integration.py`).
- Keeping `metadata: {}` as a free-form bag separate from the typed fields is
  the right call — it lets producer-specific detail ride along without
  forcing premature schema agreement on everything.
- The shot-key scheme (`<experiment_id>:<local YYYYMMDD>:<shot_number padded
  to 6>`) correctly handles the stated requirement that shot numbers restart
  daily, and is a clean, sortable, human-readable key.
- Separating `event_id` (retry-safe transport identity) from `shot_id`
  (logical shot identity) is the correct normalization — it avoids conflating
  "this message" with "this shot," which is what lets deduplication and
  matching be independent concerns.

## 5. Recommended Next Steps, In Order

This reorders/merges the roadmap's "Work Order" based on the findings above
— the guiding principle is fix the shared contract once, before letting more
producers copy today's informal version of it. Updated 2026-06-16 to reflect
that `shotcounter` (2.5) is now real, owned, branched, and verified.

1. **Merge the `shotcounter` branch** (2.5, `feature/hzdr-canonical-trigger-event`).
   Verification is done: `uv run pytest` passes 18/18 (1 pre-existing/
   environmental NTP test deselected) against real PyTango + Docker TANGO.
   Remaining before merge: a manual Kafka smoke test with `KafkaEnabled=1`
   against a real or local broker (the branch's tests cover the envelope
   contract and the debounce/shot-counting logic, but not an actual broker
   round-trip), and a decision on whether to set any `IsShotCounterXX`
   defaults for real deployments (today every channel defaults to `False`,
   so `ShotNumber` never increments until an operator explicitly opts a
   channel in — confirm that's the desired default, not silently-broken
   shot counting).
2. **Formalize the event envelope as one shared model in this repo**
   (Section 4.1). Now that `shotcounter` emits a real `hzdr-event-v1` payload,
   use it as a concrete second example (alongside watchdog's) when writing
   the canonical `HZDREventV1` Pydantic model + JSON Schema. Make
   `hzdr_sources.py`'s `HZDRSourceEvent` and `hzdr_nexus.py`'s
   `EVENT_REQUIRED_FIELDS` both derive from it instead of maintaining
   independent field lists. Resolve the `shot_number` optionality and
   `values` ambiguity (4.2) as part of this pass.
3. **Close the `experiment_id`/shot-number authority gap at the source**
   (2.1, and the `shot_number` provisional note in `shotcounter`, 2.5). This
   blocks correctness for every producer's "authoritative shot number"
   bullet, so it's the true long pole, not a parallel work item.
   `shotcounter`'s `ShotNumber`/`IsShotCounterXX` (added 2026-06-16) is a real
   improvement — it stopped using the wraparound-prone 10 Hz counter and now
   reflects an operator-designated, debounced shot count — but it is still
   **device-local**: a second shotcounter device, or labfrog, has no way to
   know it agrees with this one. **This is an open problem, not yet solved**;
   options to evaluate, roughly cheapest-to-hardest:
   - *Cross-check, don't author.* Keep `ShotNumber` as shotcounter's local
     count (useful for its own debouncing/diagnostics) but treat it as
     advisory. Let DAMNIT's existing matcher (architecture.md "Matching")
     remain the actual authority, using LabFrog's user-entered shot number
     plus timestamp proximity, same as it already does for other sources.
     Cheapest, but doesn't give labfrog/operators a *live*, trustworthy shot
     number at acquisition time — only after-the-fact reconciliation.
   - *labfrog-sqlite-tools-repo assigns the number at export time*, by
     reading the LabFrog Mongo shot count (already the thing operators
     manually enter and rely on) and stamping it onto the SQLite/NeXus export
     it produces, rather than trusting any producer's self-reported number.
     This matches labfrog-sqlite-tools-repo's actual role (exporter of the
     authoritative LabFrog record) and needs no new device/hardware — but it
     means the authoritative number is only known after export, not at
     acquisition, so DAMNIT's real-time/event-side `shot_number` (from
     watchdog, shotcounter, etc.) still can't carry it live; matching has to
     reconcile it after the fact, same as option 1 but with a better-trusted
     post-hoc source.
   - *A dedicated TANGO shot-counter device, separate from any one producer*,
     that every producer (shotcounter included) reads/subscribes to before
     stamping `shot_number`, with labfrog also writing to or reading from it
     so the operator-facing number and the producer-facing number are
     provably the same counter. This is the only option that gives a live,
     cross-system-consistent number at acquisition time, but it's the most
     work: new device, new integration point in every producer, and a
     decision about who owns incrementing it (TANGO trigger system? labfrog
     on shot entry? both, reconciled?).
   The right choice depends on whether DAMNIT's matching-after-the-fact
   approach (already built and tested, see 4.3) is judged good enough, or a
   live authoritative number is a hard requirement for the pilot. Worth a
   short, explicit decision rather than letting `shotcounter` and labfrog
   each grow their own local notion of "the" shot number indefinitely.
4. **Fix the ack-before-flush ordering in `asapo-for-hzdr-damnit`** (2.4).
   This is a correctness bug (silent data loss on crash), not a feature gap,
   and should be prioritized above adding consumer-group/supervision
   features on top of it.
5. **Port the atomic-publish pattern from `labfrog-sqlite-tools-repo` into
   this repo's builder** (2.2, 2.6). Low effort, proven code, removes a real
   race condition (concurrent reader during a write) ahead of any concurrency
   testing.
6. Only after 1–5: proceed with the roadmap's durable spool, single-writer
   orchestration, and flow-monitor work, since those depend on having a
   trustworthy contract and an authoritative shot number to ingest in the
   first place.
7. Then run the existing go-live gate (replay `Solenoid Beamline Tests
   01.2025`) as already specified — no change recommended there, it's a good
   acceptance test once 1–6 are real.

## 6. Documentation Hygiene Notes

- Several roadmap "still needed" bullets (labfrog's Mongo ID/versioning;
  this repo's offline integration test being held up as evidence of pipeline
  readiness) should be reworded so a future reader doesn't need to re-derive,
  via a full source read, which third are done, which are blocked on another
  repo, and which are simply not started. Consider adding a status enum
  (`done` / `blocked-on:<repo>` / `not started`) per bullet instead of prose.

## 7. Option 1 Verification + Confirm-Matches Work (2026-06-16, in progress)

Decision: stick with **Option 1** from Section 5 item 3 (matcher stays
authoritative; no labfrog-sqlite-tools-repo or shared-TANGO-device work yet).
This section tracks verifying it and adding a real operator review UI on top.
**Committed up to this point**.

### Done and verified (all tests passing: `cd api && uv run pytest` → 115
passed, 1 skipped, no regressions)

1. **Fixed the stale `test_hzdr_integration.py` fixture.** It still used the
   pre-rename trigger field names (`Nickname`, `Trigger_threshold`, etc.) that
   `shotcounter`'s branch moved away from (Section 2.5). Now uses the real
   snake_case shape, so this test can actually catch a regression there.
2. **Found and fixed a real `match_summary` counting bug while building this**
   (not present before today): every canonical shot gets a synthetic LabFrog
   event appended unconditionally
   ([hzdr_nexus.py:313-318](../api/src/damnit_api/metadata/hzdr_nexus.py#L313-L318)),
   so `shot.get("events")` is *always* truthy and can't distinguish "an
   external producer matched this shot" from "labfrog-only." Both
   `_build_match_summary` (build time) and `_recompute_match_summary`
   (after a review action) now key off `match_status == "matched"` instead,
   which is set correctly *before* that LabFrog-event append.
3. **Ambiguous/unmatched events now reach the API/frontend at all.** Before
   today they were computed (`_match_event`) and written to the NeXus file's
   `/entry/source_events` group, but never passed into
   `write_sources_catalog` — so `hzdr_sources.json`, the API, and the
   frontend had zero visibility into them. Fixed:
   - `_match_event` now also returns `candidate_shot_keys` (the shots the
     matcher found tied, for ambiguous events only) —
     [hzdr_nexus.py:867-931](../api/src/damnit_api/metadata/hzdr_nexus.py#L867-L931).
   - `write_sources_catalog` takes a new `events` parameter and emits
     `review_events` (ambiguous/unmatched events, API-shaped via
     `_review_event_api_record`) and `match_summary`
     (`{matched, ambiguous, unmatched}`, the literal go-live-gate wording) —
     [hzdr_nexus.py:492-577](../api/src/damnit_api/metadata/hzdr_nexus.py#L492-L577).
     `hzdr-hdf5-builder.py` passes `normalized_events` through.
   - New Pydantic models `HZDRReviewEvent`, `HZDRMatchSummary`, and new
     `HZDRSource.review_events`/`match_summary` fields —
     [hzdr_sources.py](../api/src/damnit_api/metadata/hzdr_sources.py).
4. **New API endpoints** in `routers.py`:
   - `GET /metadata/hzdr/sources/{source_key}/review` — review_events +
     match_summary for one source.
   - `POST /metadata/hzdr/sources/{source_key}/review/{event_id}/confirm` —
     attach an ambiguous event to one of its candidate shots (rejects any
     shot not in `candidate_shot_keys`, by design decision — see below).
   - `POST /metadata/hzdr/sources/{source_key}/review/{event_id}/dismiss` —
     acknowledge an unmatched event with no shot attached (stays listed with
     `acknowledged: true`/`acknowledged_by`/`acknowledged_note` for audit,
     excluded from the `unmatched` count — by design decision, see below).
   - Both mutation endpoints are **catalog-only edits**, same as the
     pre-existing `update_local_shot_status`/`update_local_shot_metadata`:
     they edit `hzdr_sources.json` directly and do **not** touch the
     canonical NeXus file. This is a pre-existing limitation in the whole
     local-provider editing pattern, not new: any operator action here will
     be **silently lost the next time the builder reruns** (it recomputes
     `review_events`/`match_summary` from scratch). Worth fixing once,
     generically, rather than per-endpoint — see "Next" below.
5. **Tests added:**
   `api/tests/test_hzdr_integration.py` — 3 new end-to-end cases (ambiguous
   duplicate-shot_number, unmatched-with-no-candidate, missing-shot_number)
   proving `review_events`/`match_summary` are populated correctly from a
   real builder run, not just at the unit level.
   `api/tests/test_hzdr_review.py` (new file) — 6 cases covering
   confirm/dismiss success paths, rejecting a shot_key outside the
   candidates, rejecting confirm-on-unmatched and dismiss-on-ambiguous, and
   404 on an unknown event_id.

### Design decisions made (asked and answered this session)

- Confirming an ambiguous event is restricted to the matcher's own
  `candidate_shot_keys`, not any shot in the source — smaller UI, prevents
  mis-clicks linking to an unrelated shot.
- Dismissing an unmatched event only acknowledges it (no shot-attach UI for
  unmatched events yet) — matches "the matcher found nothing" semantics
  literally; manual attach-to-any-shot for unmatched events is a possible
  future extension, not built.

### Not started yet — pick up here

1. **Frontend: replace `LinkExistingShotRecordsPage`** in
   [app.tsx](../frontend/apps/app/src/app.tsx) (route `/link-shot-records`,
   nav button "Link records"). Confirmed it is **100% client-side
   fabrication** today: `buildLinkRecordsDraft`/`buildLinkRecordsReviewPackage`/
   `collectionStatusForShot` invent `matched/candidate/missing` statuses from
   emulator-only metadata fields (`shot.metadata.watchdog_status` etc.), never
   call any matching endpoint, and the page's own copy says *"The backend
   agent can replace this with direct MongoDB collection reads later."*
   Decision made: **repurpose the same route/nav entry**, replace the body
   with a real Confirm Matches view that calls the new `GET .../review`
   endpoint, lists ambiguous events with a picker over their
   `candidate_shot_keys` (calling `POST .../confirm`), lists unmatched events
   with an acknowledge button (calling `POST .../dismiss`), and shows the
   `match_summary` counts up top. Delete the fabricated helper
   functions/types (`LinkRecordsDraft`, `BuiltLinkRecordsPackage`,
   `LinkedShotRecord`, `LinkCollectionStatus`, `buildLinkRecordsDraft`,
   `buildLinkRecordsReviewPackage`, `collectionStatusForShot`,
   `sourceMatchesCampaign` if unused elsewhere) once the new view replaces it.
2. **Decide whether to fix the catalog-edit-doesn't-survive-rebuild problem**
   now or later. It's pre-existing (shared by `update_local_shot_status`/
   `update_local_shot_metadata` too), but the new confirm/dismiss endpoints
   make it more visible. Options: teach the builder to merge prior
   `review_events`/shot corrections back in on rebuild (the real fix, more
   work), or explicitly document/accept it as a stopgap until the durable
   spool work (Section 5 item 6) exists. No decision made yet.
3. Nothing in this section has been committed. Review the diff
   (`git status`/`git diff` in this repo) and commit when ready — no commits
   were made without being asked, per how this session went.
