# Local Development

## Repositories

```text
GitHub/DAMNIT-web-hzdr
GitLab/asapo-for-hzdr-damnit
GitLab/kafka-broker-docker
GitLab/labfrog
GitLab/labfrog-sqlite-tools-repo
GitLab/planet-watchdog
GitLab/shotcounter
```

## Choose the launch mode

### Standard configured API (spool mode)

The regular API command reads `api/.env` and owns the enabled Kafka/ASAPO spool
consumers and optional builder for its full process lifetime:

```powershell
Set-Location api
uv run -m damnit_api.main
```

Use `api/.env.production.example` as the annotated starting point for spool and
builder settings. This is the launch mode for consuming real or local broker
events into the durable spool. Run the frontend separately as described in the
root README.

### HZDR package emulator

The HZDR launcher is a separate orientation/UI mode. It discovers sibling
checkouts or uses `hzdr/scripts/hzdr-launch.config.json`, generates a local
`hzdr_sources.json` from bundled event packages, and serves that emulator
catalog through the API and frontend. Both `.ps1` and `.sh` honor the launch
config's `auth.mode`; the launcher-config section of
[api/docs/hzdr.md](../../../api/docs/hzdr.md) has the full key list.

Do not run both modes on the same API/frontend ports at once.

### ASAPO standalone image

The ASAPO broker runs from the standalone image. Generate a DESY GitLab token,
log in, and pull it manually — version `24.11.0` is known to work:

```bash
docker pull gitlab.desy.de:5555/asapo/asapo/asapo-standalone:24.11.0
```

```powershell
.\hzdr\scripts\hzdr-launch.ps1 -InitConfig
.\hzdr\scripts\hzdr-launch.ps1 -ValidateOnly
.\hzdr\scripts\hzdr-launch.ps1
```

Linux uses the equivalent `hzdr/scripts/hzdr-launch.sh` commands.

## Build A Pilot File

First export the selected campaign with `labfrog-sqlite-tools`. Then, from
`api`, run:

```powershell
uv run python scripts\hzdr-hdf5-builder.py `
  --labfrog-nexus <labfrog.nxs> `
  --labfrog-sqlite <labfrog.sqlite> `
  --events-jsonl <laserdata.jsonl> `
  --watchdog-jsonl <watchdog.jsonl> `
  --trigger-jsonl <draco.jsonl> `
  --experiment-id Solenoid_Beamline_Tests_01.2025 `
  --source-key hzdr-solenoid-beamline-tests-01-2025 `
  --campaign-timezone Europe/Berlin `
  --output-nexus <canonical.nxs> `
  --sources-file <hzdr_sources.json>
```

For a first build against retained real campaign files, force
`DW_API_HZDR_SCICAT__ENABLED=false` in the builder process even if the local
`.env` enables registration. Validate the NeXus and source catalog before
allowing an external write.

A build that combines a real LabFrog export with synthetic acceptance events is
a mixed integration candidate, not a representative campaign. Keep automatic
DAMNIT registration disabled for that build. If the deployed plugin boundary
itself needs testing, submit a separately titled `TEST` payload with
`release_evidence=false` and `representative=false`; enable builder-driven
registration only for the intended all-real campaign artifact.

Point the API at the catalog:

```powershell
$env:DW_API_METADATA__PROVIDER = "local"
$env:DW_API_METADATA__SOURCES_FILE = "<hzdr_sources.json>"
# Optional: the read-only curated SQLite snapshots from labfrog-sqlite-tools;
# Review matches suggests their campaign keys (unset => no suggestions).
$env:DW_API_METADATA__LABFROG_CURATED_DIR = "<curated_files>"
uv run -m damnit_api.main
```

Generated emulator files live under `.generated/hzdr-package-emulator`. They
are not evidence that an event traversed a configured spool consumer.

To check the local vertical slice (emulator events through the review API that the Review matches page uses)
without building a real pilot file, run
`uv run python scripts/hzdr-local-acceptance.py` from `api`, or
`hzdr/scripts/test.ps1 -WithAcceptance` from the repo root. Testing commands are
in [testing.md](../status/testing.md).

To rehearse the flow as it is deployed, add `--real-topology`. The shot
authority's triggers and a DAQ File Watchdog file event arrive `unassigned` in
a Kafka-style spool; a LabFrog export and a campaign schedule resolve the
campaigns; the multi-campaign builder builds them; a ruling posted over HTTP
moves the one shot nothing could place. It is a rehearsal on generated data,
not evidence about the server.

The Flow Monitor's demo buttons write the same envelopes: **Shotcounter**
stages the shot authority's `draco.trigger` event (`DRACO-Trigger`,
`trigger.threshold_crossing`, `experiment_id: "unassigned"`, the number in
`shot_number`) in `events/draco-trigger.jsonl`, and **Watchdog** stages a file
event attributed to the latest shot, with `instrument.*`, `attribution.*`,
`acquisition.*` and `producer.instance_id`, in `events/daq-file-watchdog.jsonl`.
The emulator stands in for the authority (it issues the next number) and for
campaign resolution (the shot lands in the selected campaign, marked
`experiment_id_source: "schedule"`).
