# HZDR Integration

This repository can coordinate local HZDR smoke tests across DAMNIT-web,
ASAPO-style local transport, Kafka, LabFrog MongoDB, PLANET Watchdog, and
optional motion autologging.

## Local Smoke-Test Repositories

The launchers search upward from this checkout for these related sibling
directories. Use `-ProjectsRoot` with the integration coordinator, or explicit
paths in `scripts/hzdr-launch.config.json`, when your checkout lives somewhere
else.

| Repository | Role |
| --- | --- |
| `asapo-for-hzdr-damnit` | ASAPO-style local broker and GUI |
| `kafka-broker-docker` | Kafka broker |
| `labfrog` | MongoDB shotsheet data and Mongo Express |
| [`planet-watchdog`](https://codebase.helmholtz.cloud/fwk/fwkt/fwkt-data-management/infrastructure/planet-watchdog) | PLANET Watchdog event source for production planet/watchdog traffic |
| [`motion-auto-logger`](https://codebase.helmholtz.cloud/fwk/fwkt/fwkt-data-management/data-capturing/motion-auto-logger) | Optional motion-system autologging enhancer for experiment metadata |
| `DAMNIT-web-hzdr` | DAMNIT-web HZDR API and frontend |

## Future Integrations

These repositories are planned integration targets, but are not part of the
current required HZDR production path.

| Repository | Role |
| --- | --- |
| [`scicat_plugin`](https://codebase.helmholtz.cloud/fwk/fwkt/fwkt-data-management/data-capturing/scicat_plugin) | Future SciCat data-capturing integration for catalog handoff metadata |

## Integration Status Notes

| Area | Current status | What is changing |
| --- | --- | --- |
| PLANET Watchdog | Required workflow source, same category as LabFrog | Launchers require the repo and flow-monitor events write Kafka-shaped staged metadata |
| Motion auto logger | Optional workflow source and local enhancer emulator | Launchers discover `motion-auto-logger` when present; flow-monitor Motion events enrich the latest shot through the Kafka-shaped `motion.auto.logger.events` path |
| SciCat plugin | Future downstream catalog target | `api/scripts/publish-hzdr-catalog.py` builds DAMNIT catalog payloads for `/scicat/from-damnit`, with fallback to `/scicat/from-json` |

## Related Production References

These repositories document adjacent production behavior that DAMNIT-web HZDR
mode is designed to align with.

| Repository | Role |
| --- | --- |
| [`draco-shotcounter`](https://codebase.helmholtz.cloud/fwk/fwkt/fwkt-data-management/infrastructure/draco-shotcounter) | Reference shot-counter implementation for TANGO-aligned shot numbering behavior |

## Launchers

Use the integration coordinator for service checks and smoke tests:

```powershell
.\scripts\hzdr-integration.ps1
```

Without switches, it validates paths, tools, and ports only. It starts services
only when explicit flags are provided.

Use the visual launcher for the local package emulator, API, frontend, and flow
monitor.

Linux:

```bash
bash scripts/hzdr-launch.sh --init-config
bash scripts/hzdr-launch.sh
```

Windows PowerShell:

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
    "topic": "planet.watchdog.events",
    "topics": {
      "watchdog": "planet.watchdog.events",
      "motionAutoLogger": "motion.auto.logger.events"
    }
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

Broker startup is opt-in through `emulator.startAsapoBroker`. The default Linux
suite path uses the normalized event examples from `asapo-for-hzdr-damnit` and
does not require a local ASAPO broker to be running.

## Emulator Output

The launcher writes local, production-shaped output under:

```text
.generated/hzdr-package-emulator/
```

That directory contains:

- staged JSONL events;
- one combined experiment HDF5 file;
- `hzdr_sources.json` for the local metadata provider.

When `emulator.eventsDir` is empty, the launchers use
`asapo-for-hzdr-damnit/examples` if it contains JSON event packages, otherwise
they use the top-level event examples in `asapo-for-hzdr-damnit`.

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

```bash
bash scripts/hzdr-launch.sh --validate-only
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\hzdr-launch.ps1 -ValidateOnly
```

Regenerate emulator data without starting services:

```bash
bash scripts/hzdr-launch.sh --no-broker --no-api --no-gui
```

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

Dry-run a DAMNIT-to-SciCat catalog payload:

```bash
cd api
uv run python scripts/publish-hzdr-catalog.py --dry-run --limit 1
```

Publish to a local scicat-plugin service:

```bash
cd api
uv run python scripts/publish-hzdr-catalog.py --scicat-url http://127.0.0.1:5001
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

In local mode, the monitor buttons create emulated LaserData, Watchdog, and
Motion auto logger traffic. LaserData appends new shots; Watchdog and Motion
auto logger enrich the latest shot. In production, the same view should be fed
by real LaserData/ASAPO, Watchdog/Kafka, Motion/Kafka, MongoDB shotsheet, and
HDF5 builder state.

The monitor is intended to show what is arriving, what is staged, what has been
combined into HDF5, and what DAMNIT-web can currently see.

## Notes

- `-RunApiSmoke` expects either `damnit_web_test.hzdr_sources` documents or
  LabFrog-style `shotsheet.shots` documents.
- The coordinator sets DAMNIT-web HZDR environment variables only inside the
  current PowerShell process.
- Docker services remain running after startup. Stop them with each sibling
  repository's own shutdown command.
