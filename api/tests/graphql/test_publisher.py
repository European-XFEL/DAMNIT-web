"""Unit tests for SqlitePollingRunUpdatePublisher.

Cursor semantics, structural coalescing (one poll task per proposal) and the
give-up-with-an-error-event failure path are exercised directly against a
mocked repository. The channels plugin is a plain mock; publish payloads are
asserted, not delivered.
"""

import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from damnit_api.graphql.publisher import (
    SqlitePollingRunUpdatePublisher,
    proposal_channel,
)
from damnit_api.runs.models import MetadataSnapshot, RunRecord, VariableValue
from damnit_api.runs.repository import DamnitRepositoryRegistry
from damnit_api.runs.types import DamnitRun
from damnit_api.shared.models import ProposalNumber

from .const import KNOWN_DATA, NEW_DATA, PROPOSAL

NEW_RUN = 400
PROPOSAL_NO = ProposalNumber(PROPOSAL)


@pytest.fixture
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


def _publisher_for(repo, **kwargs) -> SqlitePollingRunUpdatePublisher:
    registry = DamnitRepositoryRegistry(lambda _p: repo)
    return SqlitePollingRunUpdatePublisher(
        channels=MagicMock(), repositories=registry, **kwargs
    )


# -----------------------------------------------------------------------------
# Cursor semantics


@pytest.mark.asyncio
async def test_poll_uses_existing_cursor(mocker, current_timestamp):
    """On the second poll, the cursor advanced by the first poll is used."""
    proposal = PROPOSAL_NO
    repo = MagicMock()
    repo.get_metadata = AsyncMock(
        return_value=MetadataSnapshot(
            runs=(), variables={}, tags={}, timestamp=current_timestamp - 10
        )
    )
    repo.get_latest_runs = AsyncMock(return_value=[_new_record(current_timestamp)])
    repo.invalidate_metadata_cache = MagicMock()
    mocker.patch.object(
        DamnitRun, "resolve_record", side_effect=lambda r: {"run": r.run}
    )
    publisher = _publisher_for(repo)

    await publisher._poll(proposal)
    assert (call := repo.get_latest_runs.await_args) is not None
    assert call.kwargs["start_at"] == current_timestamp - 10

    await publisher._poll(proposal)
    assert (call := repo.get_latest_runs.await_args) is not None
    assert call.kwargs["start_at"] == current_timestamp


@pytest.mark.asyncio
async def test_poll_cursor_unchanged_on_empty_result(current_timestamp):
    """When get_latest_runs returns [], the cursor is not advanced."""
    proposal = PROPOSAL_NO
    repo = MagicMock()
    repo.get_metadata = AsyncMock(
        return_value=MetadataSnapshot(
            runs=(), variables={}, tags={}, timestamp=current_timestamp
        )
    )
    repo.get_latest_runs = AsyncMock(return_value=[])
    publisher = _publisher_for(repo)

    result = await publisher._poll(proposal)
    assert result is None
    assert publisher._cursors[proposal] == current_timestamp


@pytest.mark.asyncio
async def test_poll_empty_variables_cursor_stays_pinned(mocker, current_timestamp):
    """Runs without variables don't advance the cursor past start_at."""
    proposal = PROPOSAL_NO
    record = RunRecord(
        proposal=proposal,
        run=NEW_RUN,
        start_time=KNOWN_DATA["start_time"].value,  # ty: ignore[invalid-argument-type]
        added_at=KNOWN_DATA["added_at"].value,  # ty: ignore[invalid-argument-type]
        variables={},
    )
    repo = MagicMock()
    repo.get_metadata = AsyncMock(
        return_value=MetadataSnapshot(
            runs=(), variables={}, tags={}, timestamp=current_timestamp
        )
    )
    repo.get_latest_runs = AsyncMock(return_value=[record])
    repo.invalidate_metadata_cache = MagicMock()
    mocker.patch.object(
        DamnitRun, "resolve_record", side_effect=lambda r: {"run": r.run}
    )
    publisher = _publisher_for(repo)

    snapshot = await publisher._poll(proposal)
    assert snapshot is not None
    assert snapshot["max_timestamp"] == current_timestamp
    assert publisher._cursors[proposal] == current_timestamp


# -----------------------------------------------------------------------------
# Structural coalescing: one poll task per proposal


@pytest.mark.asyncio
async def test_watch_is_idempotent_per_proposal():
    """Repeated watch() calls for one proposal share a single poll task."""
    proposal = PROPOSAL_NO
    publisher = _publisher_for(MagicMock())

    publisher.watch(proposal)
    publisher.watch(proposal)
    try:
        assert len(publisher._tasks) == 1
    finally:
        await publisher.aclose()
    assert publisher._tasks == {}


# -----------------------------------------------------------------------------
# Failure behaviour


@pytest.mark.asyncio
async def test_poll_loop_publishes_error_event_after_max_failures(current_timestamp):
    """The poll loop gives up after N consecutive failures with an error event."""
    proposal = PROPOSAL_NO
    repo = MagicMock()
    repo.get_metadata = AsyncMock(side_effect=OSError("gpfs down"))
    channels = MagicMock()
    registry = DamnitRepositoryRegistry(lambda _p: repo)
    publisher = SqlitePollingRunUpdatePublisher(
        channels=channels,
        repositories=registry,
        interval=0,
        max_consecutive_failures=3,
    )

    await asyncio.wait_for(publisher._poll_loop(proposal), timeout=2)

    channels.publish.assert_called_once()
    event, channel = channels.publish.call_args.args
    assert channel == proposal_channel(proposal)
    assert "error" in event
