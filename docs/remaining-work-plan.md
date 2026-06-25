# Remaining work plan (post-2026-06-25)

A focused plan for the items still open after the 2026-06-25 session. Companion to
`integration-roadmap.md` (the full assessment); this file is just the next-steps
playbook for the six remaining items, in recommended order.

Status legend: 🟢 ready now (no external dependency) · 🟡 needs a human decision or
config · 🔴 needs a real broker / live deployment.

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
Kafka smoke test green against `kafka-broker-docker`. Two gate items remain, both human:

1. **Run the smoke test on the target deployment broker** (not just local):
   `uv run python scripts/kafka_smoke_test.py --broker <host:9092> --topic draco.trigger`,
   plus one full-device run with `KafkaEnabled=1` for the end-to-end path.
2. **`IsShotCounterXX` defaults — DECIDED (2026-06-25): default `False`, opt-in per
   channel.** Already the code behaviour; operators mark each shot-counting channel in
   the TANGO property setup (`scripts/add_server.sh`), and the startup warning catches a
   misconfigured `KafkaEnabled` device. No code change. This gate item is closed; only the
   operational smoke-test-on-deployment-broker step remains.

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
deployment runbook. Pairs naturally with item 4 (real-broker pass).

## 3. ASAPO SDK swap (replace harness HTTP client with real SDK) 🔴

**Where it is:** `AsapoSpoolConsumer` (`consumer/asapo.py`) drives the full
claim→write→fsync→ack→dedup loop against the harness HTTP broker; the loop is
production-shaped. Only the transport client needs swapping for the real ASAPO SDK.

**Do:** behind the existing `DW_API_HZDR_SPOOL__*` settings, add an ASAPO-SDK client
variant (`asapo_consumer.create_consumer(..., consumer_name=<campaign-slug>)`) selected by
a `broker_kind`/URL scheme, keeping the same `_claim`/`_ack` contract. Add a
`@pytest.mark.integration_docker`-style gated test mirroring `test_hzdr_broker_roundtrip.py`.
**Blocked on** access to a real/standalone ASAPO broker (`asapo-for-hzdr-damnit/run-standalone`)
— do the client adapter now, run the gated test when a broker is reachable. Also fold in
the large-array externalisation (`payload_ref.uri` instead of inline `values`, already
bounded by `check_values_size`).

## 4. Real broker roundtrips with restart/replay 🔴 (the go-live gate's core)

**Where it is:** offline + in-process broker tests are green; `test_hzdr_broker_roundtrip.py`
exists (docker-gated). Needs a real restart-and-replay pass per consumer.

**Do:** start `kafka-broker-docker`; run `test-all.ps1 -DockerTests` with
`KAFKA_TEST_BROKER` set; then the manual restart/replay: produce a captured sequence,
kill+restart the spool consumer mid-stream, confirm no lost acks and no duplicate
products (dedup by `event_id`). This is where the **pilot capture** (one synchronized
`Solenoid Beamline Tests 01.2025` sequence) feeds in. Gate criteria are listed under
"Go-Live Gate" in the roadmap.

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

1. **shotcounter gate** (item 1) — closes a 🟡, unblocks two 🔴s, mostly human steps.
2. **planet-watchdog deploy config** (item 2) — quick, pairs with item 4.
3. **Real broker restart/replay + pilot capture** (item 4) — the go-live core.
4. **ASAPO SDK adapter** (item 3) — code now, gated test when a broker is up.
5. **shot_key UI** (item 5) and **versioned schema** (item 6) — post-pilot.
