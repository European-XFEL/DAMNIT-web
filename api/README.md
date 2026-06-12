# DAMNIT Web API


`damnit_api` is a Python package that handles the integration of the Damnit database and web frontend. This utilizes FastAPI for the web framework, Strawberry for the GraphQL API, and SQLAlchemy for the database management.

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

### 1. Query the metadata

```gql
query TableMetadataQuery {
  metadata(database: { proposal: "<PROPOSAL_OR_SOURCE_KEY>" })
}
```

This returns a JSON snapshot for the proposal:

- `runs` - sorted list of run numbers in the proposal
- `variables` - map of variable name to its title and tags (includes the
  known variables listed below alongside any user-defined ones)
- `tags` - map of tag name to its id and the variables it groups
- `timestamp` - last update time, in milliseconds since the Unix epoch

### 2. Query the runs

For instance, to fetch the first 10 runs of proposal `2956` along with all
of their variables:

```gql
query TableDataQuery($per_page: Int = 10) {
  runs(database: {proposal: "2956"}, per_page: $per_page) {
    variables {
      name
      value
      dtype
    }
  }
}
```

Each run is returned as a flat list of `DamnitVariable` entries (`name`,
`value`, `dtype`). One can pass a list of `names` to select variables:

```gql
query TableDataQuery($per_page: Int = 10) {
  runs(database: {proposal: "2956"}, per_page: $per_page) {
    variables(names: ["proposal", "run"]) {
      name
      value
      dtype
    }
  }
}
```

The following variables are always present, in addition to any user-defined
ones from the proposal's context file:

- `proposal`
- `run`
- `start_time`
- `added_at`

Pagination is controlled with `page` (1-indexed, defaults to `1`) and
`per_page` (defaults to `10`).

### 3. Subscribe to latest data

```gql
subscription LatestDataSubscription {
  latest_data(database: { proposal: "<PROPOSAL_OR_SOURCE_KEY>" }, timestamp: <TIMESTAMP>)
}
```

This returns the following:

- list of (new) runs
- updated metadata

Note that the `timestamp` is in milliseconds since Unix epoch.
