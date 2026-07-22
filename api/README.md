# DAMNIT - API

`damnit_api` is a Python package that handles the integration of the Damnit database and web frontend. This utilizes FastAPI for the web framework, Strawberry for the GraphQL API, and SQLAlchemy for the database management.

## Setup

Get the environment variables for authentication from [TeamPass](https://passman.xfel.eu/), and put them in a `.env` file in this directory.

`uv` is used for project management, install it if required, see the [uv docs for more information](https://docs.astral.sh/uv/).

This project has some `pre-commit` hooks set up, after installing and activating the running `pre-commit install` will install the hooks and their dependencies.

To start the API server run:

```sh
# Start by calling uvicorn, allows for passing uvicorn flags directly:
uv run uvicorn damnit_api.main:create_app

# Start server by calling the `main` function directly, this only allows
# configuration via env vars or by modifying the `.env` value, has slightly
# improved logging:
uv run -m damnit_api.main
```

If port `8000` is not free you can change the port number, by using the `--port NNNN` flag on the `uvicorn` command, or by setting the `DW_API_UVICORN__PORT` env var if running `damnit_api.main`.

An interactive GraphQL interface can be accessed at `localhost:8000/graphql`. More information can be found [on the GraphiQL readme](https://github.com/graphql/graphiql/tree/main/packages/graphiql).

Running the server in a container can be done by:

```shell
# Running container directly (from the repo root):
podman build -t damnit-web-api -f api/Dockerfile .
podman run --env-file api/.env --rm -it damnit-web-api

# Via compose (from api/):
podman compose up
```

## Usage

### 1. Query the metadata

```gql
query TableMetadataQuery {
  metadata(database: {proposal: "<PROPOSAL_NUMBER>"}) {
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
  run_updates(database: {proposal: "<PROPOSAL_NUMBER>"}, since: <TIMESTAMP>) {
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
