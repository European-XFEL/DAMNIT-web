"""Ensure GraphQL schema does not unexpectedly change during the refactor.

Two kinds of parity are pinned:

- The full SDL, assembled exactly as `shared/gql.py` does (directly from the Strawberry
  `Schema` object, not through the FastAPI transport), so it keeps working once the
  transport underneath is swapped.
- The wire-shape of a few representative queries/subscriptions, so a resolver rewrite
  that changes response *shape* (not just SDL) is caught too. These run against the
  CSV-backed repository from `tests/graphql/conftest.py` (fixture run 348).
"""

import os
from pathlib import Path

import pytest
import strawberry
from strawberry.schema.config import StrawberryConfig

from damnit_api.graphql import directives as gql_directives
from damnit_api.runs import types as run_types
from damnit_api.shared.gql import Query, Subscription

from ..graphql.const import PROPOSAL

SNAPSHOT_PATH = Path(__file__).parent / "snapshots" / "schema.graphql"

FIXTURE_RUN = 348
FIXTURE_VARIABLES = {"n_trains", "run_length", "xgm_intensity"}


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
# Wire-shape parity: the exact JSON structure the frontend consumes (key names,
# nesting, ms-timestamps) - what a resolver rewrite could change without
# touching the SDL. Exercised against the CSV-backed repository.


@pytest.mark.asyncio
async def test_runs_query_wire_shape_unchanged(graphql_schema):
    query = f"""
        query {{
          runs(database: {{proposal: {PROPOSAL}}}, per_page: 1) {{
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
    assert set(variables) >= {"proposal", "run", "start_time"} | FIXTURE_VARIABLES
    for variable in variables.values():
        assert set(variable.keys()) == {"name", "value", "dtype"}

    # `start_time` is a timestamp variable.
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
        variable_values={"proposal": PROPOSAL},
    )

    assert result.errors is None

    metadata = result.data["metadata"]
    assert set(metadata.keys()) == {"runs", "variables", "timestamp", "tags"}
    assert isinstance(metadata["runs"], list)
    assert isinstance(metadata["variables"], dict)
    for variable in metadata["variables"].values():
        assert set(variable.keys()) == {"name", "title", "tags"}
    assert isinstance(metadata["timestamp"], int | float)


@pytest.mark.asyncio
async def test_latest_data_subscription_wire_shape_unchanged(mock_repositories):
    """The subscription's client payload shape, exercised through the same
    publisher `_poll`/`filter_for_client` path that feeds the resolver's
    channel."""
    from unittest.mock import MagicMock

    from damnit_api.graphql.publisher import SqlitePollingRunUpdatePublisher
    from damnit_api.graphql.subscriptions import filter_for_client
    from damnit_api.shared.models import ProposalNumber

    proposal = ProposalNumber(PROPOSAL)
    publisher = SqlitePollingRunUpdatePublisher(
        channels=MagicMock(), repositories=mock_repositories
    )
    publisher._cursors[proposal] = 0.0  # seed below the fixture timestamps

    snapshot = await publisher._poll(proposal)
    result = filter_for_client(snapshot, since=500.0)

    assert result is not None
    assert set(result.keys()) == {"runs", "metadata"}

    runs = result["runs"]
    assert FIXTURE_RUN in runs
    for variable in runs[FIXTURE_RUN].values():
        assert set(variable.keys()) == {"value", "dtype"}

    metadata = result["metadata"]
    assert set(metadata.keys()) == {"runs", "timestamp", "variables"}
    # ms-timestamp, matching the `metadata` query's serialization.
    assert isinstance(metadata["timestamp"], int | float)
