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
  metadata(database: {proposal: "<PROPOSAL_OR_SOURCE_KEY>"}) {
    runs {
      proposal
      run
    }
    variables
    tags
    timestamp
  }
}
```

This returns a `TableMeta` snapshot for the proposal:

- `runs` - server-ordered list of `{proposal, run}` pairs. Run numbers repeat
  across the proposals sharing one database, so a run is only identified by
  the pair
- `variables` - map of variable name to its title and tags (includes the
  known variables listed below alongside any user-defined ones)
- `tags` - map of tag name to its id and the variables it groups
- `timestamp` - last update time, in milliseconds since the Unix epoch

### 2. Query the runs

For instance, to fetch the first 10 runs of proposal `2956` along with all
of their cells:

```gql
query TableDataQuery($per_page: Int = 10) {
  runs(database: {proposal: "2956"}, per_page: $per_page) {
    database
    proposal
    run
    cells {
      name
      value
      dtype
    }
  }
}
```

Every run carries the identity trio `database`, `proposal` and `run`. Select
all three in every document: it is what the client normalizes each run by, and
what keeps two proposals' run 5 apart.

The cells are a flat list of `Cell` entries (`name`, `value`, `dtype`). One can
pass a list of `names` to select variables:

```gql
query TableDataQuery($per_page: Int = 10) {
  runs(database: {proposal: "2956"}, per_page: $per_page) {
    cells(names: ["proposal", "run"]) {
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

### 3. Subscribe to run updates

```gql
subscription RunUpdatesSubscription {
  run_updates(database: {proposal: "<PROPOSAL_OR_SOURCE_KEY>"}, since: <TIMESTAMP>) {
    runs {
      database
      proposal
      run
      cells {
        name
        value
        dtype
      }
    }
    metadata {
      runs {
        proposal
        run
      }
      variables
      tags
      timestamp
    }
    timestamp
  }
}
```

Each push is a `RunUpdates`:

- `runs` - the runs whose cells changed since `since`
- `metadata` - the full `TableMeta`, but only on a push where it materially
  changed. It is `null` otherwise, so a tag edit or a new variable arrives
  even on a tick that brings no runs
- `timestamp` - the cursor to send as the next `since`

Note that both `since` and `timestamp` are in milliseconds since the Unix
epoch. Passing `since: 0` is the cold start: it delivers the next tick's
changed runs, not the proposal's history.
