# Integration Roadmap

Updated: 2026-06-18

## Status Key

- ✅ done and committed
- 🔄 done locally, not yet merged/committed
- 🟡 should fix before pilot — unstarted or partially started
- 🔴 blocks the go-live gate — not started
- ⬜ genuinely lower priority or deferred

## Where We Are

The data model, offline integration path, local acceptance test, operator
review UI, durable spool consumer, and flow-monitor health endpoint are all
implemented and committed. Every repo's integration branch has been tested.
The remaining work is (a) merging the shotcounter branch, (b) wiring real
broker roundtrips, and (c) running the pilot capture.

Committed and tested:

- Canonical `HZDREventV1` Pydantic model; `hzdr_nexus.py`/`hzdr_sources.py`
  derive from it instead of maintaining independent field lists.
- Adapters for normalized ASAPO events, raw Watchdog documents, and legacy
  DRACO `processed_message` payloads.
- Date-scoped identity and centralized reconciliation: exact Kafka identity,
  TANGO/shotcounter same-day matching, timestamp disambiguation, and
  timestamp-only fallback.
- LabFrog Mongo, curated SQLite, and rich NeXus readers; curated SQLite linking
  columns (`kafka_event_id`, transport offsets, `damnit_*`) are preserved.
- Canonical NeXus bridge, source catalog, API models, and frontend views.
- `HZDREventV1.experiment_id` derived from MediaWiki campaign choice in
  LabFrog and plumbed through the SQLite/NeXus export pipeline.
- Atomic `hzdr_sources.json` publication (temp file + rename) at every write
  site, plus explicit dedup-by-`event_id` and corrupt-JSONL handling.
- Single-writer PID-stamped lock around `hzdr-hdf5-builder.py` publish step,
  with stale-lock recovery.
- Ambiguous/unmatched events surfaced through API; real Confirm Matches UI
  (`/link-shot-records`) backed by `GET/POST .../review`.
- Local acceptance script (`api/scripts/hzdr-local-acceptance.py`): emulator
  events through Confirm Matches over a real FastAPI `TestClient`, no sibling
  repo or broker required.
- Shared example payloads in `api/examples/` using the canonical
  `hzdr-event-v1` schema-version string; lightweight anonymized LabFrog SQLite
  fixture at `api/examples/Example_Campaign_06.2026.light.sqlite`.
- Local ASAPO emulator/test harness proves claim-before-ack,
  flush/fsync-before-ack, campaign-scoped group offsets, and replay dedup by
  `event_id` with message-ID fallback.
- Offline four-source integration test (`api/tests/test_hzdr_integration.py`).
- Durable ASAPO spool consumer (`consumer/spool.py` + `consumer/asapo.py`):
  claim→write-fsync→ack→dedup loop running as a FastAPI lifespan background
  task; 11 integration tests against the live harness broker.
- `GET /config/health` endpoint: async ASAPO/Kafka/Mongo liveness probes with
  per-service `reachable` + `latency_ms`; configured via `DW_API_HZDR_HEALTH__*`.
- Production deployment templates: `api/.env.production.example`,
  `scripts/damnit-api.service` systemd unit.
- Cross-repo test runner `scripts/test-all.ps1` (all six suites, one command).

## Work Order

The sequence below is ordered by dependency, not effort.

1. **Merge the `shotcounter` branch** — verified passing (18/18 tests), not
   yet on main. Gate: one manual Kafka smoke test with `KafkaEnabled=1`
   against a local broker, plus a decision on `IsShotCounterXX` defaults for
   real deployments (currently all `False` — operators must opt each channel
   in explicitly).
2. **`asapo-for-hzdr-damnit` schema-version fix** — ✅ committed. Example files
   use canonical `"hzdr-event-v1"` schema-version string; `drop-in/damnit-consumer.env.example`
   added mapping harness vars to `DW_API_HZDR_SPOOL__*`.
3. **Wire `shotcounter`'s Kafka envelope into DAMNIT's normalizer** — ✅
   committed. `normalize_processed_trigger_message` detects a flat
   `hzdr-event-v1` document (`schema_version` field present) and routes it
   through `_normalize_hzdr_event_v1_trigger`, folding top-level `trigger_role`
   into `metadata.trigger.role` and deriving `shot_id` from `shot_number`.
   Four new unit tests; one new integration test.
