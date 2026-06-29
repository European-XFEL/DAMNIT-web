# DAMNIT Web

DAMNIT Web API and frontend with HZDR source integration for LabFrog,
LaserData/ASAPO, DAQ File Watchdog, Kafka, and canonical NeXus campaign files.

## Quick Start

Windows:

```powershell
.\scripts\hzdr-launch.ps1 -InitConfig
.\scripts\hzdr-launch.ps1
```

Linux:

```bash
bash scripts/hzdr-launch.sh --init-config
bash scripts/hzdr-launch.sh
```

Open `http://127.0.0.1:5173/home` or the flow monitor at
`http://127.0.0.1:5173/flow-monitor`.

## Documentation

- [Documentation index](docs/README.md)
- [System overview](docs/system-overview.md)
- [Ordered integration roadmap](docs/integration-roadmap.md)
- [Architecture and identity rules](docs/architecture.md)
- [Local development and verification](docs/local-development.md)
- [Current handoff notes](docs/handoff.md)

API-specific documentation remains in [`api/docs`](api/docs), and frontend
development commands remain in [`frontend/README.md`](frontend/README.md).
