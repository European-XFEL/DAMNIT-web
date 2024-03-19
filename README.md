# DAMNIT Web

Monorepo containing projects required to serve DAMNIT data over the web.

## Run with docker compose

1. Clone the project

```bash
git clone https://github.com/European-XFEL/DAMNIT-web
cd DAMNIT-web
```

2. Create a `.env` file

e.g.:

```text
UVICORN_HOST=web-backend
UVICORN_PORT=8032
VITE_PORT=8033
VITE_PROPOSAL_NUMBER=6616
```

3. Start the containers

```bash
docker compose up -d
```

