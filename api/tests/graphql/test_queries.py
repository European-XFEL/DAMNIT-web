import pytest
import pytest_asyncio
from sqlalchemy import text

from damnit_api.runs.sqlite import DAMNIT_PATH, DatabaseSessionManager
from damnit_api.runs.types import DamnitRun

from .const import (
    EXAMPLE_DATA,
    EXAMPLE_TAGGED_VARIABLES,
    KNOWN_DATA,
    PROPOSAL,
    RUN_IDENTIFIERS,
    get_values,
)


@pytest.fixture
def mocked_fetch_cells(mocker):
    # fetch_cells returns wrapped values: {"run": {"value": 348}, ...}
    values = get_values(EXAMPLE_DATA)
    wrapped = {
        "proposal": {"value": values["proposal"]},
        "run": {"value": values["run"]},
        **{
            name: {"value": value, "summary_type": None}
            for name, value in values.items()
            if name not in ("proposal", "run")
        },
    }
    return mocker.patch(
        "damnit_api.graphql.queries.fetch_cells",
        return_value=[wrapped],
    )


@pytest.fixture
def mocked_fetch_info(mocker):
    # fetch_info returns a mapping keyed by (proposal, run).
    info = get_values(KNOWN_DATA)
    return mocker.patch(
        "damnit_api.graphql.queries.fetch_info",
        return_value={(info["proposal"], info["run"]): info},
    )