4. **Catalog-edit persistence across rebuilds** — ✅ committed. Operator
   `confirm`/`dismiss` actions are written to `hzdr_sources.review.jsonl`;
   `write_sources_catalog` merges them on every rebuild. Review levels:
   `VERIFIED > REVIEWED > BASE`. See §Durable Spool for the production variant.
5. **Capture one real pilot sequence** — one synchronized real capture for
   `Solenoid Beamline Tests 01.2025`: LabFrog export, ASAPO event, Watchdog
   Kafka event, shotcounter trigger message.
6. **Implement durable campaign spool with ack-after-flush consumers** — ✅
   committed. `api/src/damnit_api/consumer/spool.py` (`HZDRSpoolConsumer` base,
   claim→write→ack→dedup loop) and `consumer/asapo.py` (`AsapoSpoolConsumer`,
   talks to harness HTTP API and real ASAPO broker endpoint alike). Activated by
   `DW_API_HZDR_SPOOL__ENABLED=true`; starts as a FastAPI lifespan background
   task. 11 new tests in `api/tests/test_hzdr_spool.py`. Suite: `161 passed, 1 skipped`.
7. **Run real broker roundtrips with restart/replay** — `test_kafka_docker.py`
   in planet-watchdog is a one-shot smoke test; the go-live gate needs a
   restart-and-replay pass.
8. **Connect flow-monitor backend health** — ✅ committed. `GET /config/health`
   in `shared/routers.py` returns `FlowMonitorHealth` with async probes for
   ASAPO (httpx), Kafka (TCP), and Mongo (motor ping), each with a 2 s timeout.
   Configured via `DW_API_HZDR_HEALTH__*` env vars.
9. **Run the go-live replay** — see Go-Live Gate below.

## Repository Responsibilities

### `GitLab/labfrog`

Branch: `feature/open-sqlite-explorer` — merged to `develop` (default branch)

| Item | Status |
| --- | --- |
| Map MediaWiki campaign choice to canonical `experiment_id` alongside `Campaign` | ✅ merged to `develop` |
| Store/preserve timezone fields (`date_time_utc`, `date_time_timezone`) | ✅ merged to `develop` |
| Mongo `_id`/`_id_OLD`/`version`/`status` implement stable identity and history | ✅ pre-existing, documented |
| Store/import authoritative TANGO shot number | 🔴 blocked-on: `shotcounter` merge + cross-system shot-number authority decision (see `shotcounter` section and §Shot Number Authority) |

### `GitLab/labfrog-sqlite-tools-repo`

Branch: `main` (changes committed)

| Item | Status |
| --- | --- |
| `experiment_id` column, migration, transform/export/NeXus plumbing | ✅ committed (`schema fix`) |
| Lightweight anonymized SQLite fixture in `DAMNIT-web-hzdr/api/examples/` | ✅ committed |
| Schedule campaign-scoped exports (cron/systemd/task-scheduler) | ⬜ external infra, not yet decided |
| Publish completed SQLite/NeXus pairs by atomic rename or completion marker | 🟡 not started |
| Retain each source export used for a canonical build | 🟡 not started — needed for the go-live gate's "reproducible output" criterion |
| Keep DAMNIT output separate from the immutable LabFrog export | ✅ directory layout enforces this |

### `GitLab/planet-watchdog`

Branch: `master` (changes committed)

| Item | Status |
| --- | --- |
| Canonical campaign/output topic settings in producer config | ✅ committed |
| Normalized events preserve Kafka topic, partition, offset, file URI/path, `payload_ref` | ✅ committed — `kafka_output.py` copies `topic/partition/offset` into `payload_ref`; integration test asserts all three fields |
| `IsShotCounterXX`-gated authoritative shot number in normalized event | 🔴 blocked-on: `shotcounter` merge and cross-system shot-number authority decision |
| Configure production deployment with canonical campaign and output topic | 🟡 config exists; deployment not yet pointed at it |
| Real broker roundtrip and restart/replay test | 🔴 not started |

