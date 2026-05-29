# DAMNIT Web Frontend

React frontend for DAMNIT-web.

## Development

Install dependencies from the repository root:

```sh
pnpm install
```

Start the app:

```sh
pnpm run dev:app
```

Open:

```text
http://localhost:5173
```

Set the API backend in `apps/app/.env` or the repository root `.env`:

```ini
VITE_API=http://127.0.0.1:8000
```

Node and pnpm versions are declared in `frontend/package.json`.

## Deployment

Use the provided compose files for environment-specific builds:

```sh
docker compose -f compose.test.yml up --build
docker compose -f compose.prod.yml up --build
```

The frontend is built as static files and served through nginx. Reverse proxy,
TLS, ports, and API URLs should be configured per deployment environment.
