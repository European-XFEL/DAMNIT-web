# DAMNIT Web API

FastAPI and Strawberry GraphQL service for DAMNIT-web.

## Setup

Copy an environment example and edit local values:

```powershell
cd api
Copy-Item .env.test.example .env
```

Install `uv` if needed: <https://docs.astral.sh/uv/>.

## Launchers

Use the launcher that matches the runtime intent:

- `damnit-api-dev.ps1` starts the API for local development with reload enabled
  and a localhost bind.
- `damnit-api-deploy.ps1` starts the API with explicit `uvicorn` deployment
  flags, reload disabled, and a network bind suitable for a reverse proxy or
  service manager.
- `hzdr-dev.ps1` adds HZDR provider setup, source smoke checks, and optional
  frontend startup.

Development:

```powershell
cd api
.\scripts\damnit-api-dev.ps1
```

Deployment:

```powershell
cd api
.\scripts\damnit-api-deploy.ps1 -HostAddress 0.0.0.0 -Port 8000
```

HZDR integration development:

```powershell
cd api
.\scripts\hzdr-dev.ps1 -Provider local -WithGui
```

Direct `uvicorn` invocation is also supported:

```powershell
uv run uvicorn damnit_api.main:create_app --factory --host 0.0.0.0 --port 8000
```

## Documentation

When the API is running:

- FastAPI reference: `http://localhost:8000/docs`
- GraphiQL: `http://localhost:8000/graphql`

Serve the MkDocs documentation:

```powershell
cd api
uv run mkdocs serve
```

## Container

From the repository root:

```powershell
podman build -t damnit-web-api -f api/Dockerfile .
podman run --env-file api/.env --rm -it damnit-web-api
```

## GraphQL Examples

Refresh metadata:

```gql
mutation RefreshMutation {
  refresh(database: { proposal: "<PROPOSAL_OR_SOURCE_KEY>" })
}
```

Query table metadata:

```gql
query TableMetadataQuery {
  metadata(database: { proposal: "<PROPOSAL_OR_SOURCE_KEY>" })
}
```

Query runs:

```gql
query TableDataQuery($per_page: Int = 10) {
  runs(database: { proposal: "2956" }, per_page: $per_page) {
    run {
      value
    }
    added_at {
      value
    }
    ... on p2956 {
      energy_min {
        value
      }
    }
  }
}
```

Subscribe to latest data:

```gql
subscription LatestDataSubscription {
  latest_data(database: { proposal: "<PROPOSAL_OR_SOURCE_KEY>" }, timestamp: <TIMESTAMP>)
}
```

`timestamp` is milliseconds since the Unix epoch.
