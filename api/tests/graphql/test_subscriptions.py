"""Tests for the latest_data subscription polling logic.

`poll_proposal` and `filter_for_client` are exercised directly against a
`CsvDamnitRepository` (see conftest). The CSV fixtures put run 348's variables
at timestamp 1000.0, so a cursor seeded below that surfaces the run.
"""

import pytest

from damnit_api.graphql.subscriptions import (
    SubscriptionCursors,
    filter_for_client,
    poll_proposal,
)
from damnit_api.shared.models import ProposalNumber

from .const import PROPOSAL

_PROPOSAL = ProposalNumber(PROPOSAL)


@pytest.mark.asyncio
async def test_poll_proposal_surfaces_new_runs(mock_repositories):
    cursors = SubscriptionCursors()
    cursors[_PROPOSAL] = 0.0  # seed below the fixture timestamps
    repo = mock_repositories.get(_PROPOSAL)

    snapshot = await poll_proposal(_PROPOSAL, cursors, repo)

    assert snapshot is not None
    assert set(snapshot.keys()) == {
        "runs",
        "run_timestamps",
        "max_timestamp",
        "metadata",
    }
    assert 348 in snapshot["runs"]
    assert snapshot["max_timestamp"] == pytest.approx(1000.0)
    run_payload = snapshot["runs"][348]
    for variable in run_payload.values():
        assert set(variable.keys()) == {"value", "dtype"}


@pytest.mark.asyncio
async def test_poll_proposal_metadata_shape(mock_repositories):
    cursors = SubscriptionCursors()
    cursors[_PROPOSAL] = 0.0
    repo = mock_repositories.get(_PROPOSAL)

    snapshot = await poll_proposal(_PROPOSAL, cursors, repo)

    assert snapshot is not None
    metadata = snapshot["metadata"]
    assert set(metadata.keys()) == {"runs", "variables", "timestamp"}
    assert 348 in metadata["runs"]
    # ms-timestamp, matching the metadata query's serialization.
    assert metadata["timestamp"] == pytest.approx(1000.0 * 1000)


@pytest.mark.asyncio
async def test_poll_proposal_no_new_data_returns_none(mock_repositories):
    """A cursor at/above the newest row yields nothing."""
    cursors = SubscriptionCursors()
    cursors[_PROPOSAL] = 1000.0
    repo = mock_repositories.get(_PROPOSAL)

    assert await poll_proposal(_PROPOSAL, cursors, repo) is None


def test_filter_for_client_drops_stale_snapshot():
    snapshot = {
        "runs": {348: {"x": {"value": 1, "dtype": "number"}}},
        "run_timestamps": {348: 1000.0},
        "max_timestamp": 1000.0,
        "metadata": {"runs": [348], "variables": {}, "timestamp": 1_000_000.0},
    }
    # since >= max_timestamp -> nothing new
    assert filter_for_client(snapshot, since=1000.0) is None


def test_filter_for_client_returns_fresh_runs():
    snapshot = {
        "runs": {348: {"x": {"value": 1, "dtype": "number"}}},
        "run_timestamps": {348: 1000.0},
        "max_timestamp": 1000.0,
        "metadata": {"runs": [348], "variables": {}, "timestamp": 1_000_000.0},
    }
    result = filter_for_client(snapshot, since=500.0)
    assert result is not None
    assert set(result.keys()) == {"runs", "metadata"}
    assert 348 in result["runs"]


def test_filter_for_client_none_snapshot():
    assert filter_for_client(None, since=500.0) is None