### `GitLab/asapo-for-hzdr-damnit`

Branch: `main` (all committed)

| Item | Status |
| --- | --- |
| Local harness proves claim-before-ack, flush/fsync-before-ack, campaign-scoped group offsets, replay dedup by `event_id` | ✅ committed and verified |
| Example files use canonical `hzdr-event-v1` schema-version string | ✅ committed |
| `drop-in/damnit-consumer.env.example` maps harness vars to `DW_API_HZDR_SPOOL__*` | ✅ committed |
| Production supervised consumer with named consumer group and campaign routing | ✅ implemented in DAMNIT — `AsapoSpoolConsumer` in `api/src/damnit_api/consumer/asapo.py`; talks to harness and real broker alike |
| Carry claim/flush/ack/replay-dedup pattern into real ASAPO SDK consumer | 🟡 loop is built; swap harness HTTP client for real ASAPO SDK when broker is available |
| References large arrays externally instead of embedding in JSON | 🔴 not started — `HZDRPayloadRef.uri` field exists; producer-side work needed |

### `GitLab/shotcounter`

Branch: `feature/hzdr-canonical-trigger-event` (not yet merged to main)

| Item | Status |
| --- | --- |
| `schema_version`, stable `event_id`, canonical `experiment_id`, UTC timestamp | ✅ on branch, 18/18 tests pass |
| Machine-readable `trigger_role` via `TriggerRoleXX` attribute | ✅ on branch |
| Kafka key `<experiment_id>:<channel_id>` for ordering | ✅ on branch |
| Long-lived producer with retry on same `event_id` | ✅ on branch |
| Operator-configurable `ShotNumber` with debounce; `IsShotCounterXX` per channel | ✅ on branch |
| Manual Kafka smoke test with `KafkaEnabled=1` against real broker | 🟡 needed before merge |
| Merge to main | 🟡 pending smoke test and `IsShotCounterXX` defaults decision |
| `shotcounter`'s `hzdr-event-v1` Kafka envelope consumed by DAMNIT normalizer | ✅ committed — `_normalize_hzdr_event_v1_trigger` added; 4 unit + 1 integration test |

### `GitHub/DAMNIT-web-hzdr`

Branch: `main`

| Item | Status |
| --- | --- |
| Canonical `HZDREventV1` model, atomic catalog writes, single-writer builder lock | ✅ committed |
| Ambiguous/unmatched events in API; real Confirm Matches UI | ✅ committed |
| Local acceptance script; offline four-source integration test | ✅ committed |
| Shared example payloads and anonymized SQLite fixture | ✅ committed |
| Cross-repo test runner (`scripts/test-all.ps1`) — runs all six suites in one command | ✅ committed |
| Catalog-edit persistence across rebuilds (confirm/dismiss survives builder rerun) | ✅ committed — `hzdr_sources.review.jsonl` sidecar, `VERIFIED>REVIEWED>BASE` precedence |
| Versioned JSON Schema publication from `HZDREventV1` | ⬜ lower priority while only one schema version exists |
| Durable per-campaign spool with transport positions and dedup state | ✅ committed — `consumer/spool.py` + `consumer/asapo.py` (ASAPO) + `consumer/kafka.py` (Kafka trigger events); `DW_API_HZDR_SPOOL__ENABLED` / `DW_API_HZDR_KAFKA_SPOOL__ENABLED` activate background tasks in lifespan |
| Real flow-monitor backend health (Kafka/ASAPO/Mongo) | ✅ committed — `GET /config/health`; async probes with 2 s timeout, `reachable+latency_ms` per service |
| Production auth, storage, backup, logging, restart configuration | ✅ committed — `api/.env.production.example`, `scripts/damnit-api.service` systemd unit; JSON logging already active when `DW_API_DEBUG=false` |
| `runs.sqlite` projection for legacy table workflows | ⬜ optional; deferred |

## Shot Number Authority

`shot_number` is `int | None` in the canonical model — nullable by design while
no cross-system-authoritative source exists. The three options, in order of
effort:

