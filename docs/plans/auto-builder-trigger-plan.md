# Auto builder-trigger plan

**Status:** 🟢 in progress (2026-07-04) · **Roadmap item:** "Builder auto-triggered
after new spool events" (🔴 → in progress) · **Effort:** Low–Medium

## Problem

The durable spool consumers (`consumer/asapo.py`, `consumer/kafka.py`) reliably
land `hzdr-event-v1` events on disk, but nothing rebuilds the canonical NeXus
file + `hzdr_sources.json` catalog afterwards. `HZDRSpoolConsumer.on_new_events()`
(`consumer/spool.py:158`) is an unoverridden no-op stub, and no cron/systemd-timer
for `hzdr-hdf5-builder.py` exists in the repo. Real ingested events therefore sit
in the spool until someone runs the builder by hand — the live deployment behaves
as a manual batch tool despite all the real-time plumbing being present.

## Design

A single **debounced builder trigger** shared by every spool consumer, running as
one more background asyncio task in the FastAPI lifespan (alongside the consumers).

1. **`on_new_events()` becomes a dispatch hook.** The base consumer gains an
   optional `on_new_events_hook` attribute; the default `on_new_events()` calls it
   when set. No change to `from_settings` signatures. Consumers stay ignorant of
   the builder — they just signal "new events landed".
2. **`BuilderTrigger` (`consumer/builder_trigger.py`)** owns an `asyncio.Event`
   wake flag. Each consumer's hook calls `trigger.notify()` (a plain `Event.set()`,
   invoked from the same loop the consumer runs in). Its `run(stop)` loop:
   waits for wake-or-stop → clears the flag → sleeps `debounce_seconds` to
   coalesce a burst of events into one rebuild → runs the builder → loops. Events
   arriving mid-build re-set the flag, so exactly one follow-up rebuild is queued.
3. **The builder runs as a subprocess** (`asyncio.create_subprocess_exec`) rather
   than an in-process import. This preserves the builder's single-writer PID lock
   and full isolation unchanged, and keeps a slow/large HDF5 build off the API
   event loop. The command is assembled from `HZDRBuilderSettings` plus the
   `events.jsonl` / `trigger.jsonl` spool paths of the running consumers
   (ASAPO spool → `--events-jsonl`, Kafka spool → `--trigger-jsonl`).
4. **Idempotency is already guaranteed.** The builder reads the *entire* spool on
   every run and republishes atomically, so a coalesced rebuild, a crash between
   ack and rebuild, or a duplicate trigger all converge to the same catalog. The
   trigger adds no new correctness burden — it only removes the manual step.

## Configuration (`DW_API_HZDR_BUILDER__*`)

| Setting | Default | Purpose |
| --- | --- | --- |
| `ENABLED` | `false` | Master switch; when false `on_new_events` stays a no-op |
| `DEBOUNCE_SECONDS` | `10.0` | Coalescing window after the first new event |
| `OUTPUT_NEXUS` | — (required when enabled) | `--output-nexus` target |
| `EXPERIMENT_ID` | `""` | `--experiment-id` (optional; inferred from events if unset) |
| `SOURCE_KEY` | `hzdr-labfrog` | `--source-key` |
| `CAMPAIGN_TIMEZONE` | `UTC` | `--campaign-timezone` |
| `LABFROG_NEXUS` / `LABFROG_SQLITE` | — | optional LabFrog reconciliation inputs |
| `SOURCES_FILE` | — | `--sources-file` override (defaults beside the NeXus file) |
| `MATCH_TOLERANCE_S` | `120.0` | `--match-tolerance-s` |
| `PYTHON_EXECUTABLE` | `sys.executable` | interpreter used for the subprocess |
| `SCRIPT_PATH` | bundled `scripts/hzdr-hdf5-builder.py` | builder entrypoint |
| `EXTRA_ARGS` | `[]` | escape hatch for any additional builder flags |

A model validator rejects `ENABLED=true` without `OUTPUT_NEXUS`, mirroring the
existing spool-settings validators.

## Deliverables

- `HZDRBuilderSettings` + `Settings.hzdr_builder` wiring.
- `on_new_events_hook` on `HZDRSpoolConsumer`.
- `consumer/builder_trigger.py` (`BuilderTrigger`).
- Lifespan wiring in `main.py`: build the trigger, attach hooks, start/stop its task.
- `.env.production.example` documentation for the new block.
- `tests/test_hzdr_builder_trigger.py`: command assembly, debounce coalescing,
  re-arm after a build, disabled-by-default no-op.

## Non-goals / follow-ups

- A standalone systemd timer for periodic rebuilds remains an alternative for
  deployments that prefer external scheduling; this in-process trigger is the
  default. The two are not mutually exclusive.
- Per-campaign fan-out (one trigger per campaign) is out of scope; the current
  single-campaign-per-deployment model matches the spool settings.
