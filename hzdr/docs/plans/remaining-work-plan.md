# Remaining work plan (post-2026-06-25)

A focused plan for the items still open after the 2026-06-25 session. Companion to
`integration-roadmap.md` (the full assessment); this file is just the next-steps
playbook for the six remaining items, in recommended order.

Status legend: 🟢 ready now (no external dependency) · 🟡 needs a human decision or
config · 🔴 needs a real broker / live deployment.

**2026-07-01 update:** production deployment is live at
[https://fwkt-damnit.fz-rossendorf.de/](https://fwkt-damnit.fz-rossendorf.de/)
(see `hzdr/docs/status/handoff.md` §Built 2026-07-01). Item 3 (ASAPO SDK swap) is now
code-complete — `RealAsapoSpoolConsumer` is implemented and selected via
`DW_API_HZDR_SPOOL__BROKER_KIND=asapo`; only pointing it at the real broker's
endpoint/beamtime/token and the gated integration test remain, so it moves
from 🔴 to 🟡.

## Snapshot of what changed 2026-06-25

- **labfrog-sqlite-tools atomic rename + retain source exports** — ✅ **done**. Atomic
  temp-file+rename was already in `write_sqlite`/NeXus export; added a
  `bundle-complete.json` completion marker (atomic, last, with per-file sha256) and
  opt-in immutable `retain_exports` snapshots, exposed via the `export-campaign` CLI.
- **shotcounter merge gate** — ⏩ **prepared**. Smoke test (`scripts/kafka_smoke_test.py`)
  written and verified green against a real broker; gate documented in
  `shotcounter/docs/KAFKA_SMOKE_TEST.md`. Branch committed; only the two human gate
  steps remain (below).

## 1. Merge the `shotcounter` branch 🟡 (smallest path to a closed gate)

**Where it is:** `feature/hzdr-canonical-trigger-event`, unit suite green (24 passed),
`scripts/kafka_smoke_test.py` written and verified green against `kafka-broker-docker`.
`IsShotCounterXX` defaults **decided (2026-06-25): default `False`, opt-in per channel**
— already the code behaviour; the startup warning catches a misconfigured `KafkaEnabled`
device.  One gate item remains:

1. **Run the smoke test on the target deployment broker** (not just local):
   `uv run python scripts/kafka_smoke_test.py --broker <host:9092> --topic draco.trigger`,
   plus one full-device run with `KafkaEnabled=1` for the end-to-end path.

**Then:** merge to `main`. No code change expected. Unblocks the two 🔴 "authoritative
shot number" items in `labfrog` and `planet-watchdog` (they depend on this merge + the
shot-number-authority decision, already chosen as Option 1 for the pilot).

## 2. planet-watchdog production deployment config 🟡

**Where it is:** producer config (canonical campaign + output topic, `payload_ref` with
`topic/partition/offset` + file URI) is committed and tested; the deployment just isn't
pointed at it yet. Pure ops/config, no code.

**Do:** set the production `settings/watchdog.json` (and `watch_rules.json` topics) to the
canonical campaign + `planet.watchdog.events` topic and the real broker; run
`watchdog_test.py`-style preflight against that broker once. Capture the values in the
deployment runbook. Pairs naturally with item 3 (real-broker pass).

## 3. Real broker roundtrips with restart/replay [gate] (Kafka go-live gate)

**Where it is:** `api/tests/test_hzdr_broker_roundtrip.py` has 4
`pytest.mark.integration_docker` tests:
- `test_commit_advances_broker_offset` - confirms `_ack` commits offset via `list_consumer_group_offsets`
- `test_restart_resumes_from_committed_offset` - same group ID, clean restart, sees 0 new events
- `test_dedup_blocks_replay_from_fresh_group` - fresh group shares spool dir; dedup drops all re-delivered events
- `test_10_events_no_lost_no_duplicates` - golden-path, committed offset == 10

Tests are skipped (not failed) when the broker is absent. The `-DockerTests` flag was
added to `test-all.ps1` to opt into running them.

**Do:**
1. `cd kafka-broker-docker && docker compose up -d` (wait for broker ready)
2. `$env:KAFKA_TEST_BROKER="localhost:9092"; pwsh hzdr/scripts/test-all.ps1 -DockerTests`
3. Manual restart/replay pass: produce a captured pilot campaign verification
   sequence, kill+restart the spool consumer mid-stream, confirm no lost acks and no
   duplicate spool lines. Gate criteria are listed under "Go-Live Gate" in the roadmap.

## 4. LaserData/ASAPO sidecar integration [deferred]

**Where it is:** `AsapoSpoolConsumer` (`consumer/asapo.py`) drives the full
claim -> write -> fsync -> ack -> dedup loop against the HTTP harness broker.
`asapo-for-hzdr-damnit/tools/local_message_suite.py` now has a real SDK
consumer/producer behind `--transport asapo`, but that is a sidecar/harness path,
not DAMNIT production wiring.

**Runtime boundary:** Watchdog is Kafka-only and does not use ASAPO. ASAPO is
relevant if LaserData or another future source publishes through ASAPO. The
preferred path is now the `asapo-for-hzdr-damnit` sidecar: run it in a Python
runtime with compatible ASAPO SDK wheels and have it write DAMNIT's durable JSONL
spool. Move the SDK into DAMNIT only later, after a compatible wheel exists for
DAMNIT's target Python runtime.

**Do later:** run the sidecar against the real/standalone ASAPO broker, add a
gated real-ASAPO integration test, and fold in large-array externalisation
(`payload_ref.uri` instead of inline `values`).
This is not a blocker for the Kafka pilot.

## 5. Full `shot_key` adoption in table/review rows ⬜ (UI, deferrable)

**Where it is:** the shot-detail fetch already uses the `by-key/{shot_key}` route; table
row-selection identity and the ambiguous-review action key still use `shot_number`.

**Do:** add by-key PATCH/review API routes, then refactor the table state + review action
to key on `shot_key`. Larger frontend change, no pilot dependency — schedule after the
go-live gate. Track as its own UI task.

## 6. Versioned JSON Schema publication ⬜ (lowest priority)

**Where it is:** `regen_hzdr_event_fixtures.py` already emits the JSON Schema; only one
schema version exists, so a public versioned-publication endpoint adds little now.

**Do (when a 2nd version appears):** publish `hzdr-event-vN.schema.json` under a stable
URL/path and have producers reference the version they target. Defer until a breaking
schema change is actually needed.

## Recommended order

1. **shotcounter gate** (item 1) - closes the producer merge gate and unblocks authoritative shot-number follow-up work.
2. **planet-watchdog deploy config** (item 2) - quick, pairs with item 3.
3. **Real broker restart/replay + pilot capture** (item 3) - the Kafka go-live core.
4. **LaserData/ASAPO sidecar** (item 4) - use `asapo-for-hzdr-damnit` after LaserData/package/broker access is clear; not a Kafka pilot blocker.
5. **shot_key UI** (item 5) and **versioned schema** (item 6) - post-pilot.
