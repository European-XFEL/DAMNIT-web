# DAMNIT Web

Monorepo containing projects required to serve DAMNIT data over the web.

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how checks run and how to
contribute.
