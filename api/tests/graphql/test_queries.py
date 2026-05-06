import pytest
import pytest_asyncio
from sqlalchemy import text

from damnit_api.db import DAMNIT_PATH, DatabaseSessionManager
from damnit_api.graphql.models import DamnitRun
from damnit_api.utils import wrap_values

from .const import (
    EXAMPLE_DATA,
    EXAMPLE_VARIABLES,
    KNOWN_DATA,
    PROPOSAL,
    RUNS,
    get_values,
)


@pytest.fixture
def mocked_fetch_variables(mocker):
    # fetch_variables returns wrapped values: {"run": {"value": 348}, ...}
    values = get_values(EXAMPLE_DATA)
    known = {"proposal": values["proposal"], "run": values["run"]}
    dynamic = {
        name: {"value": value, "summary_type": None}
        for name, value in values.items()
        if name not in ("proposal", "run")
    }
    wrapped = {**wrap_values(known), **dynamic}
    return mocker.patch(
        "damnit_api.graphql.queries.fetch_variables",
        return_value=[wrapped],
    )


@pytest.fixture
def mocked_fetch_info(mocker):
    return mocker.patch(
        "damnit_api.graphql.queries.fetch_info",
        return_value=[get_values(KNOWN_DATA)],
    )


@pytest.fixture
def mocked_ensure_damnit_path(mocker):
    """Bypass the damnit_path validation on the metadata query."""
    mocker.patch(
        "damnit_api.graphql.queries._ensure_damnit_path",
        return_value=None,
    )


