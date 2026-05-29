# HZDR Integration

This repository can coordinate local HZDR smoke tests across DAMNIT-web,
ASAPO-style local transport, Kafka, and LabFrog MongoDB.

## Repositories

The default layout expects these repositories as sibling directories. Use
`-ProjectsRoot` to point the coordinator at another parent directory.

| Repository | Role |
| --- | --- |
| `asapo-for-hzdr-damnit` | ASAPO-style local broker and GUI |
| `kafka-broker-docker` | Kafka broker |
| `labfrog` | MongoDB shotsheet data and Mongo Express |
| `DAMNIT-web-hzdr` | DAMNIT-web HZDR API and frontend |

## Launchers

Use the integration coordinator for service checks and smoke tests:

```powershell
.\scripts\hzdr-integration.ps1
```

Without switches, it validates paths, tools, and ports only. It starts services
only when explicit flags are provided.

Use the visual launcher for the local package emulator, API, frontend, and flow
monitor:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\hzdr-launch.ps1 -InitConfig
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\hzdr-launch.ps1
```

The launcher reads:

```text
scripts/hzdr-launch.config.json
```

Keep local connection details in that file:

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

## Local Endpoints

| Service | Default endpoint |
| --- | --- |
| ASAPO-style broker and GUI | `http://127.0.0.1:8765/` |
| Kafka broker | `127.0.0.1:9092` |
| LabFrog MongoDB | `mongodb://root:mypasswd@localhost:27018/?authSource=admin` |
| Mongo Express | `http://127.0.0.1:8081/` |
| DAMNIT-web API | `http://127.0.0.1:8000/` |
| DAMNIT-web frontend | `http://127.0.0.1:5173/` |
| Flow monitor | `http://127.0.0.1:5173/flow-monitor` |

The local ASAPO-style broker spool is written to:

```text
.generated/asapo-broker-spool
```

Override it with `-AsapoSpoolDir` when needed.

## Emulator Output

The launcher writes local, production-shaped output under:

```text
.generated/hzdr-package-emulator/
```

That directory contains:

- staged JSONL events;
- one combined experiment HDF5 file;
- `hzdr_sources.json` for the local metadata provider.

Adjust the generated shot count in `scripts/hzdr-launch.config.json`:

```json
"emulator": {
  "shotCount": 12,
  "shotIncrement": 1
}
```

`shotIncrement=2` creates shot IDs such as `shot-000123`, `shot-000125`, and
`shot-000127`.

Inspect generated HDF5 content:

```powershell
cd api
uv run python scripts/inspect-hzdr-hdf5.py ..\.generated\hzdr-package-emulator\hdf5\exp-2026-05-draco.h5
```

## Common Commands

Validate launcher configuration:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\hzdr-launch.ps1 -ValidateOnly
```

Regenerate emulator data without starting services:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\hzdr-launch.ps1 -NoBroker -NoApi -NoGui
```

Start the local ASAPO-style broker and run one roundtrip:

```powershell
.\scripts\hzdr-integration.ps1 -StartAsapoBroker -RunAsapoRoundtrip
```

Start LabFrog MongoDB and verify HZDR API metadata access:

```powershell
.\scripts\hzdr-integration.ps1 -StartLabfrog -RunApiSmoke
```

Start Kafka and run one roundtrip:

```powershell
.\scripts\hzdr-integration.ps1 -StartKafka -RunKafkaRoundtrip
```

Verify Watchdog data using the shared launch config:

```powershell
cd api
uv run python scripts/verify-hzdr-watchdog.py --config ..\scripts\hzdr-launch.config.json --mode auto
```

Require all configured connections:

```powershell
cd api
uv run python scripts/verify-hzdr-watchdog.py --config ..\scripts\hzdr-launch.config.json --mode all
```

Run focused DAMNIT-web HZDR API tests:

```powershell
.\scripts\hzdr-integration.ps1 -RunApiTests
```

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

## Flow Monitor

Open:

```text
http://127.0.0.1:5173/flow-monitor
```

In local mode, the monitor buttons create emulated LaserData and Watchdog
traffic. In production, the same view should be fed by real LaserData/ASAPO,
Watchdog/Kafka, MongoDB shotsheet, and HDF5 builder state.

The monitor is intended to show what is arriving, what is staged, what has been
combined into HDF5, and what DAMNIT-web can currently see.

## Notes

- `-RunApiSmoke` expects either `damnit_web_test.hzdr_sources` documents or
  LabFrog-style `shotsheet.shots` documents.
- The coordinator sets DAMNIT-web HZDR environment variables only inside the
  current PowerShell process.
- Docker services remain running after startup. Stop them with each sibling
  repository's own shutdown command.
