# Integration Roadmap

Updated: 2026-06-17

## Status Key

- ✅ done and committed
- 🔄 done locally, not yet merged/committed
- 🟡 should fix before pilot — unstarted or partially started
- 🔴 blocks the go-live gate — not started
- ⬜ genuinely lower priority or deferred

## Where We Are

The data model, offline integration path, local acceptance test, and operator
review UI are all implemented and committed. Every repo's integration branch has
been tested. The remaining work is (a) merging branches that are verified but
not yet on main, (b) wiring a real broker roundtrip, and (c) running the pilot
capture.

Committed and tested:

- Canonical `HZDREventV1` Pydantic model; `hzdr_nexus.py`/`hzdr_sources.py`
  derive from it instead of maintaining independent field lists.
- Adapters for normalized ASAPO events, raw Watchdog documents, and legacy
  DRACO `processed_message` payloads.
- Date-scoped identity and centralized timestamp reconciliation.
- LabFrog Mongo, SQLite, and rich NeXus readers.
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
- Offline four-source integration test
  (`api/tests/test_hzdr_integration.py`).

## Work Order

The sequence below is ordered by dependency, not effort.

1. **Merge the `shotcounter` branch** — verified passing (18/18 tests), not
   yet on main. Gate: one manual Kafka smoke test with `KafkaEnabled=1`
   against a local broker, plus a decision on `IsShotCounterXX` defaults for
   real deployments (currently all `False` — operators must opt each channel
   in explicitly).
2. **Commit the `asapo-for-hzdr-damnit` schema-version fix** — three example
   files have an uncommitted `"hzdr.source-event/1"` → `"hzdr-event-v1"` fix.
3. **Wire `shotcounter`'s Kafka envelope into DAMNIT's normalizer** — the new
   `hzdr-event-v1` Kafka output is not yet consumed. Today's
   `normalize_processed_trigger_message` reads only the legacy ZMQ
   `processed_message` relay.
4. **Decide and implement catalog-edit persistence across rebuilds** — operator
   `confirm`/`dismiss` actions are currently lost when the builder reruns
   (pre-existing behavior, now more visible). Options: teach the builder to
   merge prior review state on rebuild (real fix), or explicitly accept it as a
   stopgap until the durable spool (step 6) exists.
5. **Capture one real pilot sequence** — one synchronized real capture for
   `Solenoid Beamline Tests 01.2025`: LabFrog export, ASAPO event, Watchdog
   Kafka event, shotcounter trigger message.
6. **Implement durable campaign spool with ack-after-flush consumers** — the
   local ASAPO harness proves the correct claim/flush/ack/dedup ordering, but
   no production supervised consumer is wired into DAMNIT yet. This is the
   biggest unbuilt piece.
7. **Run real broker roundtrips with restart/replay** — `test_kafka_docker.py`
   in planet-watchdog is a one-shot smoke test; the go-live gate needs a
   restart-and-replay pass.
8. **Connect flow-monitor backend health** — today's Flow Monitor reads
   already-loaded catalog data. Real Kafka/ASAPO/Mongo health checks are not
   wired.
9. **Run the go-live replay** — see Go-Live Gate below.

## Repository Responsibilities

### `GitLab/labfrog`

Branch: `feature/open-sqlite-explorer`

| Item | Status |
| --- | --- |
| Map MediaWiki campaign choice to canonical `experiment_id` alongside `Campaign` | ✅ committed |
| Store/preserve timezone fields (`date_time_utc`, `date_time_timezone`) | ✅ committed (`added utc timezone field`) |
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
| Normalized events preserve Kafka topic, partition, offset, file URI/path, `payload_ref` | 🟡 partition/offset are in `metadata.kafka_data`; **topic name** is absent from `payload_ref` — violates architecture.md's `payload_ref` contract for Kafka sources |
| `IsShotCounterXX`-gated authoritative shot number in normalized event | 🔴 blocked-on: `shotcounter` merge and cross-system shot-number authority decision |
| Configure production deployment with canonical campaign and output topic | 🟡 config exists; deployment not yet pointed at it |
| Real broker roundtrip and restart/replay test | 🔴 not started |

### `GitLab/asapo-for-hzdr-damnit`

Branch: `main` (local harness committed; 3 example files have uncommitted fix)

| Item | Status |
| --- | --- |
| Local harness proves claim-before-ack, flush/fsync-before-ack, campaign-scoped group offsets, replay dedup by `event_id` | ✅ committed and verified |
| Example files use canonical `hzdr-event-v1` schema-version string | 🔄 fix is local, not committed (`"hzdr.source-event/1"` → `"hzdr-event-v1"` in 3 files) |
| Production supervised consumer with named consumer group and campaign routing | 🔴 not started |
| Carry claim/flush/ack/replay-dedup pattern into real ASAPO SDK consumer | 🔴 not started — the harness proves the pattern; production needs to implement it |
| References large arrays externally instead of embedding in JSON | 🔴 not started |

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
| `shotcounter`'s `hzdr-event-v1` Kafka envelope consumed by DAMNIT normalizer | 🔴 not started — DAMNIT currently reads only legacy ZMQ `processed_message` |

### `GitHub/DAMNIT-web-hzdr`

Branch: `main`

| Item | Status |
| --- | --- |
| Canonical `HZDREventV1` model, atomic catalog writes, single-writer builder lock | ✅ committed |
| Ambiguous/unmatched events in API; real Confirm Matches UI | ✅ committed |
| Local acceptance script; offline four-source integration test | ✅ committed |
| Shared example payloads and anonymized SQLite fixture | ✅ committed |
| Catalog-edit persistence across rebuilds (confirm/dismiss survives builder rerun) | 🟡 decision pending — see Work Order step 4 |
| Versioned JSON Schema publication from `HZDREventV1` | ⬜ lower priority while only one schema version exists |
| Durable per-campaign spool with transport positions and dedup state | 🔴 not started — biggest unbuilt piece |
| Real flow-monitor backend health (Kafka/ASAPO/Mongo) | 🟡 not started; today is presentation-only |
| Production auth, storage, backup, logging, restart configuration | 🟡 not started |
| `runs.sqlite` projection for legacy table workflows | ⬜ optional; deferred |

## Shot Number Authority

`shot_number` is `int | None` in the canonical model — nullable by design while
no cross-system-authoritative source exists. The three options, in order of
effort:

1. **Cross-check, don't author** — keep `shotcounter`'s `ShotNumber` as a
   device-local count (useful for debouncing and diagnostics) and treat it as
   advisory. DAMNIT's existing four-stage matcher remains the authority, using
   LabFrog's operator-entered shot number plus timestamp proximity. Cheapest;
   the pilot can run this way. Chosen for the pilot.

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
