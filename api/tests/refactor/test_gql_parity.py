"""Ensure GraphQL schema does not unexpectedly change during the refactor.

Two kinds of parity are pinned:

- The full SDL, assembled exactly as `shared/gql.py` does (directly from the Strawberry
  `Schema` object, not through the FastAPI transport), so it keeps working once the
  transport underneath is swapped.
- The wire-shape of a few representative queries/subscriptions, so a resolver rewrite
  that changes response *shape* (not just SDL) is caught too.
"""

import asyncio
import os
from datetime import UTC, datetime
from pathlib import Path

import pytest
import strawberry
from strawberry.schema.config import StrawberryConfig

from damnit_api.graphql import directives as gql_directives
from damnit_api.runs import types as run_types
from damnit_api.runs.types import DamnitRun
from damnit_api.shared.gql import Query, Subscription

from ..graphql.const import (
    EXAMPLE_DATA,
    EXAMPLE_VARIABLES,
    KNOWN_DATA,
    NEW_DATA,
    PROPOSAL,
    get_values,
)
from ..graphql.utils import create_run_variables

SNAPSHOT_PATH = Path(__file__).parent / "snapshots" / "schema.graphql"
NEW_RUN = 400


# -----------------------------------------------------------------------------
# SDL parity: the schema document itself is identical


@pytest.fixture
def full_schema() -> strawberry.Schema:
    """Public schema assembled the same way `shared.gql.get_gql_app` does.

    This is used instead of the FastAPI router so that it will keep working once the
    transport changes.
    """
    return strawberry.Schema(
        query=Query,
        subscription=Subscription,
        types=[run_types.DamnitVariable],
        directives=[gql_directives.lightweight],
        config=StrawberryConfig(
            auto_camel_case=False,
            scalar_map=run_types.SCALAR_MAP,
        ),
    )


def test_public_sdl_unchanged(full_schema):
    sdl = str(full_schema).rstrip("\n") + "\n"

    if os.environ.get("UPDATE_GQL_SNAPSHOT"):
        SNAPSHOT_PATH.write_text(sdl)
        pytest.skip(f"Regenerated {SNAPSHOT_PATH}")

    snapshot = SNAPSHOT_PATH.read_text()
    assert sdl == snapshot, (
        "The public GraphQL schema changed. If this is intentional and "
        "coordinated with the frontend (ADR-009), regenerate the snapshot "
        "with:\n\n"
        "  UPDATE_GQL_SNAPSHOT=1 uv run pytest "
        "tests/refactor/test_gql_parity.py::test_public_sdl_unchanged\n"
    )


# -----------------------------------------------------------------------------
# Wire-shape parity: the exact JSON structure the frontend consumes.
#
# These use `graphql_schema` (reused from tests/graphql/conftest.py), unlike the SDL
# parity above, these assert on *values* too, since the wire shape (key names, nesting,
# ms-timestamps) is what a resolver rewrite could silently change without touching the
# SDL at all


@pytest.fixture
def mocked_fetch_variables(mocker):
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
        "damnit_api.graphql.queries.fetch_variables",
        return_value=[wrapped],
    )


@pytest.fixture
def mocked_fetch_info(mocker):
    return mocker.patch(
        "damnit_api.graphql.queries.fetch_info",
        return_value=[get_values(KNOWN_DATA)],
    )


@pytest.mark.asyncio
async def test_runs_query_wire_shape_unchanged(
    graphql_schema, mocked_fetch_variables, mocked_fetch_info
):
    query = f"""
        query {{
          runs(database: {{proposal: "{PROPOSAL}"}}, per_page: 1) {{
            variables {{
              name
              value
              dtype
            }}
          }}
        }}
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None
    assert set(result.data.keys()) == {"runs"}

    runs = result.data["runs"]
    assert isinstance(runs, list)
    assert set(runs[0].keys()) == {"variables"}

    variables = {v["name"]: v for v in runs[0]["variables"]}
    assert set(variables) >= {"proposal", "run", "n_trains", "start_time"}
    for variable in variables.values():
        assert set(variable.keys()) == {"name", "value", "dtype"}

    # `start_time` is a timestamp: the frontend expects milliseconds
    assert variables["start_time"]["value"] == KNOWN_DATA["start_time"].damnit_value
    assert variables["start_time"]["dtype"] == "timestamp"


@pytest.mark.asyncio
async def test_metadata_query_wire_shape_unchanged(graphql_schema):
    query = """
        query($proposal: ProposalNo!) {
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
    assert isinstance(metadata["runs"], list)
    assert metadata["variables"] == {
        **DamnitRun.known_variables(),
        **EXAMPLE_VARIABLES,
    }
    assert isinstance(metadata["timestamp"], int | float)


@pytest.fixture
def current_timestamp():
    return datetime.now(tz=UTC).timestamp()


@pytest.fixture
def mocked_latest_rows(mocker, current_timestamp):
    table_sentinel = mocker.sentinel.run_variables_table
    mocker.patch(
        "damnit_api.graphql.subscriptions.async_table",
        return_value=table_sentinel,
    )
    mocker.patch(
        "damnit_api.graphql.subscriptions.async_max",
        return_value=0,
    )

    def mocked_returns(*args, table, **kwargs):
        if table is table_sentinel:
            return create_run_variables(
                get_values(NEW_DATA),
                proposal=PROPOSAL,
                run=NEW_RUN,
                timestamp=current_timestamp,
            )
        return None

    return mocker.patch(
        "damnit_api.graphql.subscriptions.async_latest_rows",
        side_effect=mocked_returns,
    )


@pytest.fixture
def mocked_subscription_fetch_info(mocker):
    return mocker.patch(
        "damnit_api.graphql.subscriptions.fetch_info",
        return_value=[{**get_values(KNOWN_DATA), "run": NEW_RUN}],
    )


@pytest.mark.asyncio
async def test_latest_data_subscription_wire_shape_unchanged(
    graphql_schema,
    current_timestamp,
    mocked_latest_rows,
    mocked_subscription_fetch_info,
):
    subscription = await graphql_schema.subscribe(
        """
        subscription(
          $proposal: ProposalNo!,
          $timestamp: Timestamp!) {
          latest_data(
            database: { proposal: $proposal },
            timestamp: $timestamp
          )
        }
        """,
        variable_values={
            "proposal": str(PROPOSAL),
            "timestamp": (current_timestamp - 1) * 1000,
        },
    )

    try:
        result = await asyncio.wait_for(anext(subscription), timeout=2)
        assert not result.errors

        payload = result.data["latest_data"]
        assert set(payload.keys()) == {"runs", "metadata"}

        runs = payload["runs"]
        assert set(runs.keys()) == {NEW_RUN}
        run_data = runs[NEW_RUN]
        assert set(run_data.keys()) >= {"n_trains", "run_length", "xgm_intensity"}
        for variable in run_data.values():
            assert set(variable.keys()) == {"value", "dtype"}

        metadata = payload["metadata"]
        assert set(metadata.keys()) == {"runs", "timestamp", "variables"}
        # ms-timestamp, matching the `metadata` query's serialization
        assert metadata["timestamp"] == current_timestamp * 1000
    finally:
        await subscription.aclose()
