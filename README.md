# DAMNIT Web

Monorepo for serving DAMNIT data through a web API and frontend.

## HZDR Flow

HZDR mode is source-first. Producers emit normalized event packages, the API
serves source and shot metadata, and the frontend shows live traffic, context
columns, trends, and HDF5 previews.

Core flow:

- Producers such as LaserData, Watchdog, motion autologging, and shotsheet
  services create package events.
- Local emulators or production transports stage those events as JSONL.
- The HDF5 builder combines events by `experiment_id + shot_id`.
- DAMNIT-web reads source metadata, context output, and combined HDF5 previews.
- The flow monitor visualizes both local emulated traffic and production
  incoming traffic.

Normalized package fields:

- `experiment_id`
- `shot_id`
- `source`
- `kind`
- `timestamp`
- `transport`
- `payload_ref`
- optional `values` and `metadata`

## Quick Start

Initialize and run the local HZDR launcher from the repository root.

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

Generated events, HDF5 output, and source fixtures are written under:

```text
.generated/hzdr-package-emulator/
```

The launcher searches upward from this checkout for related sibling folders such
as `labfrog`, `planet-watchdog`, and `motion-auto-logger`. Edit
`scripts/hzdr-launch.config.json` when your repository paths, connection
details, shot counts, or output locations are different.

## API Launchers

Use the launcher that matches the runtime:

- `damnit-api-dev.ps1` starts the API for local development with reload enabled
  and a localhost bind.
- `damnit-api-deploy.ps1` starts the API with explicit `uvicorn` deployment
  flags, reload disabled, and a network bind suitable for a reverse proxy or
  service manager.
- `hzdr-dev.ps1` adds HZDR provider setup, source smoke checks, and optional
  frontend startup.

```powershell
cd api
.\scripts\damnit-api-dev.ps1
```

```powershell
cd api
.\scripts\damnit-api-deploy.ps1 -HostAddress 0.0.0.0 -Port 8000
```

```powershell
cd api
uv run mkdocs serve
```

## Workflow Repositories and References

| Repository | Role |
| --- | --- |
| `asapo-for-hzdr-damnit` | Local ASAPO-style broker and normalized examples |
| `kafka-broker-docker` | Optional Kafka smoke-test broker |
| `labfrog` | Local MongoDB shotsheet data and Mongo Express |
| [`planet-watchdog`](https://codebase.helmholtz.cloud/fwk/fwkt/fwkt-data-management/infrastructure/planet-watchdog) | PLANET Watchdog event source for production planet/watchdog traffic |
| [`motion-auto-logger`](https://codebase.helmholtz.cloud/fwk/fwkt/fwkt-data-management/data-capturing/motion-auto-logger) | Optional motion-system autologging enhancer for experiment metadata |
| [`draco-shotcounter`](https://codebase.helmholtz.cloud/fwk/fwkt/fwkt-data-management/infrastructure/draco-shotcounter) | Reference shot-counter implementation for TANGO-aligned shot numbering behavior |
| `DAMNIT-web-hzdr` | API, frontend, package emulator, and flow monitor |

## Future Integrations

| Repository | Planned role |
| --- | --- |
| [`scicat_plugin`](https://codebase.helmholtz.cloud/fwk/fwkt/fwkt-data-management/data-capturing/scicat_plugin) | Future SciCat data-capturing integration for catalog handoff metadata |

## Integration Status Notes

| Area | Current status | What is changing |
| --- | --- | --- |
| PLANET Watchdog | Required workflow source, same category as LabFrog | Flow-monitor Watchdog events use the Kafka-shaped `planet.watchdog.events` metadata path |
| Motion auto logger | Optional workflow source and local enhancer emulator | Launchers discover it when present; flow-monitor Motion events enrich the latest shot through the Kafka-shaped `motion.auto.logger.events` path |
| SciCat plugin | Future downstream catalog target | DAMNIT-web now has a publisher script that can target `/scicat/from-damnit` once the plugin exposes it |

## Documentation

- [FLOW.md](FLOW.md): runtime configuration, source model, auth, and frontend
  routing.
- [HZDR-INTEGRATION.md](HZDR-INTEGRATION.md): local integration launcher,
  sibling services, and smoke-test commands.
