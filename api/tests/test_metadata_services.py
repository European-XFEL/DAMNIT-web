"""Tests for damnit_api.metadata.services against a real app-DB session.

Exercises the Advanced Alchemy repository-backed code paths (cache hit,
fetch-and-add on miss, upsert) with a real in-memory engine rather than a
mocked session.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio

from damnit_api.metadata.models import ProposalMetaBase
from damnit_api.shared.models import ProposalNumber


@pytest_asyncio.fixture
async def appdb_session():
    """A real (in-memory) app-DB session, tables created from SQLModel metadata."""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlmodel import SQLModel

    import damnit_api.metadata.models  # noqa: F401 - registers the tables

    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


def _fetched_meta(number: int, damnit_path: str | None = "/some/path"):
    return ProposalMetaBase(
        id=number,
        number=ProposalNumber(number),
        cycle="202401",
        instrument="TST",
        path=f"/gpfs/exfel/exp/TST/202401/p{number:06d}",
        title=f"Proposal {number}",
        principal_investigator="Test User",
        start_date=datetime(2024, 1, 1, tzinfo=UTC),
        end_date=None,
        damnit_path=damnit_path,
    )


@pytest.mark.asyncio
async def test_get_proposal_meta_fetches_and_caches_on_miss(mocker, appdb_session):
    """A cache miss fetches from MyMdC and adds the result via the repository."""
    from damnit_api.metadata.services import _get_proposal_meta

    proposal_number = ProposalNumber(100001)
    mocker.patch(
        "damnit_api.metadata.services._fetch_proposal_meta",
        AsyncMock(return_value=_fetched_meta(int(proposal_number))),
    )

    result = await _get_proposal_meta(MagicMock(), proposal_number, appdb_session)

    assert result.number == proposal_number
    assert result.id is not None


@pytest.mark.asyncio
async def test_get_proposal_meta_returns_cached_row_without_fetching(
    mocker, appdb_session
):
    """A cache hit returns the stored row and does not call MyMdC again."""
    from damnit_api.metadata.services import _get_proposal_meta

    proposal_number = ProposalNumber(100002)
    fetch = mocker.patch(
        "damnit_api.metadata.services._fetch_proposal_meta",
        AsyncMock(return_value=_fetched_meta(int(proposal_number))),
    )

    await _get_proposal_meta(MagicMock(), proposal_number, appdb_session)
    fetch.reset_mock()

    result = await _get_proposal_meta(MagicMock(), proposal_number, appdb_session)

    assert result.number == proposal_number
    fetch.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_proposal_meta_many_fetches_missing_and_keeps_cached(
    mocker, appdb_session
):
    """Cached proposals are returned from the repository; missing ones are
    fetched and persisted via `add_many`, then included in the result."""
    from damnit_api.metadata.services import _get_proposal_meta, _get_proposal_meta_many

    cached = ProposalNumber(100003)
    missing = ProposalNumber(100004)

    mocker.patch(
        "damnit_api.metadata.services._fetch_proposal_meta",
        AsyncMock(side_effect=lambda client, no: _fetched_meta(int(no))),
    )
    await _get_proposal_meta(MagicMock(), cached, appdb_session)

    results = await _get_proposal_meta_many(
        MagicMock(),
        [cached, missing],
        appdb_session,
        only_with_damnit=False,
    )

    result_numbers = {r.number for r in results}
    assert result_numbers == {cached, missing}


@pytest.mark.asyncio
async def test_update_proposal_meta_upserts_existing_row(mocker, appdb_session):
    """Refreshing an already-cached proposal updates its fields in place
    (matched on `number`), rather than creating a duplicate row."""
    from damnit_api.metadata.services import _get_proposal_meta, _update_proposal_meta

    proposal_number = ProposalNumber(100005)
    mocker.patch(
        "damnit_api.metadata.services._fetch_proposal_meta",
        AsyncMock(return_value=_fetched_meta(int(proposal_number))),
    )
    original = await _get_proposal_meta(MagicMock(), proposal_number, appdb_session)

    mocker.patch(
        "damnit_api.metadata.services._fetch_proposal_meta",
        AsyncMock(
            return_value=_fetched_meta(int(proposal_number), damnit_path="/new/path")
        ),
    )
    updated = await _update_proposal_meta(MagicMock(), proposal_number, appdb_session)

    assert updated.id == original.id
    assert updated.damnit_path == "/new/path"
