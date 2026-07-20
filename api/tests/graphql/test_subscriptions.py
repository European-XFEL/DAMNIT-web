"""Tests for the latest_data subscription.

Subscribers consume a per-proposal channel fed by the composition-selected
publisher; `filter_for_client` narrows each snapshot to what a given client
has not yet seen. The CSV fixtures put run 348's variables at timestamp
1000.0, and `subscription_repo` injects one fresh run on top.
"""

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from damnit_api.graphql.subscriptions import filter_for_client
from damnit_api.runs.csv import CsvDamnitRepository
from damnit_api.runs.models import RunRecord, VariableValue
from damnit_api.runs.repository import DamnitRepositoryRegistry
from damnit_api.runs.types import DamnitRun
from damnit_api.shared.const import DamnitType
from damnit_api.shared.models import ProposalNumber

from .conftest import make_publisher
from .const import KNOWN_DATA, NEW_DATA, PROPOSAL, RUNS, DatabaseVariable

NEW_RUN = 400
PROPOSAL_NO = ProposalNumber(PROPOSAL)


@pytest.fixture(scope="module")
def current_timestamp():
    return datetime.now(tz=UTC).timestamp()


def _new_record(current_timestamp) -> RunRecord:
    return RunRecord(
        proposal=PROPOSAL_NO,
        run=NEW_RUN,
        start_time=KNOWN_DATA["start_time"].value,  # ty: ignore[invalid-argument-type]
        added_at=KNOWN_DATA["added_at"].value,  # ty: ignore[invalid-argument-type]
        variables={
            name: VariableValue(
                value=data.value,
                summary_type=data.summary_type,
                timestamp=current_timestamp,
            )
            for name, data in NEW_DATA.items()
        },
    )


@pytest.fixture
def subscription_repo(mocker, current_timestamp, csv_fixture_dir):
    """A repository registry whose get_latest_runs returns one fresh run."""
    repo = CsvDamnitRepository(PROPOSAL_NO, csv_fixture_dir)
    mock_get_latest = mocker.AsyncMock(return_value=[_new_record(current_timestamp)])
    mocker.patch.object(repo, "get_latest_runs", mock_get_latest)
    return DamnitRepositoryRegistry(lambda _p: repo)


def _sub_ctx(channels_plugin, publisher, repositories):
    return SimpleNamespace(
        channels=channels_plugin,
        run_update_publisher=publisher,
        repositories=repositories,
    )


_QUERY = """
    subscription LatestDataSubscription(
      $proposal: ProposalNo!,
      $timestamp: Timestamp!) {
      latest_data(
        database: { proposal: $proposal },
        timestamp: $timestamp
      )
    }
"""


@pytest.mark.asyncio
async def test_latest_data(
    graphql_schema,
    current_timestamp,
    subscription_repo,
    channels_plugin,
):
    publisher = make_publisher(channels_plugin, subscription_repo)
    ctx = _sub_ctx(channels_plugin, publisher, subscription_repo)

    subscription = await graphql_schema.subscribe(
        _QUERY,
        variable_values={
            "proposal": PROPOSAL,
            "timestamp": (current_timestamp - 1) * 1000,  # before the new row
        },
        context_value=ctx,
    )

    try:
        result = await asyncio.wait_for(anext(subscription), timeout=2)
        assert not result.errors

        data = {
            **KNOWN_DATA,
            **NEW_DATA,
            "run": DatabaseVariable(
                value=NEW_RUN,
                damnit_dtype=DamnitType.NUMBER,
            ),
        }

        latest_data = result.data["latest_data"]
        assert set(latest_data.keys()) == {"runs", "metadata"}
        assert latest_data["runs"] == {
            NEW_RUN: {
                name: {
                    "value": var.damnit_value,
                    "dtype": var.damnit_dtype.value,
                }
                for name, var in data.items()
            }
        }

        metadata = latest_data["metadata"]
        assert set(metadata.keys()) == {"runs", "timestamp", "variables"}
        assert metadata["runs"] == [*RUNS, NEW_RUN]
        assert metadata["timestamp"] == current_timestamp * 1000

        # Variable names, titles and tags come through the metadata snapshot.
        for name, var_data in DamnitRun.known_variables().items():
            assert name in metadata["variables"]
            assert metadata["variables"][name]["title"] == var_data["title"]
        assert metadata["variables"]["etof_settings.ret0"]["tags"] == ["eTOF setting"]
        assert metadata["variables"]["etof.eTOF_calibration"]["tags"] == ["eTOF"]
    finally:
        await subscription.aclose()
        await publisher.aclose()


