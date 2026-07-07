# DAMNIT Web

Monorepo containing projects required to serve DAMNIT data over the web.

**This is the HZDR fork** of
[European-XFEL/DAMNIT-web](https://github.com/European-XFEL/DAMNIT-web). It
adds source integration for LabFrog, LaserData/ASAPO, DAQ File Watchdog, and
Kafka, and builds canonical per-campaign NeXus files. Everything
HZDR-specific lives under [hzdr/](hzdr/) or in `hzdr`-prefixed modules; the
rest of the tree tracks upstream.

## Quick start

Prerequisites: [uv](https://docs.astral.sh/uv/) and Node >= 24 (via nvm).

Install dependencies and git hooks:

    ./scripts/setup-dev.sh

### Run the API

Auth mode is the usual setup. Copy the env template, fill in the
credentials, then start the server:

    cp api/.env.example api/.env
    cd api
    uv run -m damnit_api.main

The API serves at http://localhost:8000.

Local mode needs no credentials. Point it at a local DAMNIT directory
(one with runs.sqlite, context.py and extracted_data); auth is disabled:

    cd api
    uv run -m damnit_api.main --path /path/to/damnit/dir

### Run the frontend

Copy the env template and set VITE_API to your API (defaults to
http://localhost:8000):

    cp frontend/apps/app/.env.example frontend/apps/app/.env.local

Then start the dev server from the frontend directory:

    cd frontend
    pnpm run dev:app

The app serves at http://localhost:5173/app/. If pnpm is not found, run
`nvm use 24` first.

## Quick start (HZDR stack)

Starts the local broker harness, the API with the HZDR source provider, and
the frontend in one go:

    # Windows
    .\hzdr\scripts\hzdr-launch.ps1 -InitConfig
    .\hzdr\scripts\hzdr-launch.ps1

    # Linux
    bash hzdr/scripts/hzdr-launch.sh --init-config
    bash hzdr/scripts/hzdr-launch.sh

Open `http://127.0.0.1:5173/home` or the flow monitor at
`http://127.0.0.1:5173/flow-monitor`.

## HZDR documentation

- [Documentation index](hzdr/docs/README.md)
- [Screenshots of the UI](hzdr/docs/screenshots.md)
- [System overview](hzdr/docs/system-overview.md)
- [Architecture and identity rules](hzdr/docs/architecture.md)
- [Local development and verification](hzdr/docs/guides/local-development.md)
- [Current handoff notes](hzdr/docs/status/handoff.md)

API-specific documentation remains in [`api/docs`](api/docs), and frontend
development commands remain in [`frontend/README.md`](frontend/README.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how checks run and how to
contribute.
