# DAMNIT-web-hzdr Deployment Plan

Last updated: 2026-07-02

## Status snapshot (2026-07-02)

- **Deployed:** test deployment live at `https://fwkt-damnit.fz-rossendorf.de`
  on `fwkt-webapps.fz-rossendorf.de` (systemd `damnit-api`, port 8000). Suite
  green (196 passed / 15 broker-gated skips).
- **Not yet done:** Kafka and ASAPO spool consumers disabled; real-broker
  restart/replay gate (Step 3) not run against the production broker; nginx
  config for `fwkt-damnit` not yet recorded in the fwkt-webapps hub.
- **Broker (decided 2026-07-02):** Kafka runs on this same VM
  (`fwkt-webapps.fz-rossendorf.de:9092` externally) — `.env` uses
  `localhost:9092`.
- **Sidecar (decided 2026-07-02):** the `asapo-for-hzdr-damnit` sidecar will
  also run on this VM, writing `/data/damnit/hzdr/spool/asapo/` locally.
- **Blocked on:** broker deployment on this VM + shotcounter branch merge
  (see `fwkt-webapps/docs/operations/deployment-plan.md`, Phases 1–2).
- **Next steps, in order:** (1) enable Kafka spool consumer (Step 1) once the
  broker exists, (2) run the go-live gate (Step 3) and pilot capture with
  dedup counts, (3) wire the HDF5 builder per campaign, (4) enable the ASAPO
  path only when the LaserData sidecar is live (Step 2 stays harness-only
  until then).
- **Demo mode:** local `scripts/hzdr-launch.ps1|.sh` with anonymized fixtures
  and the flow monitor; the GitHub Pages demo build (`build-demo.yml`) stays
  the shareable no-backend demo. Demo/prod differ only by `.env` — keep it
  that way.
- **Campaign (decided 2026-07-02):** pilot runs as `Pilot_Verification_07.2026`;
  switch to the real campaign slug at the first production campaign via the
  campaign-rotation procedure.
- **Pilot config exists:** `api/.env.pilot.example` (Kafka on/localhost:9092/pilot
  slug; ASAPO off).
- **Tests:** full suite executed and passing (2026-07-02) after the
  registry/linter/NeXus-profile changes; all six family suites green.

The main application (FastAPI + frontend) is already running on the server. This
document covers **wiring the data-transfer protocol pieces** — the Kafka and ASAPO
spool consumers — into that running server environment.

The unit of deployment is the `.env` file: every spool consumer is disabled by default
and enabled by flipping one flag. Restart the systemd unit after each change; the
consumer starts as a FastAPI lifespan background task.

---

## Pre-flight checklist

Before enabling any consumer, verify:

- [ ] The systemd unit is running: `systemctl status damnit-api`
- [ ] The data root exists and is writable by the `damnit` user:
  `ls -la /data/damnit/hzdr`
- [ ] The `.env` file at `/opt/damnit-web-hzdr/api/.env` exists and was
  copied from `.env.production.example`
- [ ] `GET /config/health` returns 200 (even with all consumers off):
  `curl -s http://localhost:8000/config/health | python3 -m json.tool`

---

## Step 1: Enable the Kafka spool consumer

The Kafka consumer reads `draco.trigger` (shotcounter) and `planet.watchdog.events`
(planet-watchdog) and writes durable JSONL spool files that the HDF5 builder reads.

### 1a. Create the spool directory

```bash
sudo -u damnit mkdir -p /data/damnit/hzdr/spool/kafka
```

### 1b. Edit `.env`

```ini
# Kafka spool consumer
DW_API_HZDR_KAFKA_SPOOL__ENABLED=true
DW_API_HZDR_KAFKA_SPOOL__BOOTSTRAP_SERVERS=localhost:9092   # broker runs on this VM
DW_API_HZDR_KAFKA_SPOOL__TOPICS=["draco.trigger","planet.watchdog.events"]
DW_API_HZDR_KAFKA_SPOOL__CAMPAIGN=<canonical-campaign-slug>   # e.g. Solenoid_Beamline_Tests_01.2025 (illustrative only; pilot value is Pilot_Verification_07.2026)
DW_API_HZDR_KAFKA_SPOOL__CONSUMER_GROUP=damnit-kafka
DW_API_HZDR_KAFKA_SPOOL__SPOOL_DIR=/data/damnit/hzdr/spool/kafka
DW_API_HZDR_KAFKA_SPOOL__FILENAME=trigger.jsonl

# Health probe — Kafka reachability
DW_API_HZDR_HEALTH__KAFKA_BOOTSTRAP=localhost:9092
```

### 1c. Restart and verify

```bash
sudo systemctl restart damnit-api
journalctl -u damnit-api -f --no-pager    # watch for "KafkaSpoolConsumer started"

# After a minute, check the health endpoint:
curl -s http://localhost:8000/config/health | python3 -m json.tool
# Expect: kafka.reachable == true

# After events flow, the spool file should appear:
ls -lh /data/damnit/hzdr/spool/kafka/<campaign>/trigger.jsonl
```

### 1d. Point the HDF5 builder at the spool file

Pass `--trigger-jsonl` to `hzdr-hdf5-builder.py` for this campaign:

