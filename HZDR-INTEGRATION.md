# HZDR Integration Test Harness

This repo can coordinate local smoke tests across these Git repositories:

| Repository | Role |
| --- | --- |
| `https://codebase.helmholtz.cloud/fwk/fwkt/fwkt-data-management/asapo/asapo-for-hzdr-damnit.git` | ASAPO-style local broker and GUI |
| `https://codebase.helmholtz.cloud/fwk/fwkt/fwkt-data-management/infrastructure/kafka-broker-docker.git` | Kafka broker |
| `https://codebase.helmholtz.cloud/fwk/fwkt/fwkt-data-management/data-capturing/labfrog.git` | LabFrog MongoDB and Mongo Express |
| `https://github.com/ktippey-hzdr/DAMNIT-web-hzdr.git` | DAMNIT-web HZDR API |

The coordinator expects those checkouts to be sibling directories by default.
Pass `-ProjectsRoot` to point it at a different parent directory.

The coordinator is:

```powershell
.\scripts\hzdr-integration.ps1
```

By default it only checks paths, tools, and ports. It starts services only when
you pass explicit switches.

For the visual emulator setup, use the launcher instead:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\hzdr-launch.ps1 -InitConfig
```

Edit:

```text
scripts/hzdr-launch.config.json
```

Keep local connection details in that one config file:

```json
"connections": {
  "kafka": {
    "bootstrap": "127.0.0.1:9092",
    "topic": "planet.watchdog.events"
  },
  "asapo": {
    "broker": "http://127.0.0.1:8765"
  },
  "mongo": {
    "uri": "mongodb://root:mypasswd@localhost:27018/?authSource=admin",
    "database": "shotsheet",
    "collection": "shots",
    "shotField": "shot_number"
  }
}
```

Docker Kafka is fine as the broker as long as `connections.kafka.bootstrap`
points at the listener exposed to the host, usually `127.0.0.1:9092`.

Then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\hzdr-launch.ps1
```

That launcher reads the repository folders from the config, generates the HZDR
package emulator output, optionally starts the local ASAPO-style broker, then
starts DAMNIT-web with the visual flow monitor available at:

```text
http://127.0.0.1:5173/flow-monitor
```

## Local Topology

| Piece | Project | Default endpoint |
| --- | --- | --- |
| ASAPO-style local broker and GUI | `asapo-for-hzdr-damnit` | `http://127.0.0.1:8765/` |
| Kafka broker | `kafka-broker-docker` | `127.0.0.1:9092` |
| LabFrog MongoDB | `labfrog` | `mongodb://root:mypasswd@localhost:27018/?authSource=admin` |
| Mongo Express | `labfrog` | `http://127.0.0.1:8081/` |
| DAMNIT-web API | `DAMNIT-web-hzdr/api` | `http://127.0.0.1:8000/` |

The ASAPO-style broker spool is written to
`DAMNIT-web-hzdr/.generated/asapo-broker-spool` by default. Override it with
`-AsapoSpoolDir` if you want the messages somewhere else.

## Useful Commands

Validate the launcher config without starting anything:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\hzdr-launch.ps1 -ValidateOnly
```

Regenerate emulator data but skip API, GUI, and broker startup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\hzdr-launch.ps1 -NoBroker -NoApi -NoGui
```

Change the number of generated shots in:

```json
"emulator": {
  "shotCount": 12,
  "shotIncrement": 1
}
```

`shotCount` repeats the example event package set across more shot IDs.
`shotIncrement` controls the numeric step, for example `2` creates
`shot-000123`, `shot-000125`, `shot-000127`, and so on.

Inspect the generated HDF5 tree:

```powershell
cd api
uv run python scripts/inspect-hzdr-hdf5.py ..\.generated\hzdr-package-emulator\hdf5\exp-2026-05-draco.h5
```

You can also inspect it through DAMNIT-web: open the generated source from
`/home`, select a shot, and use the HDF5 datasets panel.

Check what is currently up:

```powershell
.\scripts\hzdr-integration.ps1
```

Start the local broker and test one produce/consume roundtrip:

```powershell
.\scripts\hzdr-integration.ps1 -StartAsapoBroker -RunAsapoRoundtrip
```

Start LabFrog's MongoDB and verify DAMNIT-web can read HZDR sources from it:

```powershell
.\scripts\hzdr-integration.ps1 -StartLabfrog -RunApiSmoke
```

Start Kafka and run the broker roundtrip from `kafka-broker-docker`:

```powershell
.\scripts\hzdr-integration.ps1 -StartKafka -RunKafkaRoundtrip
```

Verify PLANET Watchdog data using the shared connection config. The verifier
tries Kafka first, then the ASAPO/local broker, then MongoDB:

```powershell
cd api
uv run python scripts/verify-hzdr-watchdog.py --config ..\scripts\hzdr-launch.config.json --mode auto
```

To require all three connections during local testing:

```powershell
cd api
uv run python scripts/verify-hzdr-watchdog.py --config ..\scripts\hzdr-launch.config.json --mode all
```

Run the focused DAMNIT-web HZDR API tests:

```powershell
.\scripts\hzdr-integration.ps1 -RunApiTests
```

Generate a local, production-shaped package emulator output from the normalized
event examples:

```powershell
.\scripts\hzdr-integration.ps1 -RunPackageEmulator -SourceKey hzdr-emulator
```

The emulator writes staged JSONL events, one combined experiment HDF5 file, and
a `hzdr_sources.json` fixture under:

```text
DAMNIT-web-hzdr/.generated/hzdr-package-emulator
```

Point DAMNIT-web at the generated source file with:

```powershell
$env:DW_API_METADATA__PROVIDER = "local"
$env:DW_API_METADATA__SOURCES_FILE = (Resolve-Path ".generated\hzdr-package-emulator\hzdr_sources.json").Path
cd api
.\scripts\hzdr-dev.ps1 -Provider local -WithGui
```

Open the visual flow monitor in the frontend:

```text
http://127.0.0.1:5173/flow-monitor
```

Use the component buttons inside the diagram to animate Watchdog, LaserData,
DAMNIT metadata polling, and HDF5 building. Active arrows light up between the
programs. The monitor treats MongoDB as live shot metadata for DAMNIT polling;
the HDF5 builder reads the staged `events/*.jsonl` package stream and writes
the combined experiment file.

Run the full local integration smoke:

```powershell
.\scripts\hzdr-integration.ps1 `
  -StartLabfrog `
  -StartKafka `
  -StartAsapoBroker `
  -RunAsapoRoundtrip `
  -RunKafkaRoundtrip `
  -RunApiSmoke `
  -RunApiTests
```

## Notes

- `-RunApiSmoke` expects MongoDB to contain either `damnit_web_test.hzdr_sources`
  documents or LabFrog-style `shotsheet.shots` documents. If neither exists,
  the smoke check fails with a clear message.
- The coordinator sets DAMNIT-web HZDR environment variables only inside the
  PowerShell process running the script.
- `-RunPackageEmulator` uses the normalized event contract from
  `asapo-for-hzdr-damnit/examples` by default. Override it with
  `-PackageEventsDir`, `-PackageOutputDir`, and `-ExperimentId` when testing
  other package sets.
- Docker services are left running after startup so you can inspect them. Use
  each sibling project's own shutdown command when you are done.
