# DAMNIT - Webserver
`damnit_webserver` is a Python package that handles the integration of the Damnit database and web frontend. This utilizes FastAPI for the web framework, Strawberry for the GraphQL API, and SQLAlchemy for the database management.

## Setup

```sh
poetry install
poetry shell
uvicorn damnit_api.main:app
```

If port `8000` is not free change the port with the `--port NNNN` flag on the `uvicorn` command.

An interactive GraphQL interface can be accessed at `localhost:8000/graphql`.
More information can be found [here](https://github.com/graphql/graphiql/tree/main/packages/graphiql).


## Usage

### 1. Initialize (or refresh) the model
```gql
mutation RefreshMutation {
  refresh(database: {proposal: "<PROPOSAL_NUMBER>"})
}
```

This is done usually on start to create a model of the Damnit table (if not existing). It is a `mutation` as this changes the model.

This returns the following model information:
- schema (id, data type)
- number of rows of the current run database
- timestamp of the last database update


### 2. Query the metadata

```gql
query TableMetadataQuery {
  metadata(database: {proposal: "<PROPOSAL_NUMBER>"})
}
```

This returns the following model information:
- schema (id, data type)
- number of rows of the current run database
- timestamp of the last database update


### 3. Query the runs

For instance, we'd like to query the values of `run`, `added_at`, and
`energy_min` for the first 10 runs in proposal `2956`. We can do it as such:

```gql
query TableDataQuery($per_page: Int = 10) {
  runs(database: {proposal: "2956"}, per_page: $per_page) {
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

Known variables are as follows and is usually defined at the root:
- `proposal`
- `run`
- `start_time`
- `added_at`

Fragments are used for dynamic variables, which varies for every proposal.
This is denoted by `... on p2956`, with the dynamic variables as follows. 

### 4. Subscribe to latest data

```gql
subscription LatestDataSubscription {
  latest_data(database: {proposal: "<PROPOSAL_NUMBER>"}, timestamp: <TIMESTAMP>) 
}
```

This returns the following:
- list of (new) runs
- updated metadata

Note that the `timestamp` is in milliseconds since Unix epoch.

## To-dos
- Rename the package to a more meaningful one (e.g., `damnit_webserver`)
- Clean up and remove the old REST API implementation
- Add more queries (e.g., fetch all values of a variable, fetch saved data of a variable in a run)
- ...and so much more!