@pytest.mark.asyncio
async def test_concurrent_subscriptions_share_one_poll_task(
    graphql_schema,
    current_timestamp,
    subscription_repo,
    channels_plugin,
):
    """Coalescing is structural: N channel subscribers, one poll task."""
    publisher = make_publisher(channels_plugin, subscription_repo)
    ctx = _sub_ctx(channels_plugin, publisher, subscription_repo)

    variables = {
        "proposal": PROPOSAL,
        "timestamp": (current_timestamp - 1) * 1000,
    }
    first_sub = await graphql_schema.subscribe(
        _QUERY, variable_values=variables, context_value=ctx
    )
    second_sub = await graphql_schema.subscribe(
        _QUERY, variable_values=variables, context_value=ctx
    )

    try:
        first = await asyncio.wait_for(anext(first_sub), timeout=2)
        second = await asyncio.wait_for(anext(second_sub), timeout=2)
        assert not first.errors
        assert not second.errors

        # Both subscribers are fed by a single poll task for the proposal.
        assert len(publisher._tasks) == 1
    finally:
        await first_sub.aclose()
        await second_sub.aclose()
        await publisher.aclose()


@pytest.mark.asyncio
async def test_publisher_failure_terminates_subscription_with_typed_error(
    graphql_schema,
    current_timestamp,
    channels_plugin,
):
    """A persistent publisher failure surfaces as a typed error (ADR-001)."""
    failing_repo = MagicMock()
    failing_repo.get_metadata = AsyncMock(side_effect=OSError("gpfs down"))
    registry = DamnitRepositoryRegistry(lambda _p: failing_repo)
    publisher = make_publisher(channels_plugin, registry, max_consecutive_failures=2)
    ctx = _sub_ctx(channels_plugin, publisher, registry)

    subscription = await graphql_schema.subscribe(
        _QUERY,
        variable_values={
            "proposal": PROPOSAL,
            "timestamp": (current_timestamp - 1) * 1000,
        },
        context_value=ctx,
    )

    try:
        result = await asyncio.wait_for(anext(subscription), timeout=2)
        assert result.errors
        assert "unavailable" in result.errors[0].message.lower()
    finally:
        await subscription.aclose()
        await publisher.aclose()


# -----------------------------------------------------------------------------
# filter_for_client


def _snapshot(run_timestamps) -> dict:
    return {
        "runs": {run: {"v": run} for run in run_timestamps},
        "run_timestamps": dict(run_timestamps),
        "max_timestamp": max(run_timestamps.values()),
        "metadata": {"runs": sorted(run_timestamps), "variables": {}},
    }


def test_filter_for_client_none_snapshot():
    assert filter_for_client(None, since=0) is None


def test_filter_for_client_since_zero_returns_none():
    snapshot = _snapshot({1: 100.0, 2: 200.0})
    assert filter_for_client(snapshot, since=0) is None


def test_filter_for_client_excludes_equal_timestamp():
    snapshot = _snapshot({1: 100.0, 2: 200.0})
    result = filter_for_client(snapshot, since=100.0)
    assert result is not None
    assert set(result["runs"]) == {2}


def test_filter_for_client_since_above_all_returns_none():
    snapshot = _snapshot({1: 100.0, 2: 200.0})
    assert filter_for_client(snapshot, since=300.0) is None


# -----------------------------------------------------------------------------
# Authorization


@pytest.mark.asyncio
async def test_latest_data_unauthorized(graphql_schema_no_auth, current_timestamp):
    gen = await graphql_schema_no_auth.subscribe(
        """
        subscription {
          latest_data(database: { proposal: 999999 }, timestamp: 0)
        }
        """,
    )
    # Subscription permission failures surface as a PreExecutionError on the
    # first iteration rather than immediately from subscribe().
    first = await gen.__anext__()
    assert first.errors is not None
    assert first.errors[0].message == "Authentication required."


@pytest.mark.asyncio
async def test_latest_data_forbidden(graphql_schema_authenticated_non_member):
    gen = await graphql_schema_authenticated_non_member.subscribe(
        f"""
        subscription {{
          latest_data(database: {{ proposal: {PROPOSAL} }}, timestamp: 0)
        }}
        """,
    )
    # Subscription permission failures surface as a PreExecutionError on the
    # first iteration rather than immediately from subscribe().
    first = await gen.__anext__()
    assert first.errors is not None
    assert first.errors[0].message == "Access to this proposal is forbidden."