1. **TANGO-preferred with timestamp fallback** — use shotcounter/TANGO
   `ShotNumber` as the preferred live shot number when it is present, but keep
   DAMNIT's timestamp matcher for missing, duplicated, or delayed shot numbers.
   Exact curated `kafka_event_id`/transport-position matches outrank both.
   Chosen for the pilot.

2. **labfrog-sqlite-tools stamps the number at export time** — reads the
   LabFrog Mongo shot count (already the operator-facing truth) and writes it
   into the SQLite/NeXus export. The authoritative number is only known after
   export; real-time event-side `shot_number` is still advisory.

3. **Dedicated cross-system TANGO shot-counter device** — every producer reads
   from it before stamping `shot_number`; labfrog writes to or reads from it.
   Only option that gives a live, cross-system-consistent number at acquisition
   time. Most work: new device, new integration point in every producer.

The decision to use Option 1 for the pilot is recorded. Options 2 and 3 remain
open for post-pilot evaluation.

## Schema Fix Review (2026-06-23)

Review of the matching/identity schema work (curated SQLite v7/v8 columns,
identity-first matching, `values` typing, `shot_key` route). Verified: full
HZDR suite green (59 tests), `ruff` clean on all touched modules.

What landed and is solid:

- **Identity-first matcher.** `_match_event` now resolves in the documented
  order: `kafka_event_id` → transport position (`topic/partition/offset`) →
  same-day TANGO `shot_number` → duplicate-shot timestamp disambiguation
  (`exact_day_shot_number_time_window`) → `shot_number` + nearest time →
  nearest time → ambiguous/unmatched. `MATCH_RANK` ordering is internally
  consistent (disambiguated < unique exact-day), and `MATCH_RANK.get(q, 0)`
  tolerates the non-ranked `ambiguous`/`unmatched` qualities without a KeyError.
- **Curated SQLite reader.** `read_labfrog_sqlite_shots()` now preserves the
  Kafka/identity/linking columns and the `damnit_*` hints, prefers `date_time_utc`
  for timestamp matching while keeping local `date_time` for date-scoping, and
  drops empty-string columns from metadata (handles the empty `experiment_id`
  seen in the curated Solenoid export).
- **Superseded-row handling.** `_mark_superseded_labfrog_rows()` marks non-`active`
  duplicates of an `active` (campaign, date, shot_number) group with
  `has_newer_version`, reusing the same flag the NeXus reader already emits and
  the matcher already filters on — archived rows stay as provenance, out of
  automatic matching.
- **`shot_key` lookup.** `GET .../shots/by-key/{shot_key}` is declared before the
  `{shot_number}` route, so it is not shadowed; `_shot_detail()` is now shared by
  both lookup paths.
- **`values` typing.** Relaxed to `JsonValue | None`, so small numeric arrays
  validate alongside scalars/objects.

Follow-ups (not yet done):

1. **Frontend has not adopted `shot_key`.** The route exists but no UI link or
   review action uses it yet (Codex step 4). Switch shot-detail links and the
   ambiguous-review flow to `shot_key` so restart-duplicated `shot_number`s stop
   being fragile in the UI.
2. **`has_newer_version` for SQLite is keyed on `status == active`, not version
   number.** Correct for well-formed curated exports; if an export ever marks an
   older row `active`, the flag would be wrong. Acceptable for the pilot; revisit
   if curated data proves noisier.
3. **Kafka spool consumer for shotcounter/Watchdog** — ✅ landed as
   `KafkaSpoolConsumer` (`consumer/kafka.py`); identity matching was already
   ready to consume those linking fields. Next real work is now the real-broker
   restart/replay pass (Work Order step 7) toward the go-live gate.

### Reassessment (2026-06-23, follow-up pass)

Three of the original follow-ups are now closed; the suite stays green (HZDR
suite 100 tests with `-k hzdr`, `ruff` clean on all touched modules):

- **`values` size guard added.** `check_values_size()` in `hzdr_event.py`
  rejects an inline `values` payload over `MAX_VALUES_ITEMS` (4096) leaf items -
  counted recursively, so nested image arrays count every element - or over
  `MAX_VALUES_BYTES` (64 KiB) of serialized JSON. `load_normalized_events()`
  enforces it at staging time, naming the offending file and pointing producers
  at `payload_ref`. Kept as a standalone function so future strict model
  validation can reuse the same bound. (was follow-up 2)