@pytest.mark.asyncio
async def test_runs_query(graphql_schema, mocked_fetch_cells, mocked_fetch_info):
    query = f"""
        query TableDataQuery($per_page: Int = 2) {{
          runs(database: {{proposal: "{PROPOSAL}"}}, per_page: $per_page) {{
            cells {{
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

    cells = runs[0]["cells"]
    cell_names = {c["name"] for c in cells}
    assert "run" in cell_names
    assert "n_trains" in cell_names

    assert mocked_fetch_cells.call_args.kwargs["names"] is None
    assert mocked_fetch_info.called


@pytest.mark.asyncio
async def test_runs_query_returns_identity_trio(
    graphql_schema, mocked_fetch_cells, mocked_fetch_info
):
    query = f"""
        query {{
          runs(database: {{proposal: "{PROPOSAL}"}}, per_page: 2) {{
            database
            proposal
            run
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None
    assert result.data["runs"] == [
        {"database": str(PROPOSAL), "proposal": str(PROPOSAL), "run": 348}
    ]

    # Identity-only: no cells to load, so run_info is skipped too.
    assert mocked_fetch_cells.call_args.kwargs["names"] == []
    assert not mocked_fetch_info.called


@pytest.mark.asyncio
async def test_runs_query_filters_cells_by_name(
    graphql_schema, mocked_fetch_cells, mocked_fetch_info
):
    query = f"""
        query {{
          runs(database: {{proposal: "{PROPOSAL}"}}, per_page: 2) {{
            cells(names: ["n_trains"]) {{
              name
            }}
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None

    cells = result.data["runs"][0]["cells"]
    assert [c["name"] for c in cells] == ["n_trains"]

    assert mocked_fetch_cells.call_args.kwargs["names"] == ["n_trains"]
    assert not mocked_fetch_info.called


@pytest.mark.asyncio
async def test_runs_query_filters_multiple_names(
    graphql_schema, mocked_fetch_cells, mocked_fetch_info
):
    query = f"""
        query {{
          runs(database: {{proposal: "{PROPOSAL}"}}, per_page: 2) {{
            cells(names: ["n_trains", "etof_settings.ret0"]) {{
              name
            }}
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None

    names = {v["name"] for v in result.data["runs"][0]["cells"]}
    assert names == {"n_trains", "etof_settings.ret0"}

    forwarded = mocked_fetch_cells.call_args.kwargs["names"]
    assert set(forwarded) == {"n_trains", "etof_settings.ret0"}


@pytest_asyncio.fixture
async def real_damnit_db(mocker, tmp_path):
    """Real on-disk sqlite with a populated `run_variables` table, wired
    via `find_proposal`. Yields the proposal id.
    """
    proposal = "999999"
    proposal_root = tmp_path / "proposal"
    (proposal_root / DAMNIT_PATH).mkdir(parents=True)

    mocker.patch(
        "damnit_api.runs.sqlite.session.find_proposal",
        return_value=str(proposal_root),
    )
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
                "  attributes BLOB,"
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
    empty `cells` list (regression: an inner join used to drop them).
    """
    proposal = real_damnit_db
    query = f"""
        query {{
          runs(database: {{proposal: "{proposal}"}}, per_page: 10) {{
            cells(names: ["does.not.exist"]) {{
              name
            }}
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None
    runs = result.data["runs"]
    assert [r["cells"] for r in runs] == [[], [], []]


@pytest.mark.asyncio
async def test_runs_query_partial_name_match(graphql_schema, real_damnit_db):
    """Runs with no rows for the filtered name still appear in the page;
    run 3 has no `alpha`, so only the implicit `run` value comes back.
    """
    proposal = real_damnit_db
    query = f"""
        query {{
          runs(database: {{proposal: "{proposal}"}}, per_page: 10) {{
            cells(names: ["alpha", "run"]) {{
              name
              value
            }}
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None
    runs = result.data["runs"]
    by_run = [{v["name"]: v["value"] for v in r["cells"]} for r in runs]
    assert by_run == [
        {"alpha": "a1", "run": 1},
        {"alpha": "a2", "run": 2},
        {"run": 3},
    ]


@pytest_asyncio.fixture
async def two_proposal_db(mocker, tmp_path, request):
    """A file holding two proposals that share a run number, wired via
    `find_proposal`. The addressing proposal (999999) is the active one in
    `metameta`; 888888 is a guest. Yields the addressing proposal id.

    Parametrise indirectly with the `metameta` proposal value to write, or
    with None to write no row at all.
    """
    proposal = "999999"
    active_value = getattr(request, "param", proposal)
    guest = 888888
    proposal_root = tmp_path / "proposal"
    (proposal_root / DAMNIT_PATH).mkdir(parents=True)

    mocker.patch(
        "damnit_api.runs.sqlite.session.find_proposal",
        return_value=str(proposal_root),
    )
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
                "  attributes BLOB,"
                "  timestamp REAL NOT NULL,"
                "  PRIMARY KEY (proposal, run, name, timestamp)"
                ")"
            )
        )
        await conn.execute(
            text("CREATE TABLE run_info (proposal INTEGER, run INTEGER)")
        )
        await conn.execute(text("CREATE TABLE metameta (key TEXT, value TEXT)"))

        variable_rows = [
            # (999999, 1): a superseded and a latest `alpha`.
            (int(proposal), 1, "alpha", "a1_old", 1000.0),
            (int(proposal), 1, "alpha", "a1", 2000.0),
            (int(proposal), 2, "alpha", "a2", 1500.0),
            # Guest run collides on run number 1 with its own value.
            (guest, 1, "alpha", "guest_a1", 1200.0),
        ]
        await conn.execute(
            text(
                "INSERT INTO run_variables"
                " (proposal, run, name, value, timestamp)"
                " VALUES (:proposal, :run, :name, :value, :timestamp)"
            ),
            [
                {"proposal": p, "run": r, "name": n, "value": v, "timestamp": t}
                for p, r, n, v, t in variable_rows
            ],
        )
        await conn.execute(
            text("INSERT INTO run_info (proposal, run) VALUES (:proposal, :run)"),
            [
                {"proposal": int(proposal), "run": 1},
                {"proposal": int(proposal), "run": 2},
                {"proposal": guest, "run": 1},
            ],
        )
        if active_value is not None:
            await conn.execute(
                text("INSERT INTO metameta (key, value) VALUES ('proposal', :value)"),
                {"value": active_value},
            )

    yield proposal

    await manager.close()
    DatabaseSessionManager.registry.pop(proposal, None)  # pyright: ignore[reportAttributeAccessIssue]


@pytest.mark.asyncio
async def test_runs_query_includes_guests_active_block_first(
    graphql_schema, two_proposal_db
):
    """Guests are included and ordered after the active proposal's block,
    and a run number shared across proposals keeps each proposal's value.
    """
    proposal = two_proposal_db
    query = f"""
        query {{
          runs(database: {{proposal: "{proposal}"}}, per_page: 10) {{
            proposal
            run
            cells(names: ["alpha"]) {{ name value }}
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None
    runs = result.data["runs"]

    # Active proposal (999999) block first, then the guest (888888).
    assert [(r["proposal"], r["run"]) for r in runs] == [
        ("999999", 1),
        ("999999", 2),
        ("888888", 1),
    ]

    alpha = [{v["name"]: v["value"] for v in r["cells"]}.get("alpha") for r in runs]
    # The colliding run 1 keeps each proposal's own latest value.
    assert alpha == ["a1", "a2", "guest_a1"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "two_proposal_db",
    # No `proposal` row at all, and a row DAMNIT wrote something unreadable in.
    [None, "not-a-number"],
    indirect=True,
)
async def test_runs_query_without_an_active_proposal_orders_by_proposal_then_run(
    graphql_schema, two_proposal_db
):
    """A file whose `metameta` names no readable active proposal has no block
    to put first, so runs order by (proposal, run) and the guest leads.
    """
    proposal = two_proposal_db
    query = f"""
        query {{
          runs(database: {{proposal: "{proposal}"}}, per_page: 10) {{
            proposal
            run
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None
    assert [(r["proposal"], r["run"]) for r in result.data["runs"]] == [
        ("888888", 1),
        ("999999", 1),
        ("999999", 2),
    ]


@pytest.mark.asyncio
async def test_runs_query_fetches_run_info_when_metadata_requested(
    graphql_schema, mocked_fetch_cells, mocked_fetch_info
):
    query = f"""
        query {{
          runs(database: {{proposal: "{PROPOSAL}"}}, per_page: 2) {{
            cells(names: ["start_time"]) {{
              name
            }}
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None
    assert mocked_fetch_info.called
    assert [v["name"] for v in result.data["runs"][0]["cells"]] == ["start_time"]


@pytest.mark.asyncio
async def test_metadata_query(graphql_schema):
    query = """
        query TableMetadataQuery($proposal: String) {
          metadata(database: { proposal: $proposal }) {
            runs { proposal run }
            variables
            tags
            timestamp
          }
        }
    """
    result = await graphql_schema.execute(
        query,
        variable_values={"proposal": str(PROPOSAL)},
    )

    assert result.errors is None

    metadata = result.data["metadata"]
    assert set(metadata.keys()) == {"runs", "variables", "timestamp", "tags"}
    assert metadata["runs"] == [
        {"proposal": str(proposal), "run": run} for proposal, run in RUN_IDENTIFIERS
    ]
    assert metadata["variables"] == {
        **DamnitRun.known_variables(),
        **EXAMPLE_TAGGED_VARIABLES,
    }
    assert "(Untagged)" in metadata["tags"]
    assert "eTOF" in metadata["tags"]


@pytest.mark.asyncio
async def test_runs_forbidden(graphql_schema_authenticated_non_member):
    query = f"""
        query {{
          runs(database: {{proposal: "{PROPOSAL}"}}) {{
            cells {{ name }}
          }}
        }}
    """
    result = await graphql_schema_authenticated_non_member.execute(query)

    assert result.errors is not None
    assert result.errors[0].message == "Access to this proposal is forbidden."


@pytest.mark.asyncio
async def test_extracted_data_forbidden(graphql_schema_authenticated_non_member):
    query = f"""
        query {{
          extracted_data(database: {{proposal: "{PROPOSAL}"}}, run: 1, variable: "x")
        }}
    """
    result = await graphql_schema_authenticated_non_member.execute(query)

    assert result.errors is not None
    assert result.errors[0].message == "Access to this proposal is forbidden."


@pytest.mark.asyncio
async def test_runs_unauthorized(graphql_schema_no_auth):
    query = f"""
        query {{
          runs(database: {{proposal: "{PROPOSAL}"}}) {{
            cells {{ name }}
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
