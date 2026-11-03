"""Tests checking that cassette MyMdC mock serves the committed cassette data
correctly.
"""

from pathlib import Path

import pytest

from damnit_api._mymdc.clients import MyMdCClientMock, MyMdCMockMissError

from .identity_map import FAKE_USER, RECORDED_PROPOSALS

CASSETTE = Path(__file__).parent / "mymdc.yaml"

pytestmark = pytest.mark.asyncio


@pytest.fixture
def mock_client() -> MyMdCClientMock:
    return MyMdCClientMock(cassette_file=CASSETTE)


async def test_get_proposal_by_number(mock_client):
    proposal = await mock_client.get_proposal_by_number(900000)
    assert proposal.number == 900000
    assert proposal.def_proposal_path is not None


async def test_get_user_by_id_is_scrubbed(mock_client):
    user = await mock_client.get_user_by_id(1101)
    assert user.email == FAKE_USER["email"]
    assert user.name == FAKE_USER["name"]


async def test_get_user_proposals_truncated_to_recorded(mock_client):
    proposals = await mock_client.get_user_proposals("e2etester")
    numbers = [p.proposal_number for p in proposals.root]
    assert sorted(numbers) == sorted(RECORDED_PROPOSALS)


async def test_get_cycle_by_id(mock_client):
    cycle = await mock_client.get_cycle_by_id(474)
    assert cycle is not None


async def test_missing_entity_raises_helpful_error(mock_client):
    with pytest.raises(MyMdCMockMissError, match="re-record"):
        await mock_client._get_proposal_by_number(123456)


async def test_no_cassette_configured_raises(tmp_path):
    client = MyMdCClientMock(cassette_file=tmp_path / "does-not-exist.yaml")
    with pytest.raises(MyMdCMockMissError, match="no cassette"):
        await client._get_user_by_id(1101)