- **`experiment_id` duplication collapsed.** `read_labfrog_sqlite_shots()` now
  excludes `experiment_id` from the per-row `metadata` dict; it lives only at the
  top level, the single location `select_experiment_id()` reads. The builder's
  defensive `metadata` fallback is harmless but no longer exercised for curated
  SQLite. (was follow-up 3)
- **Transport-position uniqueness assumption documented.**
  `_shots_matching_transport_position()` and `docs/architecture.md` now state
  that the `(topic, partition, offset)` match is intentionally not date-scoped
  and trusts curated export writers never to rewrite/renumber committed offsets;
  if a topic is recreated/compacted so offsets are reused, drop to
  `kafka_event_id` identity matching. (was follow-up 5)

The remaining items above are deliberately deferred: the frontend `shot_key`
adoption is UI work tracked separately, and the `has_newer_version` status keying
is acceptable for the pilot. The Kafka spool consumer — previously the next real
work item — has since landed (`KafkaSpoolConsumer`, `consumer/kafka.py`).

## Durable Spool Design

Work Order step 6: production supervised consumer with ack-after-flush semantics.

### What the local harness already proves

`asapo-for-hzdr-damnit/tests/test_asapo_harness.py` (5 tests) proves the
correct ordering for the ASAPO path:

1. **Claim** message from named consumer group (ASAPO `GetNext`).
2. **Write and flush/fsync** the event JSON to local disk.
3. **Ack** (`Acknowledge`) only after the write is verified.
4. **Dedup** by `event_id` on replay (reject already-present IDs).
5. **Campaign routing**: each consumer group is scoped to a campaign slug;
   offset/position are per-group, so replaying one campaign does not disturb
   another.

The same five properties must hold for the real production consumer.

### What production needs

| Gap | Work required |
| --- | --- |
| Real ASAPO SDK consumer | Replace emulator with `asapo_consumer.create_consumer(…, consumer_name=<campaign-slug>)` call, configured from the same env-file settings used by the existing harness |
| Supervised restart | Wrap the consume loop in a `systemd` unit (or DAMNIT background task) that restarts on exit; last acked offset is the consumer group position — restart picks up where it left off |
| Large-array externalisation | ASAPO messages > ~1 MB should not embed raw arrays in JSON; use `payload_ref.uri` pointing to a streamed dataset, and write the array to the NeXus file separately. The `HZDRPayloadRef` model already has the `uri` field |
| Kafka consumer (PLANET-Watchdog / shotcounter) | ✅ `KafkaSpoolConsumer` (`consumer/kafka.py`): same `HZDRSpoolConsumer` claim/write/ack loop over a `kafka-python-ng` consumer group with `enable_auto_commit=False`; `_claim` polls a batch without committing, `_ack` commits `OffsetAndMetadata(last+1)` only after every message is fsync'd. Sync client calls are off-loaded with `asyncio.to_thread`. Activated by `DW_API_HZDR_KAFKA_SPOOL__ENABLED=true` |
| Per-campaign spool directory | `<campaign-slug>/spool/asapo/` and `<campaign-slug>/spool/kafka/<topic>/` under the DAMNIT data root; the builder's `--events-jsonl` / `--trigger-jsonl` flags already point to exactly these paths |
| Write-and-flush before ack | `write_json_atomic` (temp file + `fsync` + rename) is already implemented in `hzdr_nexus.py`; the consumer calls it, then acks |
| Dedup on replay | Consumer checks whether `event_id` already exists in the spool directory before writing; if yes, skip and ack (idempotent replay) |
| Builder trigger | On each new event file, the builder reruns; the single-writer PID lock already serialises concurrent runs |

### Implementation (completed 2026-06-18)

1. ✅ `HZDRSpoolConsumer` base class in `api/src/damnit_api/consumer/spool.py` —
   `SpoolConfig` dataclass, `consume_one()` write+dedup, `run(stop)` poll loop,
   clean `CancelledError` handling.
