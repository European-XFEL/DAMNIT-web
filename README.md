# DAMNIT Web

DAMNIT Web API and frontend with HZDR source integration for LabFrog,
LaserData/ASAPO, DAQ File Watchdog, Kafka, and canonical NeXus campaign files.

## Quick Start

Windows:

```powershell
.\hzdr\scripts\hzdr-launch.ps1 -InitConfig
.\hzdr\scripts\hzdr-launch.ps1
```

Linux:

```bash
bash hzdr/scripts/hzdr-launch.sh --init-config
bash hzdr/scripts/hzdr-launch.sh
```

Open `http://127.0.0.1:5173/home` or the flow monitor at
`http://127.0.0.1:5173/flow-monitor`.

For the upstream (non-HZDR) development setup — installing dependencies and
git hooks via `./scripts/setup-dev.sh`, running the API in auth or local
mode, and the plain frontend dev server — see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- [Documentation index](hzdr/docs/README.md)
- [System overview](hzdr/docs/system-overview.md)
- [Ordered integration roadmap](hzdr/docs/status/integration-roadmap.md)
- [Architecture and identity rules](hzdr/docs/architecture.md)
- [Local development and verification](hzdr/docs/guides/local-development.md)
- [Current handoff notes](hzdr/docs/status/handoff.md)

API-specific documentation remains in [`api/docs`](api/docs), and frontend
development commands remain in [`frontend/README.md`](frontend/README.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how checks run and how to
contribute upstream-compatible changes.
