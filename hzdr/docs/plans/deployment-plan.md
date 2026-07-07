# DAMNIT-web-hzdr Deployment Plan

Last updated: 2026-07-03

## Status snapshot (2026-07-03)

- **Deployed:** test deployment live at `https://fwkt-damnit.fz-rossendorf.de` on `fwkt-webapps.fz-rossendorf.de` (systemd `damnit-api`, port 8000). The offline pilot package gate passed on 2026-07-03 across DAMNIT, LabFrog, LabFrog SQLite tools, DAQ File Watchdog, and shotcounter; live broker `-DockerTests` remains the deployment gate.
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
  dedup counts, (3) enable the builder auto-trigger + (optional) SciCat
  registration per campaign (Step 2b — landed 2026-07-04, replaces the manual
  per-campaign builder run), (4) enable the ASAPO path only when the LaserData
  sidecar is live (Step 2 stays harness-only until then).
- **Demo mode:** local `hzdr/scripts/hzdr-launch.ps1|.sh` with anonymized fixtures
  and the flow monitor; the GitHub Pages demo build (`build-demo.yml`) stays
  the shareable no-backend demo. Demo/prod differ only by `.env` — keep it
  that way.
- **Campaign (decided 2026-07-02):** pilot runs as `Pilot_Verification_07.2026`;
  switch to the real campaign slug at the first production campaign via the
  campaign-rotation procedure.
- **Pilot config exists:** `api/.env.pilot.example` (Kafka on/localhost:9092/pilot
  slug; ASAPO off).
- **Tests:** `hzdr/scripts/test-pilot-package.ps1 -NoCoverage` passed locally on 2026-07-03; broker-backed restart/replay checks still need to run against the deployment Kafka broker.

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
- [ ] Local pilot package gate passed via `hzdr/scripts/test-pilot-package.ps1 -NoCoverage`.

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

> **This manual invocation is a one-off / fallback.** With the builder
> auto-trigger enabled (Step 2b, `DW_API_HZDR_BUILDER__ENABLED=true`) the running
> API reruns exactly this command as a debounced subprocess after each batch of
> new spool events, so you do not have to invoke or schedule it by hand.

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

## Step 2b: Enable the builder auto-trigger and SciCat registration

Both landed 2026-07-04 and are **off by default**; enable them once a consumer is
spooling events for the campaign.

### Builder auto-trigger

With this on, the API reruns `hzdr-hdf5-builder.py` as a debounced subprocess after
each batch of new spool events — no cron/systemd timer or manual Step 1d run needed.
It is a single global trigger (one build per campaign at a time), so the builder's
single-writer PID lock is never contended. The settings mirror the builder CLI;
`OUTPUT_NEXUS` is **required** when `ENABLED=true`.

```ini
DW_API_HZDR_BUILDER__ENABLED=true
DW_API_HZDR_BUILDER__OUTPUT_NEXUS=/data/damnit/hzdr/<campaign>/<campaign>.nxs
DW_API_HZDR_BUILDER__EXPERIMENT_ID=<campaign-slug>
DW_API_HZDR_BUILDER__LABFROG_SQLITE=/data/damnit/hzdr/<campaign>/<campaign>.sqlite
DW_API_HZDR_BUILDER__CAMPAIGN_TIMEZONE=Europe/Berlin
DW_API_HZDR_BUILDER__DEBOUNCE_SECONDS=10.0
DW_API_HZDR_BUILDER__MATCH_TOLERANCE_S=120.0
```

The trigger derives its `--events-jsonl` / `--trigger-jsonl` inputs from the spool
paths of whichever consumers are running, so it stays in sync with Steps 1–2.
Restart and watch for `Builder auto-trigger started`. If `ENABLED=true` but no spool
consumer is enabled, the API logs a warning and nothing triggers the builder.

### SciCat registration

A best-effort builder post-step that registers the campaign NeXus file as a citable
SciCat dataset (path + metadata only — never file contents) and stamps
`scicat_pid`/`version_hash` back into `hzdr_sources.json`. It is **off the go-live
critical path** — the pipeline builds and serves without it — and never fails a
build. The SciCat URL/token live in the plugin's own env; DAMNIT only knows the
plugin URL.

```ini
DW_API_HZDR_SCICAT__ENABLED=true
DW_API_HZDR_SCICAT__PLUGIN_URL=http://scicat-plugin.hzdr.de:5001
DW_API_HZDR_SCICAT__ENDPOINT=from-json          # or "push" for rebuild dedup via version_hash
DW_API_HZDR_SCICAT__INSTRUMENT_ID=<scicat-instrument-id>
DW_API_HZDR_SCICAT__OWNER_GROUP=<scicat-owner-group>
DW_API_HZDR_SCICAT__FRONTEND_URL=https://scicat.hzdr.de   # for the dataset link in the UI
```

Verify: after a build, `GET /metadata/hzdr/sources/<key>/scicat` returns the stored
`scicat_pid`, and the Link Records page shows a SciCat card. A byte-identical rebuild
skips the re-POST (sha256 short-circuit).

---

## Step 3: Run the real-broker Kafka integration gate

This step requires Docker and uses `test-all.ps1 -DockerTests`. Treat it as the
Kafka go-live gate: it verifies the consumer restart/replay semantics against the
broker that will carry `draco.trigger` and `planet.watchdog.events`.

```powershell
$env:KAFKA_TEST_BROKER = "fwkt-webapps.fz-rossendorf.de:9092"   # or localhost:9092 when run on the VM
pwsh hzdr/scripts/test-all.ps1 -DockerTests
```

Expected: all 4 tests in `test_hzdr_broker_roundtrip.py` pass. Then run the manual
pilot restart/replay described in `remaining-work-plan.md` item 3 and record the
match/deduplication counts before calling the Kafka deployment ready.

---

## Step 4: Restart gate and shutdown behavior

The systemd unit (`hzdr/scripts/damnit-api.service`) is already configured with:
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
3. If the builder auto-trigger is on, also update `DW_API_HZDR_BUILDER__OUTPUT_NEXUS`,
   `__EXPERIMENT_ID`, and `__LABFROG_SQLITE` to the new campaign (and the SciCat
   fields if registration is on); the trigger picks up the new spool paths on restart
4. Restart the service: `sudo systemctl restart damnit-api`
5. If instead you run the builder by hand, point `--trigger-jsonl` at the new
   campaign's spool file per Step 1d

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