2. ✅ `AsapoSpoolConsumer` in `api/src/damnit_api/consumer/asapo.py` — talks to
   the harness HTTP broker and the real ASAPO broker endpoint via the same API.
   ✅ `KafkaSpoolConsumer` in `api/src/damnit_api/consumer/kafka.py` — the same
   base class over a `kafka-python-ng` consumer group with manual offset commit;
   sync `poll`/`commit` off-loaded via `asyncio.to_thread`. 6 offline tests in
   `api/tests/test_hzdr_kafka_spool.py` (in-memory fake broker, no Docker).
3. ✅ Supervised launch: `DW_API_HZDR_SPOOL__ENABLED=true` (ASAPO) and
   `DW_API_HZDR_KAFKA_SPOOL__ENABLED=true` (Kafka) each start a background
   asyncio task in the FastAPI lifespan (`main.py`), sharing one stop event and
   teardown; `scripts/damnit-api.service` systemd unit wraps the whole API
   process with `Restart=on-failure`.
4. ✅ 11 integration tests in `api/tests/test_hzdr_spool.py` (ASAPO, live
   in-process harness broker) + 6 in `api/tests/test_hzdr_kafka_spool.py`
   (Kafka, in-memory fake). Remaining: roundtrip test with real ASAPO SDK and a
   real broker restart/replay pass (Work Order step 7).

### Key invariant

> A message is acked **if and only if** its event file exists, is complete
> (written + fsync'd), and the builder has been triggered. An unclean shutdown
> between ack and builder trigger means the event is on disk but the catalog
> has not been updated; the next builder run corrects this automatically because
> it reads all spool files.

## Go-Live Gate

Replay one captured `Solenoid Beamline Tests 01.2025` sequence. Restart and
replay each consumer, then verify:

- no lost acknowledged events
- no duplicate events or products
- correct date-scoped shot keys
- explicit matched, ambiguous, and unmatched counts
- atomic file replacement while the API is reading
- source, shot, provenance, and preview views in the frontend
- staged-event schema validation rejects malformed producer payloads with
  actionable errors
- reproducible output from retained exports and spools

## Cross-repo standardization (2026-06-23)

A sibling-repo standardization pass to keep the shared schema and tooling in
sync across `DAMNIT-web-hzdr`, `planet-watchdog`, `shotcounter`,
`labfrog`, `labfrog-sqlite-tools-repo`, `asapo-for-hzdr-damnit`, and
`kafka-broker-docker`:

- **Schema drift guard (✅).** Reconciled the vendored `hzdr_event.py` copies
  (planet-watchdog's `values` was `dict[str, JsonValue] | None` and lacked the
  `check_values_size`/`EVENT_REQUIRED_FIELDS` guardrails; now byte-equivalent in
  contract to DAMNIT's canonical model). Added a committed JSON-Schema + sample
  fixture, vendored identically into each repo, and a `test_hzdr_event.py`
  assertion per repo so future drift fails CI. See **Event Envelope** in
  `architecture.md`. A real `F821` NameError in `labfrog/login.py` (`_optional_url_for`)
  surfaced during the lint pass and was fixed.
- **Ruff everywhere (✅).** Vendored one shared `ruff.toml` baseline into every
  sibling repo (replacing Trunk/black in labfrog/planet-watchdog and black/isort
  in shotcounter; mypy retained where present). Each repo was formatted and
  safe-fixed; the residual opinionated/legacy families are baselined in a
  clearly-marked, per-repo "adoption baseline" ignore block to re-enable family
  by family. labfrog keeps its REUSE/SPDX `license-lint` gate unchanged, and
  `F401` is `unfixable` there to protect its implicit re-export pattern.

Status of the three deferred follow-ups after this pass:

- **Frontend `shot_key` adoption** — still deferred; separate UI work, unrelated
  to schema/tooling sync.
- **`has_newer_version` keyed on `status == active`** — left as-is; an accepted
  pilot simplification, not a standardization concern.
- **Kafka spool consumer** — ✅ now implemented (`KafkaSpoolConsumer`,
  `consumer/kafka.py`). The drift guard above de-risked it: the consumer ingests
  exactly the `hzdr-event-v1` envelope pinned by a conformance test in every
  producer repo. The remaining go-live work is a real-broker restart/replay pass.
