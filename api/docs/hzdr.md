# HZDR Integration

DAMNIT-web HZDR mode is source-first rather than proposal-first. The working
unit is a source with shot metadata, staged event packages, context columns,
trend previews, and combined HDF5 output.

The live visualization is intended for both development and production. Local
development uses emulated LaserData and Watchdog buttons to create traffic; a
production deployment should feed the same view from real ASAPO/Kafka/MongoDB
state and the operational HDF5 builder.

Start with the quick path, then expand the sections relevant to the workflow
you are validating.

## Quick Path

1. Create the launcher config.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ..\scripts\hzdr-launch.ps1 -InitConfig
```

2. Edit the generated config.

```text
scripts/hzdr-launch.config.json
```

3. Start the emulator, API, and frontend.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ..\scripts\hzdr-launch.ps1
```

4. Open the workspace.

```text
http://127.0.0.1:5173/home
```

5. Use the flow monitor to send test traffic.

```text
http://127.0.0.1:5173/flow-monitor
```

## Mental Model

- LaserData produces raw shot events that flow into a broker (ASAPO-style).
- PLANET Watchdog can publish enrichment events into Kafka.
- Both brokers produce staged events as JSONL files (events/*.jsonl).
- The HDF5 builder consumes staged JSONL packages and writes a combined
  experiment HDF5 file.
- DAMNIT-web reads live metadata from MongoDB and previews data from the
  combined HDF5 output; `context.py` provides context joining logic.

Summary: LaserData/Watchdog -> broker(s) -> staged JSONL -> HDF5 builder
-> combined HDF5 -> DAMNIT-web. MongoDB provides live metadata lookups.

## JSONL to HDF5

The JSONL-to-HDF5 transition is an explicit boundary (not an automatic side
effect of polling). Typical steps:

1. The producer or enhancer (LaserData or Watchdog)
  appends normalized package events to `events/*.jsonl`.
2. DAMNIT may read staged state for visibility and UI previews.
3. The HDF5 builder is triggered (manually via the flow monitor or by an
  operational signal) to read the staged JSONL packages.
4. The builder writes combined shot datasets into a single `experiment.h5` file.
5. DAMNIT reads/previews datasets and uses them for context inputs in the UI.

In the local emulator, the **Build HDF5** button in the flow monitor triggers
the build/finalize request. In production the builder should be invoked by an
operational mechanism (run-close hook, scheduled job, or consumed builder
message). The contract remains: builder consumes staged packages and writes a
combined HDF5 that DAMNIT can later read.

<details>
<summary>Launcher config</summary>

The launcher reads:

```text
scripts/hzdr-launch.config.json
```

Use the example file as the shared shape for local and real-adjacent testing:

```text
scripts/hzdr-launch.config.example.json
```

Important sections:

- `paths`: repo folders and generated output locations.
- `emulator`: source key, starting shot number, shot count, and increment.
- `connections.kafka`: bootstrap server, default Watchdog topic, and optional
  topic map for enhancer sources.
- `connections.asapo`: local broker URL/spool settings.
- `connections.mongo`: MongoDB URI, database, and source collection.
- `flowMonitor.receivers`: which producer boxes the flow monitor accepts
  traffic from (`laserData`, `watchdog`, `mongo`).
- `flowMonitor.producers`: per-producer-box settings rendered by the flow
  monitor instead of hard-coded frontend lists - Shotcounter's selectable
  `tkeys`, Watchdog's selectable `watchers`, and Mongo's
  `updatesDamnitSqlite` toggle. Edit this file to add/remove options; the API
  reads it directly via `DW_API_FLOW_MONITOR__CONFIG_FILE` (set by the
  launcher) and the frontend renders whatever it reports from
  `GET /config/runtime`.

The launcher generates:

```text
.generated/hzdr-package-emulator/events/*.jsonl
.generated/hzdr-package-emulator/hdf5/<experiment-id>.h5
.generated/hzdr-package-emulator/hzdr_sources.json
```

Useful launcher modes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ..\scripts\hzdr-launch.ps1 -ValidateOnly
powershell -NoProfile -ExecutionPolicy Bypass -File ..\scripts\hzdr-launch.ps1 -NoBroker -NoApi -NoGui
```

</details>

<details>
<summary>Flow monitor</summary>

Open:

```text
http://127.0.0.1:5173/flow-monitor
```

The flow monitor is the visual test bench locally and the live traffic view in
production.

- **LaserData** appends a new emulated shot.
- **PLANET Watchdog** enriches the latest shot through the Kafka-style path.
- **Build HDF5** simulates the production build/finalize trigger and combines
  staged packages into the experiment HDF5.
- **Poll DAMNIT** reloads source metadata and table-visible shots.

Use it when you want to verify that shot numbers increment, package arrows move,
and DAMNIT can see the staged source data.

In production, the same visualization should be driven by real incoming
LaserData/ASAPO events, Watchdog/Kafka enrichment, MongoDB shotsheet metadata,
and builder status instead of button-triggered emulator writes. The UI should
remain the operator-facing picture of what is arriving and what DAMNIT can see.

</details>

<details>
<summary>Source table</summary>

Open a source from `/home` or from the flow monitor.

The source table shows fixed shot metadata first, then active context columns.
Select any table cell to inspect it in the right panel.

- Numeric metadata cells show campaign trends automatically.
- Plot-backed context cells show an inline sparkline in the table.
- Plotly context previews render as charts in the selected-cell panel.
- The filter helper supports column selection, `includes`, equality, and
  greater-than/less-than numeric matching.
- The Day column is campaign-relative (`Day 1`, `Day 2`, ...), not the calendar
  date.

</details>

<details>
<summary>Context builder</summary>

Open a source, then choose **Context builder** from the table toolbar.

The builder writes editable context files under the configured API-side context
workspace:

```text
<context-root>/<source-key>/<user>/context.py
```

Column modes:

- Metadata: one selected metadata field.
- HDF5 summary: one HDF5 dataset summarized to a scalar.
- Image preview: one image-like dataset with a preview.
- Lineout preview: one line-like dataset with a preview.
- Plotly trend: one dataset rendered as a Plotly preview.
- Mongo query: one MongoDB-backed metadata lookup.
- Custom function: multi-input mode for combining values.

Imports are kept at the top of the file. Generated snippets are grouped by
column so the context file remains readable as it grows.

</details>

<details>
<summary>HDF5 output</summary>

The HDF5 builder consumes staged event packages from JSONL. It does not query
MongoDB to decide what to combine.

Local trigger:

```text
Flow monitor -> Build HDF5
```

Production trigger:

```text
run close / shot-set complete / scheduled builder / broker message
    -> HDF5 builder
    -> combined experiment HDF5
    -> DAMNIT reads hdf5_path and previews datasets
```

This repo does not prescribe which production trigger HZDR must use. It keeps
the contract explicit so the emulator can be replaced by a real builder service
without changing the DAMNIT table/context behavior.

Inspect the generated tree from Python (use `uv run` for local/dev scripts):

```powershell
uv run python - <<'PY'
import h5py

path = r"..\.generated\hzdr-package-emulator\hdf5\hzdr-emulator.h5"
with h5py.File(path, "r") as handle:
  handle.visititems(lambda name, obj: print(name, getattr(obj, "shape", "")))
PY
```

In the app, open a source, select a shot, then expand **Shot detail** to view
HDF5 datasets and previews.

The emulator includes representative datasets under `fixtures/` so the context
builder can test the expected display types:

- `fixtures/scalars/laser_energy_j_by_shot`: scalar trend values.
- `fixtures/lineouts/pulse_energy_j_by_shot`: 1D lineout data by shot.
- `fixtures/images/camera_raw_by_shot`: floating-point image data.
- `fixtures/images/camera_mask_by_shot`: integer mask image data.
- `fixtures/images/camera_labels_by_shot`: integer label image data.
- `fixtures/stacks/camera_stack_by_shot`: small 3D image stacks.
- `fixtures/by_shot/<shot_id>/...`: per-shot scalar, lineout, image, and stack
  examples.

</details>

<details>
<summary>Kafka, ASAPO, and MongoDB verifier</summary>

The watchdog verifier can try Kafka first and fall back through ASAPO/local
broker and MongoDB:

```powershell
cd api
uv run python scripts/verify-hzdr-watchdog.py --config ..\scripts\hzdr-launch.config.json --mode auto
```

To require every configured backend:

```powershell
cd api
uv run python scripts/verify-hzdr-watchdog.py --config ..\scripts\hzdr-launch.config.json --mode all
```

Docker Kafka is fine. The important part is that
`connections.kafka.bootstrap` points at the broker the API and verifier can
reach, for example `127.0.0.1:9092`.

</details>

<details>
<summary>Troubleshooting</summary>

- If the frontend says `pnpm` is missing inside a script, run through
  `corepack pnpm` or install/enable pnpm for the Node version being used.
- If the app requires Node `>=24`, update Node before running the frontend.
- If context columns disappear, check the browser console and reload context
  results from the source table.
- If plot previews show JSON, the preview object should be shaped like
  `{ "kind": "plotly", "json": "..." }`.
- If HDF5 does not update, build from staged events and confirm the JSONL files
  contain the shots you expect.
- If MongoDB data appears stale, remember that MongoDB is live metadata; the
  HDF5 builder does not use it as the combine source.

</details>

## Related Files

- `README.md`: high-level project orientation.
- `docs/architecture.md`: provider model, identity, and HZDR-vs-EXFEL notes.
- `docs/integration-roadmap.md`: ordered cross-repository implementation plan.
- `docs/local-development.md`: launcher, repository list, and integration commands.
- `docs/handoff.md`: current status and the next session's starting point.
- `scripts/hzdr-launch.config.example.json`: shared connection/config shape.
- `api/scripts/verify-hzdr-watchdog.py`: Kafka/ASAPO/Mongo verifier.
- `api/scripts/hzdr-local-acceptance.py`: local-only HTTP acceptance check
  (emulator events through Confirm Matches), no sibling repo or broker
  required - see `docs/testing.md`.
- `api/examples/*.example.json`: the shared normalized source-event contract,
  kept in sync by hand with `asapo-for-hzdr-damnit/examples/` and
  `planet-watchdog/testing/examples/normalized-events/`.
- `api/examples/Example_Campaign_06.2026.light.sqlite`: lightweight,
  anonymized LabFrog SQLite example with the real export schema and a handful
  of modified sample rows.