```bash
python api/scripts/hzdr-hdf5-builder.py \
    --experiment-id <campaign-slug> \
    --labfrog-sqlite /data/damnit/hzdr/<campaign>/<campaign>.sqlite \
    --trigger-jsonl /data/damnit/hzdr/spool/kafka/<campaign>/trigger.jsonl \
    --output-nexus /data/damnit/hzdr/<campaign>/<campaign>.nxs
```

---

## Step 2: Enable the ASAPO HTTP harness spool consumer

The current DAMNIT ASAPO consumer reads from the local HTTP harness API and writes to
a separate JSONL spool. This is useful for deterministic development and contract
testing, but it is **not the production ASAPO SDK path**.

The real ASAPO SDK packages available locally are compatible up to Python 3.13. Keep
that runtime boundary explicit:

- Watchdog is Kafka-only and does not need ASAPO. If LaserData comes online over
  ASAPO, prefer the `asapo-for-hzdr-damnit` sidecar: it runs in a Python runtime
  with compatible SDK wheels and writes DAMNIT's durable JSONL spool.
- A direct DAMNIT SDK adapter remains possible later if a compatible wheel exists
  for DAMNIT's target Python runtime.
- For deployment priority, Kafka remains the primary live data-transfer path. ASAPO
  SDK integration is a follow-up gate, not a blocker for the Kafka pilot.

### 2a. Create the spool directory

```bash
sudo -u damnit mkdir -p /data/damnit/hzdr/spool/asapo
```

### 2b. Edit `.env`

```ini
# ASAPO spool consumer (HTTP harness mode; not the production SDK path)
DW_API_HZDR_SPOOL__ENABLED=true
DW_API_HZDR_SPOOL__BROKER_URL=http://asapo-broker.hzdr.de:8765
DW_API_HZDR_SPOOL__CAMPAIGN=<canonical-campaign-slug>
DW_API_HZDR_SPOOL__CONSUMER_GROUP=damnit
DW_API_HZDR_SPOOL__SPOOL_DIR=/data/damnit/hzdr/spool/asapo
DW_API_HZDR_SPOOL__POLL_INTERVAL=2.0

# Health probe — ASAPO reachability
DW_API_HZDR_HEALTH__ASAPO_STATUS_URL=http://asapo-broker.hzdr.de:8765/api/status
```

### 2c. Restart and verify

```bash
sudo systemctl restart damnit-api
journalctl -u damnit-api -f --no-pager    # watch for "AsapoSpoolConsumer started"

curl -s http://localhost:8000/config/health | python3 -m json.tool
# Expect: asapo.reachable == true

ls -lh /data/damnit/hzdr/spool/asapo/<campaign>/events.jsonl
```

---

## Step 3: Run the real-broker Kafka integration gate

This step requires Docker and uses `test-all.ps1 -DockerTests`. Treat it as the
Kafka go-live gate: it verifies the consumer restart/replay semantics against the
broker that will carry `draco.trigger` and `planet.watchdog.events`.

```powershell
$env:KAFKA_TEST_BROKER = "fwkt-webapps.fz-rossendorf.de:9092"   # or localhost:9092 when run on the VM
pwsh scripts/test-all.ps1 -DockerTests
```

Expected: all 4 tests in `test_hzdr_broker_roundtrip.py` pass. Then run the manual
pilot restart/replay described in `remaining-work-plan.md` item 3 and record the
match/deduplication counts before calling the Kafka deployment ready.

---

## Step 4: Restart gate and shutdown behavior

The systemd unit (`scripts/damnit-api.service`) is already configured with:
- `Restart=on-failure` — restarts the API if it exits non-zero
- `TimeoutStopSec=30` — gives the spool consumers 30 s to drain before SIGKILL

On restart, each consumer:
1. Reads staged `event_id` values from the on-disk spool file (dedup index)
2. Resumes from the last committed Kafka offset / ASAPO consumer group position
3. Skips any event whose `event_id` is already in the spool (idempotent replay)

No manual offset reset or spool file manipulation is needed for a clean restart.

---

## Campaign rotation

When a new campaign starts:
1. Update `DW_API_HZDR_KAFKA_SPOOL__CAMPAIGN` and `DW_API_HZDR_SPOOL__CAMPAIGN` in `.env`
2. The spool consumers create a new `spool/<transport>/<new-campaign>/` directory automatically
3. Restart the service: `sudo systemctl restart damnit-api`
4. Update the builder invocation to point `--trigger-jsonl` at the new campaign's spool file

Old campaign spool files are not removed automatically — archive them under
`/data/damnit/hzdr/archive/<old-campaign>/` if disk space is a concern.

---

## Health endpoint reference

`GET /config/health` returns a JSON object with one entry per configured transport:

```json
{
  "kafka": { "reachable": true, "latency_ms": 4.2 },
  "asapo": { "reachable": true, "latency_ms": 12.1 },
  "mongo": { "reachable": false, "latency_ms": null }
}
```

`reachable: false` means the probe timed out (default 2 s). It does not stop the
consumer — the consumer retries independently. Check `journalctl -u damnit-api` for
connection error details.