@pytest.mark.asyncio
async def test_runs_query(graphql_schema, mocked_fetch_variables, mocked_fetch_info):
    query = f"""
        query TableDataQuery($per_page: Int = 2) {{
          runs(database: {{proposal: "{PROPOSAL}"}}, per_page: $per_page) {{
            variables {{
              name
              value
            }}
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None

    runs = result.data["runs"]
    assert len(runs) == 1

    variables = runs[0]["variables"]
    variable_names = {v["name"] for v in variables}
    assert "run" in variable_names
    assert "n_trains" in variable_names

    assert mocked_fetch_variables.call_args.kwargs["names"] is None
    assert mocked_fetch_info.called


@pytest.mark.asyncio
async def test_runs_query_filters_variables_by_name(
    graphql_schema, mocked_fetch_variables, mocked_fetch_info
):
    query = f"""
        query {{
          runs(database: {{proposal: "{PROPOSAL}"}}, per_page: 2) {{
            variables(names: ["n_trains"]) {{
              name
            }}
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None

    variables = result.data["runs"][0]["variables"]
    assert [v["name"] for v in variables] == ["n_trains"]

    assert mocked_fetch_variables.call_args.kwargs["names"] == ["n_trains"]
    assert not mocked_fetch_info.called


@pytest.mark.asyncio
async def test_runs_query_filters_multiple_names(
    graphql_schema, mocked_fetch_variables, mocked_fetch_info
):
    query = f"""
        query {{
          runs(database: {{proposal: "{PROPOSAL}"}}, per_page: 2) {{
            variables(names: ["n_trains", "etof_settings.ret0"]) {{
              name
            }}
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None

    names = {v["name"] for v in result.data["runs"][0]["variables"]}
    assert names == {"n_trains", "etof_settings.ret0"}

    forwarded = mocked_fetch_variables.call_args.kwargs["names"]
    assert set(forwarded) == {"n_trains", "etof_settings.ret0"}


@pytest_asyncio.fixture
async def real_damnit_db(mocker, tmp_path):
    """Real on-disk sqlite with a populated `run_variables` table, wired
    via `find_proposal`. Yields the proposal id.
    """
    proposal = "999999"
    proposal_root = tmp_path / "proposal"
    (proposal_root / DAMNIT_PATH).mkdir(parents=True)

    mocker.patch("damnit_api.db.find_proposal", return_value=str(proposal_root))
    # `registry` is injected by the `Registry` metaclass at class creation.
    DatabaseSessionManager.registry.pop(proposal, None)  # pyright: ignore[reportAttributeAccessIssue]

    manager = DatabaseSessionManager(proposal)
    async with manager.connect() as conn:
        await conn.execute(
            text(
                "CREATE TABLE run_variables ("
                "  proposal INTEGER NOT NULL,"
                "  run INTEGER NOT NULL,"
                "  name TEXT NOT NULL,"
                "  value BLOB,"
                "  summary_type TEXT,"
                "  timestamp REAL NOT NULL,"
                "  PRIMARY KEY (proposal, run, name, timestamp)"
                ")"
            )
        )
        rows = [
            # run 1: has both vars
            (int(proposal), 1, "alpha", "a1", None, 1000.0),
            (int(proposal), 1, "beta", "b1", None, 1000.0),
            # run 2: has only `alpha`
            (int(proposal), 2, "alpha", "a2", None, 1100.0),
            # run 3: has only `beta` (so a filter on `alpha` excludes it)
            (int(proposal), 3, "beta", "b3", None, 1200.0),
        ]
        await conn.execute(
            text(
                "INSERT INTO run_variables"
                " (proposal, run, name, value, summary_type, timestamp)"
                " VALUES (:proposal, :run, :name, :value, :summary_type,"
                " :timestamp)"
            ),
            [
                {
                    "proposal": p,
                    "run": r,
                    "name": n,
                    "value": v,
                    "summary_type": s,
                    "timestamp": t,
                }
                for p, r, n, v, s, t in rows
            ],
        )

    yield proposal

    await manager.close()
    DatabaseSessionManager.registry.pop(proposal, None)  # pyright: ignore[reportAttributeAccessIssue]


@pytest.mark.asyncio
async def test_runs_query_unknown_name(graphql_schema, real_damnit_db):
    """Filtering by an unknown name returns every paginated run with an
    empty `variables` list (regression: an inner join used to drop them).
    """
    proposal = real_damnit_db
    query = f"""
        query {{
          runs(database: {{proposal: "{proposal}"}}, per_page: 10) {{
            variables(names: ["does.not.exist"]) {{
              name
            }}
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None
    runs = result.data["runs"]
    assert [r["variables"] for r in runs] == [[], [], []]


@pytest.mark.asyncio
async def test_runs_query_partial_name_match(graphql_schema, real_damnit_db):
    """Runs with no rows for the filtered name still appear in the page;
    run 3 has no `alpha`, so only the implicit `run` value comes back.
    """
    proposal = real_damnit_db
    query = f"""
        query {{
          runs(database: {{proposal: "{proposal}"}}, per_page: 10) {{
            variables(names: ["alpha", "run"]) {{
              name
              value
            }}
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None
    runs = result.data["runs"]
    by_run = [{v["name"]: v["value"] for v in r["variables"]} for r in runs]
    assert by_run == [
        {"alpha": "a1", "run": 1},
        {"alpha": "a2", "run": 2},
        {"run": 3},
    ]


@pytest.mark.asyncio
async def test_runs_query_fetches_run_info_when_metadata_requested(
    graphql_schema, mocked_fetch_variables, mocked_fetch_info
):
    query = f"""
        query {{
          runs(database: {{proposal: "{PROPOSAL}"}}, per_page: 2) {{
            variables(names: ["start_time"]) {{
              name
            }}
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None
    assert mocked_fetch_info.called
    assert [v["name"] for v in result.data["runs"][0]["variables"]] == ["start_time"]


@pytest.mark.asyncio
async def test_metadata_query(graphql_schema, mocked_ensure_damnit_path):
    query = """
        query TableMetadataQuery($proposal: String) {
          metadata(database: { proposal: $proposal })
        }
    """
    result = await graphql_schema.execute(
        query,
        variable_values={"proposal": str(PROPOSAL)},
    )

    assert result.errors is None

    metadata = result.data["metadata"]
    assert set(metadata.keys()) == {"runs", "variables", "timestamp", "tags"}
    assert metadata["runs"] == RUNS
    assert metadata["variables"] == {
        **DamnitRun.known_variables(),
        **EXAMPLE_VARIABLES,
    }
    assert "(Untagged)" in metadata["tags"]
    assert "eTOF" in metadata["tags"]


@pytest.fixture
def graphql_schema_no_auth(
    mocked_metadata_variables,
    mocked_metadata_column,
    mocked_metadata_all_tags,
    mocked_metadata_variable_tags,
):
    """Schema without the bypass_proposal_permission fixture, so permission
    checks run normally (and fail since there is no real request context)."""
    import strawberry
    from strawberry.schema.config import StrawberryConfig

    from damnit_api.graphql.directives import lightweight
    from damnit_api.graphql.models import SCALAR_MAP, DamnitVariable
    from damnit_api.graphql.queries import Query
    from damnit_api.graphql.subscriptions import Subscription

    return strawberry.Schema(
        query=Query,
        subscription=Subscription,
        types=[DamnitVariable],
        directives=[lightweight],
        config=StrawberryConfig(auto_camel_case=False, scalar_map=SCALAR_MAP),
    )


@pytest.mark.asyncio
async def test_runs_unauthorized(graphql_schema_no_auth):
    query = f"""
        query {{
          runs(database: {{proposal: "{PROPOSAL}"}}) {{
            variables {{ name }}
          }}
        }}
    """
    result = await graphql_schema_no_auth.execute(query)

    assert result.errors is not None
    assert result.errors[0].message == "Authentication required."


@pytest.mark.asyncio
async def test_extracted_data_unauthorized(graphql_schema_no_auth):
    query = f"""
        query {{
          extracted_data(database: {{proposal: "{PROPOSAL}"}}, run: 1, variable: "x")
        }}
    """
    result = await graphql_schema_no_auth.execute(query)

    assert result.errors is not None
    assert result.errors[0].message == "Authentication required."
